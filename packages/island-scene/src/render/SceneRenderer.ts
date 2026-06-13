import {
  Application,
  Container,
  Graphics,
  Sprite,
  Text,
  type Ticker,
} from "pixi.js";
import type {
  AvatarInstance,
  GridPosition,
  LayoutConfig,
  ThemePackConfig,
  ZoneInstance,
  ZoneKey,
} from "../types";
import { CLIFF, TILE_H, TILE_W } from "./constants";
import {
  depth,
  diamondPoly,
  footprintCenter,
  hexNum,
  lerpHex,
  shade,
  tileCenter,
  tileToScreen,
} from "./iso";
import { ProgrammaticTextureProvider } from "./TextureProvider";

export interface RendererCallbacks {
  onReady?: () => void;
  onError?: (err: Error) => void;
  onLoadProgress?: (progress: number) => void;
  onZoneTap?: (zoneKey: ZoneKey) => void;
  onObjectInteract?: (objectId: string, zoneKey: ZoneKey | null) => void;
}

export interface RendererOptions extends RendererCallbacks {
  container: HTMLElement;
  reducedMotion: boolean;
  hideTextLabels: boolean;
}

/**
 * Owns the PixiJS scene graph for one IslandScene. Plain TS (no React) so the
 * React wrapper stays a thin lifecycle/prop bridge.
 *
 * Milestone 2 scope: terrain from layout, six zones placed + interactive,
 * decorations, live theme-pack palette swapping, gentle water shimmer.
 * Avatars render as simple position markers — the layered compositor and
 * tap-to-move land in Milestone 3.
 */
export class SceneRenderer {
  private app = new Application();
  /** Screen-space backdrop (sky → sea gradient + shimmer). */
  private backdrop = new Container();
  private sky = new Graphics();
  private shimmer = new Graphics();
  /** Camera-panned world. */
  private world = new Container();
  private terrain = new Graphics();
  /** y-sorted props: zones, decorations, avatars. */
  private entities = new Container();

  private textures!: ProgrammaticTextureProvider;
  private theme!: ThemePackConfig;
  private layout!: LayoutConfig;
  private zones: ZoneInstance[] = [];
  private avatars: AvatarInstance[] = [];

  private inited = false;
  private destroyed = false;
  private tornDown = false;
  private elapsed = 0;

  constructor(private opts: RendererOptions) {}

