import {
  Application,
  Container,
  type FederatedPointerEvent,
  Graphics,
  Rectangle,
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
  screenToTile,
  tileCenter,
  tileToScreen,
} from "./iso";
import { ProgrammaticTextureProvider } from "./TextureProvider";
import { buildAvatarSprite, type AvatarSprite } from "./avatar";
import { findPath, nearestWalkable, type WalkGrid } from "./pathfind";

/** Walk speed in grid tiles per second. */
const WALK_SPEED = 4.5;

interface AvatarView {
  id: string;
  isLocal: boolean;
  sprite: AvatarSprite;
  container: Container;
  tag?: Text;
  /** Hash of the config the current art was built from (rebuild on change). */
  configHash: string;
  /** Current fractional grid position (interpolated during walks). */
  pos: { x: number; y: number };
  /** Last position seen on the `position` prop — distinguishes a host-driven
   *  move from a tap-driven walk so art edits don't re-trigger movement. */
  lastPropPos: { x: number; y: number };
  path: GridPosition[];
  pathIndex: number;
  moving: boolean;
  phase: number;
  onArrive?: () => void;
}

export interface RendererCallbacks {
  onReady?: () => void;
  onError?: (err: Error) => void;
  onLoadProgress?: (progress: number) => void;
  onZoneTap?: (zoneKey: ZoneKey) => void;
  onObjectInteract?: (objectId: string, zoneKey: ZoneKey | null) => void;
  onAvatarMove?: (avatarId: string, position: GridPosition) => void;
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
 * Milestone 3 scope: layered avatar compositor, tap-to-move with A*
 * pathfinding, walk + idle animation, and y-sorted depth against zones and
 * decorations. Camera keeps the whole island framed (per the fit-to-viewport
 * requirement); active follow becomes meaningful once pinch/scroll zoom lands.
 */
export class SceneRenderer {
  private app = new Application();
  /** Screen-space backdrop (sky → sea gradient + shimmer) + tap surface. */
  private backdrop = new Container();
  private sky = new Graphics();
  private shimmer = new Graphics();
  private tapSurface = new Container();
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

  /** Static (rebuilt) entities — zones + decorations. Avatars persist. */
  private staticEntities: Container[] = [];
  private avatarViews = new Map<string, AvatarView>();
  private localId: string | null = null;
  private grid: WalkGrid = { walkable: () => false };

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
    this.backdrop.addChild(this.sky, this.shimmer, this.tapSurface);
    this.world.addChild(this.terrain, this.entities);
    this.entities.sortableChildren = true;

    // Full-canvas tap surface (behind the world visually) so taps on water or
    // empty terrain still resolve to a grid cell. Zone/decoration taps sit on
    // top and stop propagation.
    this.tapSurface.eventMode = "static";
    this.tapSurface.on("pointertap", this.handleTap);

    this.opts.onLoadProgress?.(0.2);
    this.textures = new ProgrammaticTextureProvider(this.app.renderer);
    this.textures.refresh(theme.palette);
    this.opts.onLoadProgress?.(0.6);

    this.rebuild();
    this.opts.onLoadProgress?.(1);

    // Single always-on ticker: movement runs even under reduced motion; only
    // decorative bob/shimmer are gated by the reduced-motion flag.
    this.app.ticker.add(this.update);

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

  /** Host imperative: walk the local avatar to a grid cell (pathfinds there). */
  walkLocalAvatarTo(position: GridPosition): void {
    if (!this.inited || this.destroyed || !this.localId) return;
    const view = this.avatarViews.get(this.localId);
    if (!view) return;
    const goal = this.grid.walkable(position.x, position.y)
      ? position
      : nearestWalkable(this.grid, position);
    if (goal) {
      this.walkView(view, goal, () =>
        this.opts.onAvatarMove?.(view.id, { x: goal.x, y: goal.y }),
      );
    }
  }

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
    this.buildGrid();
    // Tear down only the static props; avatar views persist across theme/zone
    // changes so in-progress walks aren't interrupted.
    for (const e of this.staticEntities) e.destroy({ children: true });
    this.staticEntities = [];
    this.buildZones();
    this.buildDecorations();
    // layout.pictureFrameAnchor is an invisible reserved coordinate only —
    // nothing is rendered for it (a future phase docks a video window there).
    this.reconcileAvatars();
    this.fitCamera();
  }

