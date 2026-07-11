import { Application, Assets, Container, Graphics, Rectangle, Sprite, type Texture } from "pixi.js";
import { BuildEngineView } from "../build-engine/BuildEngineView";
import type { BuildEvent, BuildState } from "../build-engine/types";
import { ArrivalView } from "../render/ArrivalView";
import { flatten, insetLoop, islandOutline } from "../render/coast";
import { CLIFF } from "../render/constants";
import { debugLog } from "../render/debug";
import { hexNum, screenToTile, shade, tileCenter, tileToScreen } from "../render/iso";
import { ARRIVAL_BG_URL, BOAT_ART, LANDMARK_ART } from "../render/zones";
import {
  buildLandCells,
  buildRegion,
  buildableCells,
  DOCK_ANCHOR,
  isBuildLand,
} from "./layout";

/**
 * BuildSceneRenderer — the free-build island (Session 5). A deliberately
 * small renderer: sky/sea backdrop, a fixed little island (open meadow +
 * beach), the arrival dock, and the BuildEngineView's three layers. Fully
 * offline; One Law in full (the only persistence is the save slots, owned by
 * the React host).
 *
 * The camera is fixed: the island always fits the viewport (no pan/pinch —
 * the whole sandtray stays in view, which is the point of a sandtray).
 *
 * Boat transition: the same ArrivalView cinematic the main island uses —
 * sail in on entry, sail out ("depart") when the child heads home.
 */

const INK = 0x23201c;

export interface BuildSceneOptions {
  container: HTMLElement;
  reducedMotion: boolean;
  onEvent: (event: BuildEvent) => void;
  /** A tap landed on a buildable cell (not on a placed item or selection UI).
   *  The host places its armed palette item here — the tap-to-place flow that
   *  works on every input type. */
  onCellTap?: (cell: { x: number; y: number }) => void;
  onReady?: () => void;
  onError?: (err: Error) => void;
}

export class BuildSceneRenderer {
  private app = new Application();
  private backdrop = new Graphics();
  private world = new Container();
  private terrain = new Graphics();
  private waves = new Graphics();
  private dock?: Sprite;
  readonly view: BuildEngineView;

  private arrivalView?: ArrivalView;
  private arrivalDone?: () => void;
  private boatTex?: Texture;
  private arrivalBgTex?: Texture;

  private inited = false;
  private destroyed = false;
  private tornDown = false;
  private elapsed = 0;
  // Tap-vs-drag tracking (drag does nothing — fixed camera — but a scroll
  // must not read as a tap).
  private pointerDown = false;
  private pointerMoved = false;
  private downX = 0;
  private downY = 0;

  constructor(private opts: BuildSceneOptions) {
    this.view = new BuildEngineView({
      region: buildRegion,
      buildableCells,
      onEvent: opts.onEvent,
      reducedMotion: opts.reducedMotion,
    });
  }

  async init(): Promise<void> {
    try {
      await this.app.init({
        resizeTo: this.opts.container,
        antialias: true,
        background: 0x2d7a9e,
        autoDensity: true,
        resolution: Math.min(window.devicePixelRatio || 1, 2),
      });
    } catch (err) {
      this.opts.onError?.(err as Error);
      return;
    }
    this.inited = true;
    if (this.destroyed) {
      this.teardown();
      return;
    }
    this.app.canvas.style.display = "block";
    // touch-action is scoped to the CANVAS only: gestures on the island never
    // scroll the page, while the DOM chrome around it (palette row) keeps its
    // own pan behavior.
    this.app.canvas.style.touchAction = "none";
    this.opts.container.appendChild(this.app.canvas);
    this.app.stage.addChild(this.backdrop, this.world);
    this.world.addChild(this.terrain, this.waves, this.view.gridLayer, this.view.itemLayer, this.view.uiLayer);
    this.app.stage.eventMode = "static";
    this.app.stage.on("pointerdown", this.onPointerDown);
    this.app.stage.on("pointermove", this.onPointerMove);
    this.app.stage.on("pointerup", this.onPointerUp);
    this.app.stage.on("pointerupoutside", this.onPointerUp);

    // Dock sprite (reuses the main island's welcome-dock art) + cinematic art.
    await Promise.all([
      (async () => {
        try {
          const tex = (await Assets.load(LANDMARK_ART.welcome_dock.url)) as Texture;
          if (this.destroyed) return;
          const cfg = LANDMARK_ART.welcome_dock;
          const spr = new Sprite(tex);
          spr.anchor.set(cfg.anchorX, cfg.anchorY);
          spr.scale.set(cfg.scale * 0.8); // a smaller island gets a smaller dock
          const c = tileCenter(DOCK_ANCHOR.x, DOCK_ANCHOR.y);
          spr.position.set(c.x, c.y);
          spr.zIndex = c.y + 0.05;
          this.dock = spr;
          this.view.itemLayer.addChild(spr); // y-sorts with placements
        } catch (err) {
          console.warn("[build-island] dock art failed to load", err);
        }
      })(),
      (async () => {
        try {
          this.boatTex = (await Assets.load(BOAT_ART.url)) as Texture;
        } catch {
          /* missing boat → cinematic skips (same guard as the main island) */
        }
      })(),
      (async () => {
        try {
          this.arrivalBgTex = (await Assets.load(ARRIVAL_BG_URL)) as Texture;
        } catch {
          /* missing bg → cinematic skips */
        }
      })(),
    ]);
    if (this.destroyed) {
      this.teardown();
      return;
    }

    this.drawBackdrop();
    this.drawTerrain();
    this.layoutCamera();
    this.app.ticker.add(this.update);
    this.opts.onReady?.();
  }