  async init(
    theme: ThemePackConfig,
    layout: LayoutConfig,
    zones: ZoneInstance[],
    avatars: AvatarInstance[],
  ): Promise<void> {
    this.theme = theme;
    this.layout = layout;
    this.zones = zones;
    this.avatars = avatars;

    try {
      await this.app.init({
        resizeTo: this.opts.container,
        antialias: true,
        background: hexNum(theme.palette.water),
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
    this.opts.container.appendChild(this.app.canvas);
    this.app.stage.addChild(this.backdrop, this.world);
    this.backdrop.addChild(this.sky, this.shimmer);
    this.world.addChild(this.terrain, this.entities);
    this.entities.sortableChildren = true;

    this.opts.onLoadProgress?.(0.2);
    this.textures = new ProgrammaticTextureProvider(this.app.renderer);
    this.textures.refresh(theme.palette);
    this.opts.onLoadProgress?.(0.6);

    this.rebuild();
    this.opts.onLoadProgress?.(1);

    if (!this.opts.reducedMotion) this.app.ticker.add(this.tick);

    this.opts.onReady?.();
  }

  // ── Prop updates ────────────────────────────────────────────────

  setTheme(theme: ThemePackConfig): void {
    if (!this.inited || this.destroyed) return;
    this.theme = theme;
    this.app.renderer.background.color = hexNum(theme.palette.water);
    this.textures.refresh(theme.palette);
    this.rebuild();
  }

  setZones(zones: ZoneInstance[]): void {
    if (!this.inited || this.destroyed) return;
    this.zones = zones;
    this.rebuild();
  }

  setLayout(layout: LayoutConfig): void {
    if (!this.inited || this.destroyed) return;
    this.layout = layout;
    this.rebuild();
  }

  setAvatars(avatars: AvatarInstance[]): void {
    if (!this.inited || this.destroyed) return;
    this.avatars = avatars;
    this.rebuild();
  }

  /** Movement lands in Milestone 3; stubbed so the host handle is stable. */
  walkLocalAvatarTo(_position: GridPosition): void {}

  resize(): void {
    if (!this.inited || this.destroyed) return;
    this.app.resize();
    this.drawBackdrop();
    this.fitCamera();
  }

  // ── Build ───────────────────────────────────────────────────────

  private rebuild(): void {
    this.drawBackdrop();
    this.drawTerrain();
    this.entities.removeChildren().forEach((c) => c.destroy({ children: true }));
    this.buildZones();
    this.buildDecorations();
    // layout.pictureFrameAnchor is an invisible reserved coordinate only —
    // nothing is rendered for it (a future phase docks a video window there).
    this.buildAvatars();
    this.fitCamera();
  }

  private drawBackdrop(): void {
    const { palette } = this.theme;
    const w = this.app.screen.width;
    const h = this.app.screen.height;

    // Fake a vertical gradient (sky → sea) with stacked bands — robust across
    // Pixi minor versions without depending on the gradient-fill API shape.
    this.sky.clear();
    const bands = 24;
    for (let i = 0; i < bands; i++) {
      const t = i / (bands - 1);
      const color =
        t < 0.55
          ? lerpHex(palette.skyTop, palette.skyBottom, t / 0.55)
          : lerpHex(palette.skyBottom, palette.water, (t - 0.55) / 0.45);
      this.sky.rect(0, (h * i) / bands, w, h / bands + 1).fill(color);
    }
  }

  private drawTerrain(): void {
    const { palette } = this.theme;
    const cliff = shade(palette.land, -0.4);
    const cliffShade = shade(palette.land, -0.55);
    const edge = shade(palette.foliage, -0.1);

    // Unified grassy land with gentle, low-frequency variation — soft and
    // organic, never an alternating tile pattern. Amplitude is tiny (±~3%).
    const landTone = (gx: number, gy: number) => {
      const n =
        Math.sin(gx * 0.55 + gy * 0.32) * 0.5 +
        Math.sin((gx + gy) * 0.22) * 0.5;
      return shade(palette.land, n * 0.03);
    };

    const lookup = new Set(
      this.layout.landCells.map((c) => `${c.x},${c.y}`),
    );
    const isLand = (x: number, y: number) => lookup.has(`${x},${y}`);

    this.terrain.clear();

    // Sort back-to-front so cliffs overlap correctly.
    const cells = [...this.layout.landCells].sort(
      (a, b) => depth(a.x, a.y) - depth(b.x, b.y),
    );

    for (const c of cells) {
      const { x, y } = tileToScreen(c.x, c.y);
      // Cliff skirt under both front-facing edges. Drawn for every tile;
      // back-to-front order means interior skirts are covered by the tiles in
      // front, leaving a solid raised plateau with thickness at the coast.
      this.terrain
        .poly([
          x - TILE_W / 2, y + TILE_H / 2,
          x, y + TILE_H,
          x, y + TILE_H + CLIFF,
          x - TILE_W / 2, y + TILE_H / 2 + CLIFF,
        ])
        .fill(cliffShade);
      this.terrain
        .poly([
          x, y + TILE_H,
          x + TILE_W / 2, y + TILE_H / 2,
          x + TILE_W / 2, y + TILE_H / 2 + CLIFF,
          x, y + TILE_H + CLIFF,
        ])
        .fill(cliff);
      // Top face: unified land tone with soft organic variation.
      this.terrain.poly(diamondPoly(c.x, c.y)).fill(landTone(c.x, c.y));
    }

    // Soft outline pass along the coast for a storybook edge.
    for (const c of cells) {
      if (!isLand(c.x - 1, c.y) || !isLand(c.x, c.y - 1)) {
        this.terrain
          .poly(diamondPoly(c.x, c.y))
          .stroke({ width: 1, color: edge, alpha: 0.25 });
      }
    }
  }

  private buildZones(): void {
    const { palette } = this.theme;
    for (let i = 0; i < this.zones.length; i++) {
      const z = this.zones[i];
      const skin = this.theme.zoneSkins[z.key];
      const overrides = skin?.paletteOverrides;
      const pad = new Container();
      const center = footprintCenter(z.gridPosition, z.footprint.w, z.footprint.h);
      pad.position.set(center.x, center.y);
      pad.zIndex =
        depth(
          z.gridPosition.x + z.footprint.w / 2,
          z.gridPosition.y + z.footprint.h / 2,
        ) + 0.1;

      // Per-zone hue: rotate the accent slightly so the six zones read apart
      // while staying inside the pack's palette family.
      const baseTone = overrides?.landAlt ?? palette.landAlt;
      const tint = lerpHex(baseTone, palette.accent, 0.18 + (i % 3) * 0.12);

      const halfW = (z.footprint.w * TILE_W) / 2;
      const halfH = (z.footprint.h * TILE_H) / 2;

      const g = new Graphics();
      // Diamond-ish pad matching the footprint, lifted a touch for relief.
      const lift = 6;
      g.poly([
        0, -halfH - lift,
        halfW, -lift,
        0, halfH - lift,
        -halfW, -lift,
      ])
        .fill({ color: tint, alpha: z.unlocked ? 1 : 0.5 });
      // Glow ring affordance (full hover/keyboard polish is Milestone 4).
      g.poly([
        0, -halfH - lift,
        halfW, -lift,
        0, halfH - lift,
        -halfW, -lift,
      ]).stroke({
        width: 2,
        color: hexNum(overrides?.accent ?? palette.accent),
        alpha: z.unlocked ? 0.9 : 0.4,
      });
      pad.addChild(g);

      if (!z.unlocked) {
        const lock = new Graphics();
        lock.roundRect(-7, -4 - lift, 14, 11, 3).fill({ color: hexNum(palette.ink), alpha: 0.55 });
        lock.rect(-4, -9 - lift, 8, 6).stroke({ width: 2, color: hexNum(palette.ink), alpha: 0.55 });
        pad.addChild(lock);
      }

      if (!this.opts.hideTextLabels) {
        const label = new Text({
          text: z.unlocked ? z.skinName : `${z.skinName} (locked)`,
          style: {
            fontFamily: "system-ui, sans-serif",
            fontSize: 13,
            fontWeight: "700",
            fill: hexNum(palette.ink),
            align: "center",
          },
        });
        label.anchor.set(0.5, 1);
        label.position.set(0, -halfH - lift - 6);
        label.alpha = z.unlocked ? 1 : 0.7;
        pad.addChild(label);
      }

      // Interactivity: tap fires onZoneTap; gentle hover scale (affordance).
      g.eventMode = "static";
      g.cursor = "pointer";
      g.on("pointertap", () => this.opts.onZoneTap?.(z.key));
      g.on("pointerover", () => {
        pad.scale.set(1.05);
      });
      g.on("pointerout", () => {
        pad.scale.set(1);
      });

      this.entities.addChild(pad);
    }
  }

  private buildDecorations(): void {
    const decos = this.layout.decorations ?? [];
    for (const d of decos) {
      const tex = this.textures.getDecoration(d.kind);
      const sprite = new Sprite(tex);
      sprite.anchor.set(0.5, 1);
      const c = tileCenter(d.position.x, d.position.y);
      sprite.position.set(c.x, c.y);
      sprite.scale.set(d.scale ?? 1);
      if (d.rotation) sprite.angle = d.rotation;
      sprite.zIndex = depth(d.position.x, d.position.y) + 0.2;

      // Soft contact shadow.
      const shadow = new Graphics();
      shadow.ellipse(c.x, c.y, 12 * (d.scale ?? 1), 5 * (d.scale ?? 1)).fill({ color: 0x000000, alpha: 0.18 });
      shadow.zIndex = sprite.zIndex - 0.01;

      sprite.eventMode = "static";
      sprite.cursor = "pointer";
      sprite.on("pointertap", () => this.opts.onObjectInteract?.(d.id, null));

      this.entities.addChild(shadow, sprite);
    }
  }

  private buildAvatars(): void {
    for (const a of this.avatars) {
      const c = tileCenter(a.position.x, a.position.y);
      const marker = new Container();
      marker.position.set(c.x, c.y);
      marker.zIndex = depth(a.position.x, a.position.y) + 0.3;

      // Placeholder "pawn" — the layered compositor replaces this in M3.
      const shadow = new Graphics();
      shadow.ellipse(0, 0, 11, 5).fill({ color: 0x000000, alpha: 0.22 });
      const body = new Graphics();
      body.roundRect(-8, -22, 16, 20, 8).fill(hexNum(a.config.displayColor));
      body.circle(0, -26, 7).fill(shade(a.config.displayColor, 0.25));
      body
        .roundRect(-8, -22, 16, 20, 8)
        .stroke({ width: 1.5, color: shade(a.config.displayColor, -0.3), alpha: 0.6 });
      marker.addChild(shadow, body);

      if (a.label && !this.opts.hideTextLabels) {
        const tag = new Text({
          text: a.label,
          style: { fontFamily: "system-ui, sans-serif", fontSize: 11, fontWeight: "600", fill: hexNum(this.theme.palette.ink) },
        });
        tag.anchor.set(0.5, 1);
        tag.position.set(0, -36);
        marker.addChild(tag);
      }

      this.entities.addChild(marker);
    }
  }

  /**
   * Scale + center the world so the whole island fits inside the viewport
   * with margin — never scrolls off-screen, never overflows the canvas.
   * (Pinch/scroll zoom on top of this is a later milestone.)
   */
  private fitCamera(): void {
    const cells = this.layout.landCells;
    if (cells.length === 0) return;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const c of cells) {
      const { x, y } = tileToScreen(c.x, c.y);
      minX = Math.min(minX, x - TILE_W / 2);
      maxX = Math.max(maxX, x + TILE_W / 2);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y + TILE_H + CLIFF);
    }
    // Headroom above the top tile for zone/avatar labels that overhang it.
    minY -= 56;

    const bboxW = Math.max(1, maxX - minX);
    const bboxH = Math.max(1, maxY - minY);
    const sw = this.app.screen.width;
    const sh = this.app.screen.height;
    const margin = 40;

    // Fit to whichever axis is tighter; cap so it never balloons on big screens.
    const scale = Math.min(
      (sw - margin * 2) / bboxW,
      (sh - margin * 2) / bboxH,
      1.4,
    );
    const s = scale > 0 && Number.isFinite(scale) ? scale : 1;
    this.world.scale.set(s);

    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    this.world.position.set(sw / 2 - cx * s, sh / 2 - cy * s);
  }

  // ── Idle motion ─────────────────────────────────────────────────

  private tick = (ticker: Ticker): void => {
    this.elapsed += ticker.deltaMS;
    // Gentle sea shimmer behind the island (cheap, full ambient pass is M4).
    const w = this.app.screen.width;
    const h = this.app.screen.height;
    const { palette } = this.theme;
    this.shimmer.clear();
    const rows = 5;
    for (let i = 0; i < rows; i++) {
      const yy = h * (0.62 + (i / rows) * 0.36);
      const phase = this.elapsed / 1400 + i * 0.9;
      const alpha = 0.05 + 0.05 * (0.5 + 0.5 * Math.sin(phase));
      const dx = Math.sin(phase) * 14;
      this.shimmer
        .ellipse(w / 2 + dx, yy, w * 0.4, 6)
        .fill({ color: hexNum(palette.waterShimmer), alpha });
    }
  };

  // ── Teardown ────────────────────────────────────────────────────

  destroy(): void {
    this.destroyed = true;
    if (this.inited) this.teardown();
  }

  private teardown(): void {
    if (this.tornDown) return;
    this.tornDown = true;
    try {
      this.app.ticker.remove(this.tick);
    } catch {
      /* ticker may not be running */
    }
    this.textures?.destroy();
    try {
      this.app.destroy({ removeView: true }, { children: true });
    } catch {
      /* already torn down */
    }
  }
}
