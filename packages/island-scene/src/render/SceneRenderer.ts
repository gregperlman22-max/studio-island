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
import { biomeAt, landContext } from "./biome";
import { buildZoneScene } from "./zones";
import { findPath, nearestWalkable, type WalkGrid } from "./pathfind";

/** Walk speed in grid tiles per second. */
const WALK_SPEED = 4.5;
/** Avatar art scale — chunky + readable relative to the tiles. */
const AVATAR_SCALE = 1.6;
/** Pointer travel (px) beyond which a press becomes a pan, not a tap. */
const DRAG_THRESHOLD = 7;

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
 * A large, explorable island: the camera shows a region at a comfortable
 * zoom, eases to follow the local avatar, and can be dragged to pan (clamped
 * to the island). Layered avatar compositor, A* tap-to-move, characterful
 * per-zone art, and y-sorted depth.
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
  /** Ambient firefly overlay (world space, drawn above props). */
  private fireflies = new Container();
  private fireflyDots: {
    g: Graphics; cx: number; cy: number; rx: number; ry: number; phase: number; speed: number;
  }[] = [];

  private textures!: ProgrammaticTextureProvider;
  private theme!: ThemePackConfig;
  private layout!: LayoutConfig;
  private zones: ZoneInstance[] = [];
  private avatars: AvatarInstance[] = [];

  /** Static (rebuilt) entities — zones + decorations. Avatars persist. */
  private staticEntities: Container[] = [];
  private avatarViews = new Map<string, AvatarView>();
  private zoneScenes = new Map<ZoneKey, { setHover: (h: boolean) => void }>();
  private hoveredZone: ZoneKey | null = null;
  private localId: string | null = null;
  private grid: WalkGrid = { walkable: () => false };

  // ── Camera (zoom + eased follow + drag pan, clamped to world) ──
  private camScale = 1;
  private camX = 0;
  private camY = 0;
  private followEnabled = true;
  private cameraInit = false;
  private worldBounds = { minX: 0, maxX: 0, minY: 0, maxY: 0 };

  // Pointer drag state.
  private pointerDown = false;
  private pointerMoved = false;
  private downX = 0;
  private downY = 0;
  private lastX = 0;
  private lastY = 0;

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
    this.world.addChild(this.terrain, this.entities, this.fireflies);
    this.entities.sortableChildren = true;

    // Unified pointer handling on the stage: press + release without travel is
    // a tap (walk / zone / object); press + drag pans the camera. Zones and
    // decorations are non-interactive — everything is hit-tested here so drag
    // and tap never conflict.
    this.app.stage.eventMode = "static";
    this.app.stage.on("pointerdown", this.onPointerDown);
    this.app.stage.on("pointermove", this.onPointerMove);
    this.app.stage.on("pointerup", this.onPointerUp);
    this.app.stage.on("pointerupoutside", this.onPointerUp);

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
      this.followEnabled = true;
      this.walkView(view, goal, () =>
        this.opts.onAvatarMove?.(view.id, { x: goal.x, y: goal.y }),
      );
    }
  }

  resize(): void {
    if (!this.inited || this.destroyed) return;
    this.app.resize();
    this.drawBackdrop();
    this.updateCamScale();
    this.clampCamera();
    this.applyCamera();
  }

  // ── Build ───────────────────────────────────────────────────────

  private rebuild(): void {
    this.drawBackdrop();
    this.drawTerrain();
    this.buildGrid();
    this.computeWorldBounds();
    // Tear down only the static props; avatar views persist across theme/zone
    // changes so in-progress walks aren't interrupted.
    for (const e of this.staticEntities) e.destroy({ children: true });
    this.staticEntities = [];
    this.zoneScenes.clear();
    this.buildZones();
    this.buildDecorations();
    // layout.pictureFrameAnchor is an invisible reserved coordinate only —
    // nothing is rendered for it (a future phase docks a video window there).
    this.reconcileAvatars();
    this.buildFireflies();
    this.setupCamera();
  }

  /** Soft fireflies drifting near the cave (Worry Hollow) — calm, magical. */
  private buildFireflies(): void {
    this.fireflies.removeChildren().forEach((c) => c.destroy());
    this.fireflyDots = [];
    const hollow = this.zones.find((z) => z.key === "worry_hollow");
    if (!hollow) return;
    const c = footprintCenter(hollow.gridPosition, hollow.footprint.w, hollow.footprint.h);
    for (let i = 0; i < 11; i++) {
      const g = new Graphics();
      g.circle(0, 0, 2.2).fill({ color: 0xfff0a0, alpha: 0.9 });
      g.circle(0, 0, 4.5).fill({ color: 0xffe07a, alpha: 0.25 });
      const cx = c.x + (Math.random() - 0.5) * hollow.footprint.w * TILE_W * 0.9;
      const cy = c.y - 6 + (Math.random() - 0.5) * hollow.footprint.h * TILE_H * 0.9;
      g.position.set(cx, cy);
      this.fireflies.addChild(g);
      this.fireflyDots.push({
        g, cx, cy,
        rx: 6 + Math.random() * 10,
        ry: 4 + Math.random() * 7,
        phase: Math.random() * Math.PI * 2,
        speed: 0.4 + Math.random() * 0.5,
      });
    }
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

    // Stage hit area covers the whole canvas so empty taps/pans register.
    this.app.stage.hitArea = new Rectangle(0, 0, w, h);

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

    // Warm golden-hour glow from the upper area + a soft edge vignette so the
    // whole world reads calm and sun-bathed.
    for (let i = 0; i < 4; i++) {
      this.sky
        .ellipse(w * 0.5, h * 0.12, w * (0.5 - i * 0.08), h * (0.34 - i * 0.05))
        .fill({ color: 0xffe9b0, alpha: 0.08 });
    }
    const vig = Math.max(w, h);
    this.sky.rect(0, 0, w, h).fill({ color: 0x000000, alpha: 0 });
    this.sky.ellipse(w / 2, h / 2, vig * 0.62, vig * 0.62).fill({ color: 0xffd98a, alpha: 0.05 });
  }

  private drawTerrain(): void {
    const { palette } = this.theme;
    const cliff = shade(palette.land, -0.42);
    const cliffShade = shade(palette.land, -0.58);

    // Biome ground tones (warm, golden-hour leaning).
    const sand = shade(palette.landAlt, 0.06);
    const forestFloor = lerpHex(palette.land, palette.foliageShadow, 0.5);
    const stone = lerpHex(palette.landAlt, "#9a9080", 0.62);
    const meadowGrass = shade(palette.land, 0.13);
    const grassLight = shade(palette.land, 0.16);
    const grassDeep = lerpHex(palette.land, palette.foliage, 0.42);

    const hash = (x: number, y: number) => {
      const h = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
      return h - Math.floor(h);
    };

    const ctx = landContext(this.layout.grid, this.layout.landCells);
    const isLand = ctx.isLand;
    const interior = (x: number, y: number) =>
      isLand(x, y) && isLand(x + 1, y) && isLand(x, y + 1) && isLand(x - 1, y) && isLand(x, y - 1);

    const groundTone = (gx: number, gy: number, biome: ReturnType<typeof biomeAt>): number => {
      const n =
        Math.sin(gx * 0.45 + gy * 0.28) * 0.5 + Math.sin((gx - gy) * 0.6 + 2) * 0.5; // ~[-1,1]
      switch (biome) {
        case "beach": return shade(sand, n * 0.05);
        case "forest": return shade(forestFloor, n * 0.06);
        case "mountain": return shade(stone, n * 0.06);
        case "meadow": return shade(meadowGrass, n * 0.06);
        default: {
          const t = (n + 1) / 2;
          if (t > 0.74) return grassDeep;
          if (t < 0.24) return grassLight;
          return shade(palette.land, (t - 0.5) * 0.1);
        }
      }
    };
    const flowerCols = [hexNum(palette.accent), 0xfff0a0, 0xffffff, 0xb98aff];

    this.terrain.clear();

    const cells = [...this.layout.landCells].sort(
      (a, b) => depth(a.x, a.y) - depth(b.x, b.y),
    );

    // Coastal foam ring (under the land, hugging the shore).
    for (const c of cells) {
      if (interior(c.x, c.y)) continue;
      this.terrain
        .poly(diamondPoly(c.x, c.y))
        .stroke({ width: 4, color: hexNum(palette.waterShimmer), alpha: 0.35 });
    }

    for (const c of cells) {
      const { x, y } = tileToScreen(c.x, c.y);
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
      this.terrain.poly(diamondPoly(c.x, c.y)).fill(groundTone(c.x, c.y, biomeAt(c.x, c.y, ctx)));
    }

    // Scattered natural detail per biome.
    for (const c of cells) {
      if (!interior(c.x, c.y)) continue;
      const biome = biomeAt(c.x, c.y, ctx);
      const r = hash(c.x, c.y);
      const ctr = tileCenter(c.x, c.y);
      if ((biome === "meadow" || biome === "grass") && r < 0.16) {
        const col = flowerCols[Math.floor(hash(c.y, c.x) * flowerCols.length) % flowerCols.length];
        for (let k = 0; k < 3; k++) {
          const fx = ctr.x + (hash(c.x + k, c.y) - 0.5) * 16;
          const fy = ctr.y + (hash(c.x, c.y + k) - 0.5) * 8;
          this.terrain.circle(fx, fy, 1.7).fill(col);
          this.terrain.circle(fx, fy, 0.7).fill(0xfff0a0);
        }
      } else if (biome === "forest" && r < 0.4) {
        // fallen leaves
        for (let k = 0; k < 3; k++) {
          const fx = ctr.x + (hash(c.x + k * 3, c.y) - 0.5) * 18;
          const fy = ctr.y + (hash(c.x, c.y + k * 3) - 0.5) * 9;
          this.terrain.ellipse(fx, fy, 2, 1).fill({ color: 0xc8893f, alpha: 0.6 });
        }
      } else if (biome === "mountain" && r < 0.3) {
        const fx = ctr.x + (hash(c.x, c.y) - 0.5) * 12;
        const fy = ctr.y + (hash(c.y, c.x) - 0.5) * 6;
        this.terrain.ellipse(fx, fy, 3, 1.6).fill({ color: hexNum(shade(stone, -0.18)), alpha: 0.7 });
      } else if (biome === "beach" && r < 0.12) {
        const fx = ctr.x + (hash(c.x, c.y) - 0.5) * 14;
        const fy = ctr.y + (hash(c.y, c.x) - 0.5) * 7;
        this.terrain.circle(fx, fy, 1.1).fill({ color: hexNum(shade(sand, -0.18)), alpha: 0.6 });
      }
    }
  }

  private buildZones(): void {
    for (const z of this.zones) {
      const scene = buildZoneScene(z, this.theme, this.opts.hideTextLabels);
      const center = footprintCenter(z.gridPosition, z.footprint.w, z.footprint.h);
      scene.container.position.set(center.x, center.y);
      // Zone art y-sorts just behind props/avatars on the same row.
      scene.container.zIndex =
        depth(
          z.gridPosition.x + z.footprint.w / 2,
          z.gridPosition.y + z.footprint.h / 2,
        ) + 0.05;
      this.entities.addChild(scene.container);
      this.staticEntities.push(scene.container);
      this.zoneScenes.set(z.key, { setHover: scene.setHover });
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

      this.entities.addChild(shadow, sprite);
      this.staticEntities.push(shadow, sprite);
    }
  }

  // ── Avatars (persistent animal views + movement) ────────────────

  private configHash(a: AvatarInstance): string {
    const c = a.config;
    return [
      c.species, c.bodyColor, c.accessoryKey, c.displayColor,
      a.label ?? "", this.opts.hideTextLabels ? "1" : "0",
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
    sprite.container.scale.set(AVATAR_SCALE);
    container.addChild(sprite.container);

    let tag: Text | undefined;
    if (a.label && !this.opts.hideTextLabels) {
      tag = new Text({
        text: a.label,
        style: {
          fontFamily: "system-ui, sans-serif",
          fontSize: 12,
          fontWeight: "700",
          fill: hexNum(a.config.displayColor),
          stroke: { color: 0xffffff, width: 3 },
        },
      });
      tag.anchor.set(0.5, 1);
      tag.position.set(0, -38 * AVATAR_SCALE - 6);
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

  // ── Camera ──────────────────────────────────────────────────────

  /** World-pixel bounding box of the island (incl. cliff + label headroom). */
  private computeWorldBounds(): void {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const c of this.layout.landCells) {
      const { x, y } = tileToScreen(c.x, c.y);
      minX = Math.min(minX, x - TILE_W / 2);
      maxX = Math.max(maxX, x + TILE_W / 2);
      minY = Math.min(minY, y - 40);
      maxY = Math.max(maxY, y + TILE_H + CLIFF);
    }
    if (!Number.isFinite(minX)) { minX = maxX = minY = maxY = 0; }
    this.worldBounds = { minX, maxX, minY, maxY };
  }

  /** Comfortable zoom: enough that the avatar is readable but the island is
   *  bigger than the viewport (you explore rather than see it all). */
  private updateCamScale(): void {
    const sw = this.app.screen.width;
    const sh = this.app.screen.height;
    this.camScale = Math.max(0.95, Math.min(1.6, Math.min(sw, sh) / 640));
  }

  /** First-time camera placement: zoom, then center on the local avatar. */
  private setupCamera(): void {
    this.updateCamScale();
    if (!this.cameraInit) {
      const focus = this.localFocus();
      this.camX = this.app.screen.width / 2 - focus.x * this.camScale;
      this.camY = this.app.screen.height / 2 - focus.y * this.camScale;
      this.cameraInit = true;
    }
    this.clampCamera();
    this.applyCamera();
  }

  /** World-space point the camera wants to keep centered (the local avatar). */
  private localFocus(): { x: number; y: number } {
    const local = this.localId ? this.avatarViews.get(this.localId) : null;
    const pos = local
      ? local.pos
      : { x: this.layout.spawnPoint.x, y: this.layout.spawnPoint.y };
    return tileCenter(pos.x, pos.y);
  }

  private clampCamera(): void {
    const sw = this.app.screen.width;
    const sh = this.app.screen.height;
    const s = this.camScale;
    const M = 90; // sea border allowed around the island
    const { minX, maxX, minY, maxY } = this.worldBounds;

    const loX = sw - M - maxX * s;
    const hiX = M - minX * s;
    this.camX = loX > hiX ? (loX + hiX) / 2 : Math.min(hiX, Math.max(loX, this.camX));

    const loY = sh - M - maxY * s;
    const hiY = M - minY * s;
    this.camY = loY > hiY ? (loY + hiY) / 2 : Math.min(hiY, Math.max(loY, this.camY));
  }

  private applyCamera(): void {
    this.world.scale.set(this.camScale);
    this.world.position.set(this.camX, this.camY);
  }

  private followCamera(dt: number): void {
    if (!this.followEnabled || this.pointerDown) return;
    const focus = this.localFocus();
    const targetX = this.app.screen.width / 2 - focus.x * this.camScale;
    const targetY = this.app.screen.height / 2 - focus.y * this.camScale;
    // Critically-damped-ish ease.
    const k = 1 - Math.exp(-6 * dt);
    this.camX += (targetX - this.camX) * k;
    this.camY += (targetY - this.camY) * k;
    this.clampCamera();
    this.applyCamera();
  }

  // ── Pointer: tap to act, drag to pan ────────────────────────────

  private onPointerDown = (e: FederatedPointerEvent): void => {
    this.pointerDown = true;
    this.pointerMoved = false;
    this.downX = this.lastX = e.global.x;
    this.downY = this.lastY = e.global.y;
  };

  private onPointerMove = (e: FederatedPointerEvent): void => {
    if (this.pointerDown) {
      const dx = e.global.x - this.lastX;
      const dy = e.global.y - this.lastY;
      this.lastX = e.global.x;
      this.lastY = e.global.y;
      if (Math.hypot(e.global.x - this.downX, e.global.y - this.downY) > DRAG_THRESHOLD) {
        this.pointerMoved = true;
        this.followEnabled = false; // user is exploring; stop auto-follow
        this.camX += dx;
        this.camY += dy;
        this.clampCamera();
        this.applyCamera();
      }
      return;
    }
    // Hover affordance (mouse): highlight the zone under the pointer.
    this.updateHover(e);
  };

  private onPointerUp = (e: FederatedPointerEvent): void => {
    const wasTap = this.pointerDown && !this.pointerMoved;
    this.pointerDown = false;
    if (wasTap) this.tapAt(e);
  };

  private updateHover(e: FederatedPointerEvent): void {
    const p = this.world.toLocal(e.global);
    const tile = screenToTile(p.x, p.y);
    const zone = this.zoneAt(tile.x, tile.y);
    const key = zone?.key ?? null;
    if (key === this.hoveredZone) return;
    if (this.hoveredZone) this.zoneScenes.get(this.hoveredZone)?.setHover(false);
    this.hoveredZone = key;
    if (key) this.zoneScenes.get(key)?.setHover(true);
  }

  private tapAt(e: FederatedPointerEvent): void {
    if (!this.localId) return;
    const local = this.avatarViews.get(this.localId);
    if (!local) return;
    const p = this.world.toLocal(e.global);
    const tile = screenToTile(p.x, p.y);

    // Tapped a decoration? Fire onObjectInteract instead of walking.
    const deco = (this.layout.decorations ?? []).find(
      (d) => d.position.x === tile.x && d.position.y === tile.y,
    );
    if (deco) {
      this.opts.onObjectInteract?.(deco.id, null);
      return;
    }

    const zone = this.zoneAt(tile.x, tile.y);
    if (zone) {
      this.followEnabled = true;
      this.requestZoneTap(zone);
      return;
    }
    if (this.grid.walkable(tile.x, tile.y)) {
      this.followEnabled = true;
      this.walkView(local, tile, () =>
        this.opts.onAvatarMove?.(local.id, { x: tile.x, y: tile.y }),
      );
    }
  }

  // ── Per-frame update (movement always; bob/shimmer gated) ───────

  private update = (ticker: Ticker): void => {
    const dt = Math.min(0.05, ticker.deltaMS / 1000);
    this.elapsed += ticker.deltaMS;

    for (const view of this.avatarViews.values()) {
      this.advanceAvatar(view, dt);
    }
    this.followCamera(dt);

    if (this.opts.reducedMotion) {
      this.fireflies.visible = false;
    } else {
      this.fireflies.visible = true;
      this.drawShimmer();
      const t = this.elapsed / 1000;
      for (const f of this.fireflyDots) {
        f.g.position.set(
          f.cx + Math.cos(t * f.speed + f.phase) * f.rx,
          f.cy + Math.sin(t * f.speed * 1.3 + f.phase) * f.ry,
        );
        f.g.alpha = 0.45 + 0.45 * (0.5 + 0.5 * Math.sin(t * 2 + f.phase));
      }
    }
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
      this.app.stage.off("pointerdown", this.onPointerDown);
      this.app.stage.off("pointermove", this.onPointerMove);
      this.app.stage.off("pointerup", this.onPointerUp);
      this.app.stage.off("pointerupoutside", this.onPointerUp);
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