  /** Walkable = land, minus decoration cells and zone footprints (obstacles). */
  private buildGrid(): void {
    const land = new Set(this.layout.landCells.map((c) => `${c.x},${c.y}`));
    const blocked = new Set<string>();
    for (const d of this.layout.decorations ?? []) {
      blocked.add(`${d.position.x},${d.position.y}`);
    }
    for (const z of this.zones) {
      for (let dx = 0; dx < z.footprint.w; dx++) {
        for (let dy = 0; dy < z.footprint.h; dy++) {
          blocked.add(`${z.gridPosition.x + dx},${z.gridPosition.y + dy}`);
        }
      }
    }
    this.grid = {
      walkable: (x, y) => land.has(`${x},${y}`) && !blocked.has(`${x},${y}`),
    };
  }

  private drawBackdrop(): void {
    const { palette } = this.theme;
    const w = this.app.screen.width;
    const h = this.app.screen.height;

    // Keep the tap surface covering the whole canvas.
    this.tapSurface.hitArea = new Rectangle(0, 0, w, h);

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

      // Interactivity: tap walks the local avatar to the entrance, then fires
      // onZoneTap; gentle hover scale (affordance).
      g.eventMode = "static";
      g.cursor = "pointer";
      g.on("pointertap", (e: FederatedPointerEvent) => {
        e.stopPropagation();
        this.requestZoneTap(z);
      });
      g.on("pointerover", () => {
        pad.scale.set(1.05);
      });
      g.on("pointerout", () => {
        pad.scale.set(1);
      });

      this.entities.addChild(pad);
      this.staticEntities.push(pad);
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
      sprite.on("pointertap", (e: FederatedPointerEvent) => {
        e.stopPropagation();
        this.opts.onObjectInteract?.(d.id, null);
      });

      this.entities.addChild(shadow, sprite);
      this.staticEntities.push(shadow, sprite);
    }
  }

  // ── Avatars (persistent views, layered compositor, movement) ────

  private configHash(a: AvatarInstance): string {
    const c = a.config;
    return [
      c.bodyTone, c.hairStyle, c.hairColor, c.outfitKey, c.accessoryKey,
      c.displayColor, a.label ?? "", this.opts.hideTextLabels ? "1" : "0",
    ].join("|");
  }

  private reconcileAvatars(): void {
    this.localId =
      this.avatars.find((a) => a.isLocal)?.id ?? this.avatars[0]?.id ?? null;

    const seen = new Set<string>();
    for (const a of this.avatars) {
      seen.add(a.id);
      const hash = this.configHash(a);
      let view = this.avatarViews.get(a.id);

      // Config/label changed — rebuild the art but carry the runtime state over
      // so an avatar-editor tweak never teleports a mid-walk avatar.
      const prev = view && view.configHash !== hash ? view : undefined;
      if (prev) {
        prev.container.destroy({ children: true });
        view = undefined;
      }

      if (!view) {
        view = this.createAvatarView(a, hash);
        if (prev) {
          view.pos = prev.pos;
          view.lastPropPos = prev.lastPropPos;
          view.path = prev.path;
          view.pathIndex = prev.pathIndex;
          view.moving = prev.moving;
          view.onArrive = prev.onArrive;
          view.phase = prev.phase;
        }
        this.avatarViews.set(a.id, view);
      } else {
        // Re-attach to the (possibly fresh) entities container after a rebuild.
        this.entities.addChild(view.container);
      }

      view.isLocal = a.isLocal;
      view.sprite.setSelected(a.isLocal);

      // Only an actual change to the `position` prop drives movement here
      // (host-driven move). Tap-driven walks are independent of this.
      if (a.position.x !== view.lastPropPos.x || a.position.y !== view.lastPropPos.y) {
        view.lastPropPos = { x: a.position.x, y: a.position.y };
        this.walkView(view, a.position, () =>
          this.opts.onAvatarMove?.(a.id, { x: a.position.x, y: a.position.y }),
        );
      }
      this.placeAvatar(view);
    }

    for (const [id, view] of this.avatarViews) {
      if (!seen.has(id)) {
        view.container.destroy({ children: true });
        this.avatarViews.delete(id);
      }
    }
  }

  private createAvatarView(a: AvatarInstance, hash: string): AvatarView {
    const container = new Container();
    const sprite = buildAvatarSprite(a.config);
    container.addChild(sprite.container);

    let tag: Text | undefined;
    if (a.label && !this.opts.hideTextLabels) {
      tag = new Text({
        text: a.label,
        style: {
          fontFamily: "system-ui, sans-serif",
          fontSize: 11,
          fontWeight: "600",
          fill: hexNum(a.config.displayColor),
        },
      });
      tag.anchor.set(0.5, 1);
      tag.position.set(0, -42);
      container.addChild(tag);
    }

    this.entities.addChild(container);
    return {
      id: a.id,
      isLocal: a.isLocal,
      sprite,
      container,
      tag,
      configHash: hash,
      pos: { x: a.position.x, y: a.position.y },
      lastPropPos: { x: a.position.x, y: a.position.y },
      path: [],
      pathIndex: 0,
      moving: false,
      phase: Math.random() * Math.PI * 2,
    };
  }

  private walkView(view: AvatarView, goal: GridPosition, onArrive?: () => void): void {
    const start = { x: Math.round(view.pos.x), y: Math.round(view.pos.y) };
    const path = findPath(this.grid, start, goal);
    if (!path || path.length === 0) return;
    view.path = path;
    view.pathIndex = 0;
    view.moving = true;
    view.onArrive = onArrive;
  }

  /** Position an avatar container at its current cell with a soft bob. */
  private placeAvatar(view: AvatarView): void {
    const c = tileCenter(view.pos.x, view.pos.y);
    const amp = this.opts.reducedMotion ? 0 : view.moving ? 2.6 : 1.1;
    const bob = Math.abs(Math.sin(view.phase)) * amp;
    view.container.position.set(c.x, c.y - bob);
    view.container.zIndex = depth(view.pos.x, view.pos.y) + 0.3;
  }

  // ── Interaction ─────────────────────────────────────────────────

  private handleTap = (e: FederatedPointerEvent): void => {
    if (!this.localId) return;
    const local = this.avatarViews.get(this.localId);
    if (!local) return;
    const p = this.world.toLocal(e.global);
    const tile = screenToTile(p.x, p.y);

    const zone = this.zoneAt(tile.x, tile.y);
    if (zone) {
      this.requestZoneTap(zone);
      return;
    }
    if (this.grid.walkable(tile.x, tile.y)) {
      this.walkView(local, tile, () =>
        this.opts.onAvatarMove?.(local.id, { x: tile.x, y: tile.y }),
      );
    }
  };

  private requestZoneTap(zone: ZoneInstance): void {
    if (!this.localId) {
      this.opts.onZoneTap?.(zone.key);
      return;
    }
    const local = this.avatarViews.get(this.localId);
    const center = {
      x: Math.floor(zone.gridPosition.x + zone.footprint.w / 2),
      y: Math.floor(zone.gridPosition.y + zone.footprint.h / 2),
    };
    const entrance = nearestWalkable(this.grid, center);
    if (local && entrance) {
      this.walkView(local, entrance, () => this.opts.onZoneTap?.(zone.key));
    } else {
      this.opts.onZoneTap?.(zone.key);
    }
  }

  private zoneAt(x: number, y: number): ZoneInstance | null {
    for (const z of this.zones) {
      if (
        x >= z.gridPosition.x &&
        x < z.gridPosition.x + z.footprint.w &&
        y >= z.gridPosition.y &&
        y < z.gridPosition.y + z.footprint.h
      ) {
        return z;
      }
    }
    return null;
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

  // ── Per-frame update (movement always; bob/shimmer gated) ───────

  private update = (ticker: Ticker): void => {
    const dt = ticker.deltaMS / 1000;
    this.elapsed += ticker.deltaMS;

    for (const view of this.avatarViews.values()) {
      this.advanceAvatar(view, dt);
    }

    if (!this.opts.reducedMotion) this.drawShimmer();
  };

  private advanceAvatar(view: AvatarView, dt: number): void {
    if (view.moving) {
      const target = view.path[view.pathIndex];
      const dx = target.x - view.pos.x;
      const dy = target.y - view.pos.y;
      const dist = Math.hypot(dx, dy);
      const step = WALK_SPEED * dt;
      if (dist <= step || dist === 0) {
        view.pos.x = target.x;
        view.pos.y = target.y;
        view.pathIndex++;
        if (view.pathIndex >= view.path.length) {
          view.moving = false;
          view.path = [];
          const cb = view.onArrive;
          view.onArrive = undefined;
          cb?.();
        }
      } else {
        view.pos.x += (dx / dist) * step;
        view.pos.y += (dy / dist) * step;
      }
    }
    // Advance the bob phase (faster cadence while walking).
    view.phase += dt * (view.moving ? 11 : 2.2);
    this.placeAvatar(view);
  }

  /** Gentle sea shimmer behind the island (full ambient pass is Milestone 4). */
  private drawShimmer(): void {
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
  }

  // ── Teardown ────────────────────────────────────────────────────

  destroy(): void {
    this.destroyed = true;
    if (this.inited) this.teardown();
  }

  private teardown(): void {
    if (this.tornDown) return;
    this.tornDown = true;
    try {
      this.app.ticker.remove(this.update);
      this.tapSurface.off("pointertap", this.handleTap);
    } catch {
      /* ticker/listeners may not be attached */
    }
    this.textures?.destroy();
    try {
      this.app.destroy({ removeView: true }, { children: true });
    } catch {
      /* already torn down */
    }
  }
}