  // ── Cinematics (sail in / sail home) ────────────────────────────

  /** Play the sail cinematic; `done` fires when it finishes (or immediately
   *  under reduced motion / missing art — the same skip guard as X4). */
  playSail(mode: "arrive" | "depart", done: () => void): void {
    if (!this.inited || this.destroyed) {
      done();
      return;
    }
    if (this.opts.reducedMotion || !this.boatTex || !this.arrivalBgTex) {
      done();
      return;
    }
    this.arrivalView?.destroy();
    this.arrivalView = new ArrivalView(this.opts.reducedMotion);
    this.app.stage.addChild(this.arrivalView.container);
    this.arrivalView.enter(
      this.arrivalBgTex, this.boatTex,
      this.app.screen.width, this.app.screen.height, mode,
    );
    this.arrivalDone = done;
    debugLog(`[build-island] sail ${mode}`);
  }

  // ── State passthrough (the host owns state; we just display it) ──

  setState(state: BuildState): void {
    this.view.setState(state);
  }

  reset(state: BuildState): void {
    this.view.reset(state);
  }

  /** Grid cell under a CLIENT coordinate (palette drag-drop), or null when
   *  off-island / not buildable. */
  cellFromClient(clientX: number, clientY: number): { x: number; y: number } | null {
    if (!this.inited || this.destroyed) return null;
    const rect = this.app.canvas.getBoundingClientRect();
    const sx = clientX - rect.left;
    const sy = clientY - rect.top;
    const wx = (sx - this.world.position.x) / this.world.scale.x;
    const wy = (sy - this.world.position.y) / this.world.scale.y;
    const tile = screenToTile(wx, wy);
    return buildRegion.buildable(tile.x, tile.y) ? tile : null;
  }

  resize(): void {
    if (!this.inited || this.destroyed) return;
    this.app.resize();
    this.drawBackdrop();
    this.layoutCamera();
    this.arrivalView?.resize(this.app.screen.width, this.app.screen.height);
  }

  destroy(): void {
    this.destroyed = true;
    if (this.inited) this.teardown();
  }

  private teardown(): void {
    if (this.tornDown) return;
    this.tornDown = true;
    try {
      this.app.ticker.remove(this.update);
      this.app.stage.off("pointerdown", this.onPointerDown);
      this.app.stage.off("pointermove", this.onPointerMove);
      this.app.stage.off("pointerup", this.onPointerUp);
      this.app.stage.off("pointerupoutside", this.onPointerUp);
    } catch {
      /* not attached */
    }
    this.arrivalView?.destroy();
    try {
      this.app.destroy({ removeView: true }, { children: true });
    } catch {
      /* already torn down */
    }
  }

  // ── Input ────────────────────────────────────────────────────────

  private onPointerDown = (e: { global: { x: number; y: number } }): void => {
    if (this.arrivalView && !this.arrivalView.done) {
      this.arrivalView.skip();
      return;
    }
    this.pointerDown = true;
    this.pointerMoved = false;
    this.downX = e.global.x;
    this.downY = e.global.y;
  };

  private onPointerMove = (e: { global: { x: number; y: number } }): void => {
    if (this.pointerDown && Math.hypot(e.global.x - this.downX, e.global.y - this.downY) > 7) {
      this.pointerMoved = true;
    }
  };

  private onPointerUp = (e: { global: { x: number; y: number } }): void => {
    const wasTap = this.pointerDown && !this.pointerMoved;
    this.pointerDown = false;
    if (!wasTap || (this.arrivalView && !this.arrivalView.done)) return;
    const wx = (e.global.x - this.world.position.x) / this.world.scale.x;
    const wy = (e.global.y - this.world.position.y) / this.world.scale.y;
    // Selection UI / placed items first; an unconsumed tap on a buildable
    // cell goes to the host (tap-to-place with the armed palette item).
    if (this.view.handleTap(wx, wy)) return;
    const cell = this.view.cellAt(wx, wy);
    if (cell) this.opts.onCellTap?.(cell);
  };

  // ── Painting ─────────────────────────────────────────────────────

  private drawBackdrop(): void {
    const w = this.app.screen.width;
    const h = this.app.screen.height;
    this.app.stage.hitArea = new Rectangle(0, 0, w, h);
    this.backdrop.clear();
    const bands = 18;
    for (let i = 0; i < bands; i++) {
      const t = i / (bands - 1);
      const color =
        t < 0.45
          ? hexNum(shade("#ffe9c4", -t * 0.12))
          : hexNum(shade("#2d7a9e", (t - 0.45) * 0.25));
      this.backdrop.rect(0, (h * i) / bands, w, h / bands + 1).fill(color);
    }
  }

  /** The little island: cliff band, sandy base, meadow inset, bold coast. */
  private drawTerrain(): void {
    const loop = islandOutline(buildLandCells);
    this.terrain.clear();
    if (loop.length < 4) return;
    this.terrain.poly(flatten(loop, 0, CLIFF + 6)).fill(shade("#a8c46a", -0.5));
    this.terrain.poly(flatten(loop)).fill("#ecdcae"); // beach ring
    this.terrain.poly(flatten(loop)).stroke({ width: 5, color: INK, alpha: 0.9 });
    this.terrain.poly(flatten(insetLoop(loop, 0.16))).fill("#a8d46a"); // open meadow
  }

  private drawWaves(): void {
    const loop = islandOutline(buildLandCells);
    this.waves.clear();
    if (loop.length < 4) return;
    const a = 0.18 + 0.12 * (0.5 + 0.5 * Math.sin(this.elapsed / 900));
    this.waves.poly(flatten(insetLoop(loop, -0.04))).stroke({ width: 3, color: 0xbfe8f2, alpha: a });
  }

  /** Fixed camera: fit the island into the viewport with margin. */
  private layoutCamera(): void {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const c of buildLandCells) {
      const p = tileToScreen(c.x, c.y);
      minX = Math.min(minX, p.x - 32);
      maxX = Math.max(maxX, p.x + 32);
      minY = Math.min(minY, p.y - 60); // headroom for placed structures
      maxY = Math.max(maxY, p.y + 16 + CLIFF);
    }
    const sw = this.app.screen.width;
    const sh = this.app.screen.height;
    const margin = 30;
    const scale = Math.min(
      (sw - margin * 2) / (maxX - minX),
      (sh - margin * 2) / (maxY - minY),
    );
    this.world.scale.set(scale);
    this.world.position.set(
      sw / 2 - ((minX + maxX) / 2) * scale,
      sh / 2 - ((minY + maxY) / 2) * scale,
    );
  }

  private update = (ticker: { deltaMS: number }): void => {
    const dt = Math.min(0.05, ticker.deltaMS / 1000);
    this.elapsed += ticker.deltaMS;
    if (!this.opts.reducedMotion) this.drawWaves();
    if (this.arrivalView) {
      this.arrivalView.update(dt);
      if (this.arrivalView.done) {
        const cb = this.arrivalDone;
        this.arrivalDone = undefined;
        this.arrivalView.destroy();
        this.arrivalView = undefined;
        cb?.();
      }
    }
  };
}
