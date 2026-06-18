import {
  Application,
  Assets,
  Container,
  type FederatedPointerEvent,
  Graphics,
  Rectangle,
  Sprite,
  Text,
  type Texture,
  type Ticker,
} from "pixi.js";
import type {
  AvatarConfig,
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
import { islandOutline, flatten, insetLoop, clusterOutline, type Pt } from "./coast";
import { buildZoneScene, LANDMARK_ART } from "./zones";
import { findPath, nearestWalkable, type WalkGrid } from "./pathfind";
import { ZoneView } from "./ZoneView";

/** Walk speed in grid tiles per second. */
const WALK_SPEED = 4.5;
/** Duration (seconds) of a gentle idle hop. */
const HOP_DUR = 0.5;
/** Bold cel outline color, matching the Wind Waker art register. */
const INK = 0x23201c;
/** Avatar art scale — chunky + readable relative to the tiles. */
const AVATAR_SCALE = 1.6;
/** Pointer travel (px) beyond which a press becomes a pan, not a tap. */
const DRAG_THRESHOLD = 7;
/** Zoom bounds: 0.5x sees the whole island, 2.5x zooms into a zone. */
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 2.5;
/** Mode 1 ↔ Mode 2 camera-tilt + cross-fade duration (seconds). */
const TILT_DURATION = 1.0;

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
  /** Idle-hop state (local avatar only): time since last hop, when the next
   *  hop is due, and the remaining hop animation time. */
  idleClock: number;
  nextHopAt: number;
  hopT: number;
}

export interface RendererCallbacks {
  onReady?: () => void;
  onError?: (err: Error) => void;
  onLoadProgress?: (progress: number) => void;
  onZoneTap?: (zoneKey: ZoneKey) => void;
  onObjectInteract?: (objectId: string, zoneKey: ZoneKey | null) => void;
  onAvatarMove?: (avatarId: string, position: GridPosition) => void;
  /** Fires when the player reaches + taps the zone's activity beacon (Mode 2). */
  onActivityEnter?: (zoneKey: ZoneKey) => void;
  /** Fires when the player taps the in-scene exit path in the zone view (Mode 2). */
  onZoneExit?: () => void;
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
  /** Camera-panned world (Mode 1 — world map). */
  private world = new Container();
  /** Finished illustrated ground sprite (replaces the procedural terrain when
   *  layout.terrainImage is set); pinned into world space via the registration. */
  private ground?: Sprite;
  /** Smooth island blob (base fill + cliff + bold coast outline). */
  private terrain = new Graphics();
  /** Per-tile biome coloring, masked to the smooth coastline. */
  private biomeLayer = new Graphics();
  private landMask = new Graphics();
  private coastLoop: Pt[] = [];
  private waves = new Graphics();
  private flame = new Graphics();
  /** y-sorted props: zones, decorations, avatars. */
  private entities = new Container();
  /** Ambient firefly overlay (world space, drawn above props). */
  private fireflies = new Container();
  private fireflyDots: {
    g: Graphics; cx: number; cy: number; rx: number; ry: number; phase: number; speed: number;
  }[] = [];
  /** Arrival boat (world space). */
  private boat = new Graphics();
  /** Mode 2 — third-person zone view (parallax, screen space). */
  private zoneView!: ZoneView;
  /** Optional flash overlay kept for reduced-motion / safety (screen space). */
  private fade = new Graphics();

  // Mode + transition state.
  private currentZone: ZoneKey | null = null;
  /**
   * Active Mode 1↔2 transition. The world map tilts toward a low horizon angle
   * and zooms onto the zone landmark while it cross-fades (its alpha) over the
   * parallax zone view beneath it. `enter` runs tilt 0→1, `exit` runs 1→0.
   */
  private trans: {
    dir: "enter" | "exit";
    zone: ZoneKey;
    t: number;
    pivotX: number; pivotY: number;
    anchor0X: number; anchor0Y: number;
    anchor1X: number; anchor1Y: number;
    scale0: number; scale1: number;
  } | null = null;

  // Arrival sequence state.
  private arrival: "boat" | "step" | "done" = "boat";
  private arrivalT = 0;

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
  private flamePos: { x: number; y: number } | null = null;
  /** Trees that gently sway. */
  private swayers: { sprite: Sprite; phase: number }[] = [];
  /** Per-zone idle animators (lighthouse beam, lantern flicker, etc.). */
  private zoneAnimators: ((t: number) => void)[] = [];
  /** Finished illustrated landmark sprites, preloaded by zone key. */
  private landmarkTextures = new Map<ZoneKey, Texture>();

  // ── Camera (zoom + eased follow + drag pan, clamped to world) ──
  private camScale = 1;
  private camX = 0;
  private camY = 0;
  private followEnabled = true;
  private cameraInit = false;
  private zoomLocked = false;
  private worldBounds = { minX: 0, maxX: 0, minY: 0, maxY: 0 };

  // Pointer drag state.
  private pointerDown = false;
  private pointerMoved = false;
  private downX = 0;
  private downY = 0;
  private lastX = 0;
  private lastY = 0;
  // Active pointers (for pinch-to-zoom).
  private pointers = new Map<number, { x: number; y: number }>();
  private pinchDist = 0;

  private inited = false;
  private destroyed = false;
  private tornDown = false;
  private elapsed = 0;
  private loggedIdle = false;

  constructor(private opts: RendererOptions) {}

  async init(
    theme: ThemePackConfig,
    layout: LayoutConfig,
    zones: ZoneInstance[],
    avatars: AvatarInstance[],
    initialZone: ZoneKey | null = null,
  ): Promise<void> {
    this.theme = theme;
    this.layout = layout;
    this.zones = zones;
    this.avatars = avatars;
    this.currentZone = initialZone;

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

    this.zoneView = new ZoneView({ reducedMotion: this.opts.reducedMotion });

    this.app.canvas.style.display = "block";
    this.opts.container.appendChild(this.app.canvas);
    // The zone view sits BELOW the world map so the enter transition can fade
    // the (tilting) world out to reveal the parallax beneath, and the exit
    // transition can fade the world back in over it.
    this.app.stage.addChild(this.backdrop, this.zoneView.container, this.world, this.fade);
    this.backdrop.addChild(this.sky, this.shimmer);
    this.world.addChild(
      this.terrain,
      this.biomeLayer,
      this.landMask,
      this.waves,
      this.entities,
      this.flame,
      this.fireflies,
      this.boat,
    );
    this.biomeLayer.mask = this.landMask;
    this.entities.sortableChildren = true;
    this.fade.eventMode = "none";

    // Arrival: reduced motion skips straight to "landed"; otherwise the boat
    // pulls up to the dock on first load. If the host starts inside a zone,
    // there's no world arrival to play.
    this.arrival = this.opts.reducedMotion || initialZone ? "done" : "boat";

    // Unified pointer handling on the stage: press + release without travel is
    // a tap (walk / zone / object); press + drag pans the camera. Zones and
    // decorations are non-interactive — everything is hit-tested here so drag
    // and tap never conflict.
    this.app.stage.eventMode = "static";
    this.app.stage.on("pointerdown", this.onPointerDown);
    this.app.stage.on("pointermove", this.onPointerMove);
    this.app.stage.on("pointerup", this.onPointerUp);
    this.app.stage.on("pointerupoutside", this.onPointerUp);
    // Scroll wheel zoom (centered on the cursor).
    this.app.canvas.addEventListener("wheel", this.onWheel, { passive: false });

    this.opts.onLoadProgress?.(0.2);
    this.textures = new ProgrammaticTextureProvider(this.app.renderer);
    this.textures.refresh(theme.palette);
    this.opts.onLoadProgress?.(0.6);

    await this.loadGround();
    await this.loadLandmarks();

    this.rebuild();
    this.drawFadeRect();
    this.fade.alpha = 0;

    // Boat starts off-shore; the local avatar is hidden until it steps off.
    this.setupArrival();
    // Start inside a zone if the host asked for it.
    if (initialZone) this.applyMode(initialZone);

    this.opts.onLoadProgress?.(1);

    // Single always-on ticker: movement runs even under reduced motion; only
    // decorative bob/shimmer are gated by the reduced-motion flag.
    this.app.ticker.add(this.update);

    this.opts.onReady?.();
  }

  /** Position the boat off-shore and hide the avatar for the arrival walk-on. */
  private setupArrival(): void {
    this.boat.visible = this.arrival === "boat";
    // Sized to read alongside the new welcome-dock.png (~97px wide); the old
    // 3.6 was scaled for the larger code-drawn dock. Eyeball-adjustable.
    this.boat.scale.set(2.0);
    const local = this.localId ? this.avatarViews.get(this.localId) : null;
    if (this.arrival === "boat" && local) local.container.visible = false;
    this.arrivalT = 0;
    this.drawBoat();
  }

  private dockApproach(): { fromX: number; fromY: number; toX: number; toY: number } {
    const dock = this.zones.find((z) => z.key === "welcome_dock");
    const c = dock
      ? footprintCenter(dock.gridPosition, dock.footprint.w, dock.footprint.h)
      : tileCenter(this.layout.spawnPoint.x, this.layout.spawnPoint.y);
    // Boat docks just in front (down-screen) of the new welcome-dock.png. Its
    // painted front edge sits ~28px below the footprint centre at the current
    // dock scale, so the boat berths a touch beyond that, arriving from further
    // out in the water. (Landing offset tuned to the dock art — eyeball-adjust.)
    return { fromX: c.x - 18, fromY: c.y + 205, toX: c.x - 18, toY: c.y + 44 };
  }

  private drawBoat(x = 0, y = 0): void {
    this.boat.clear();
    if (this.arrival !== "boat") return;
    const INK = 0x23201c;
    this.boat.position.set(x, y);
    this.boat.zIndex = 9999;
    // little sailboat
    this.boat.ellipse(0, 6, 4, 2).fill({ color: 0x000000, alpha: 0.18 });
    this.boat.poly([-18, 0, 18, 0, 12, 10, -12, 10]).fill(0xb5763f).stroke({ width: 3, color: INK });
    this.boat.roundRect(-16, -2, 32, 4, 2).fill(0xcf9457).stroke({ width: 3, color: INK });
    this.boat.moveTo(0, -2).lineTo(0, -28).stroke({ width: 3, color: INK });
    this.boat.poly([0, -28, 0, -6, 15, -10]).fill(0xfff1f0).stroke({ width: 3, color: INK });
  }

  // ── Prop updates ────────────────────────────────────────────────

  setTheme(theme: ThemePackConfig): void {
    if (!this.inited || this.destroyed) return;
    this.theme = theme;
    this.app.renderer.background.color = hexNum(theme.palette.water);
    this.textures.refresh(theme.palette);
    this.rebuild();
    if (this.currentZone && this.zoneView.active) {
      this.zoneView.restyle(theme.palette, this.localCfg());
    }
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
    if (this.currentZone && this.zoneView.active) {
      this.zoneView.restyle(this.theme.palette, this.localCfg());
    }
  }

  /** Host imperative: walk the local avatar to a grid cell (pathfinds there). */
  walkLocalAvatarTo(position: GridPosition): void {
    if (!this.inited || this.destroyed || !this.localId) return;
    const view = this.avatarViews.get(this.localId);
    if (!view) return;
    const goal = this.grid.walkable(position.x, position.y)
      ? position
      : nearestWalkable(this.grid, position, 12, {
          x: Math.round(view.pos.x),
          y: Math.round(view.pos.y),
        });
    if (goal) {
      this.followEnabled = true;
      this.walkView(view, goal, () =>
        this.opts.onAvatarMove?.(view.id, { x: goal.x, y: goal.y }),
      );
    }
  }

  /** Host mode control: enter a zone (key) or return to the world (null). */
  setCurrentZone(zone: ZoneKey | null): void {
    if (!this.inited || this.destroyed) return;
    const target = zone ?? null;
    if (target === this.currentZone && !this.trans) return;
    // Already animating toward this same destination — ignore the re-fire.
    if (this.trans && (this.trans.dir === "enter") === (target !== null)) return;

    if (this.opts.reducedMotion) {
      this.trans = null;
      this.applyMode(target);
      this.fade.alpha = 0;
      return;
    }
    if (target) this.beginTransition("enter", target);
    else if (this.currentZone) this.beginTransition("exit", this.currentZone);
    else this.applyMode(null);
  }

  /** Kick off the 1s camera-tilt + cross-fade between Mode 1 and Mode 2. */
  private beginTransition(dir: "enter" | "exit", zone: ZoneKey): void {
    if (dir === "enter") {
      // Build the parallax zone view beneath the world map; the world stays on
      // top and tilts + fades to reveal it.
      this.zoneView.enter(
        zone, this.theme.palette, this.localCfg(),
        this.app.screen.width, this.app.screen.height,
      );
    } else {
      // The world map reappears on top and fades in over the zone view as it
      // un-tilts; re-enable follow so it settles on the avatar by the zone.
      this.followEnabled = true;
    }
    this.world.visible = true;
    this.backdrop.visible = true;
    this.world.alpha = 1;

    const z = this.zones.find((zz) => zz.key === zone);
    const c = z
      ? footprintCenter(z.gridPosition, z.footprint.w, z.footprint.h)
      : tileCenter(this.layout.spawnPoint.x, this.layout.spawnPoint.y);
    const sw = this.app.screen.width;
    const sh = this.app.screen.height;
    this.trans = {
      dir, zone, t: 0,
      pivotX: c.x, pivotY: c.y,
      // tilt=0 reproduces the current world map exactly (no jump on start/finish)
      anchor0X: c.x * this.camScale + this.camX,
      anchor0Y: c.y * this.camScale + this.camY,
      // tilt=1 frames the zone centered, dropped toward the horizon
      anchor1X: sw / 2, anchor1Y: sh * 0.52,
      scale0: this.camScale, scale1: this.camScale * 2.2,
    };
    console.info(`[island-scene] beginTransition ${dir} → ${zone}`);
  }

  private applyMode(zone: ZoneKey | null): void {
    this.currentZone = zone;
    if (zone) {
      // Mode 2: hide the entire world map (backdrop + camera-panned world) so
      // nothing from Mode 1 bleeds through behind the parallax layers.
      this.zoneView.enter(
        zone,
        this.theme.palette,
        this.localCfg(),
        this.app.screen.width,
        this.app.screen.height,
      );
      this.world.visible = false;
      this.backdrop.visible = false;
      console.info(`[island-scene] applyMode → Mode 2 (zone view: ${zone})`);
    } else {
      this.zoneView.hide();
      this.world.visible = true;
      this.backdrop.visible = true;
      console.info("[island-scene] applyMode → Mode 1 (world map)");
    }
  }

  /** The local avatar's config (used to draw the same animal in Mode 2). */
  private localCfg(): AvatarConfig | null {
    const a = this.localId
      ? this.avatars.find((x) => x.id === this.localId)
      : this.avatars[0];
    return a?.config ?? null;
  }

  /** Advance the camera-tilt transition + cross-fade (M3 / M5). */
  private tickZoneTransition(dt: number): void {
    const tr = this.trans;
    if (!tr) return;
    tr.t = Math.min(1, tr.t + dt / TILT_DURATION);
    const p = tr.t * tr.t * (3 - 2 * tr.t); // smoothstep
    // tilt: 0 = overhead iso (world untouched), 1 = flat horizon, zoomed on zone
    const tiltP = tr.dir === "enter" ? p : 1 - p;
    this.applyTilt(tiltP, tr);
    // The parallax beneath keeps animating across the whole transition.
    if (this.zoneView.active) this.zoneView.update(dt);
    if (tr.t >= 1) this.finishTransition(tr);
  }

  /** Squash + zoom + fade the world toward the zone for tilt progress [0..1]. */
  private applyTilt(tiltP: number, tr: NonNullable<SceneRenderer["trans"]>): void {
    this.world.pivot.set(tr.pivotX, tr.pivotY);
    const S = tr.scale0 + (tr.scale1 - tr.scale0) * tiltP;
    this.world.scale.x = S;
    this.world.scale.y = S * (1 - 0.5 * tiltP); // vertical squash fakes the tilt
    this.world.position.x = tr.anchor0X + (tr.anchor1X - tr.anchor0X) * tiltP;
    this.world.position.y = tr.anchor0Y + (tr.anchor1Y - tr.anchor0Y) * tiltP;
    // Fade the world out as it flattens so the parallax reads through.
    const k = Math.max(0, Math.min(1, (tiltP - 0.3) / 0.55));
    this.world.alpha = 1 - k * k * (3 - 2 * k);
  }

  private finishTransition(tr: NonNullable<SceneRenderer["trans"]>): void {
    // Restore a clean world transform regardless of which way we went.
    this.world.pivot.set(0, 0);
    this.world.alpha = 1;
    this.world.scale.set(this.camScale);
    if (tr.dir === "enter") {
      this.currentZone = tr.zone;
      this.world.visible = false;
      this.backdrop.visible = false;
      console.info(`[island-scene] transition done → Mode 2 (${tr.zone})`);
    } else {
      this.currentZone = null;
      this.zoneView.hide();
      this.world.visible = true;
      this.backdrop.visible = true;
      this.followEnabled = true;
      this.applyCamera();
      console.info("[island-scene] transition done → Mode 1 (world map)");
    }
    this.trans = null;
  }

  private drawFadeRect(): void {
    this.fade.clear();
    this.fade.rect(0, 0, this.app.screen.width, this.app.screen.height).fill(0xfdf6ea);
  }

  resize(): void {
    if (!this.inited || this.destroyed) return;
    this.app.resize();
    this.drawBackdrop();
    this.drawFadeRect();
    this.updateCamScale();
    this.clampCamera();
    this.applyCamera();
    if (this.currentZone) this.zoneView.resize(this.app.screen.width, this.app.screen.height);
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
    const fire = this.zones.find((z) => z.key === "campfire_circle");
    this.flamePos = fire
      ? footprintCenter(fire.gridPosition, fire.footprint.w, fire.footprint.h)
      : null;
    this.setupCamera();
  }

  /** Tall flickering campfire flame (animated), drawn above the props. */
  private drawFlame(): void {
    this.flame.clear();
    if (!this.flamePos) return;
    const t = this.elapsed / 1000;
    // Gentle, unhurried flicker: slow primary sway + a small soft tremble.
    const sway = Math.sin(t * 3.2) * 1.6 + Math.sin(t * 6.5) * 0.6;
    const grow = 1 + 0.12 * Math.sin(t * 2.4 + 1) + 0.05 * Math.sin(t * 5.5);
    const bx = this.flamePos.x;
    const by = this.flamePos.y - 4;
    const H = 27 * grow; // cozy campfire, ~40% of the old bonfire
    // Soft warm glow pulse pooling around the base (drawn first, behind flame).
    const gp = 0.5 + 0.5 * Math.sin(t * 1.2);
    this.flame.ellipse(bx, by - 4, 18 + gp * 4, 11 + gp * 2).fill({ color: 0xffb24d, alpha: 0.08 + 0.05 * gp });
    // outer → mid → inner, bold outline on the outer flame.
    this.flame.poly([bx, by - H, bx + 7, by - 6, bx + sway, by, bx - 7, by - 6])
      .fill(0xff7a2d).stroke({ width: 2.5, color: INK });
    this.flame.poly([bx, by - H * 0.72, bx + 4, by - 5, bx + sway * 0.6, by, bx - 4, by - 5])
      .fill(0xffd23d);
    this.flame.poly([bx, by - H * 0.45, bx + 2, by - 3.5, bx, by, bx - 2, by - 3.5])
      .fill(0xfff1a8);
    this.flame.ellipse(bx, by + 2, 11, 3).fill({ color: 0xff9a3d, alpha: 0.22 }); // ember glow
  }

  /** Soft fireflies drifting by the forest treehouse — calm, magical. */
  private buildFireflies(): void {
    this.fireflies.removeChildren().forEach((c) => c.destroy());
    this.fireflyDots = [];
    const hollow = this.zones.find((z) => z.key === "treehouse_hideaway");
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
    // Painted tree/rock masses: impassable, so the avatar walks around them.
    for (const o of this.layout.obstacleCells ?? []) {
      blocked.add(`${o.x},${o.y}`);
    }
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

  /** Load the finished terrain illustration and pin it into the world. */
  private async loadGround(): Promise<void> {
    const img = this.layout.terrainImage;
    if (!img) return;
    let tex: Texture;
    try {
      tex = (await Assets.load(img.url)) as Texture;
    } catch (err) {
      // Fall back to the procedural terrain if the art fails to load.
      console.warn("[island-scene] terrainImage failed to load; using code terrain", err);
      return;
    }
    if (this.destroyed) return;
    const spr = new Sprite(tex);
    spr.anchor.set(0, 0);
    spr.eventMode = "none";
    this.ground = spr;
    // Sits at the very bottom of the world so props/avatars draw on top.
    this.world.addChildAt(spr, 0);
    this.positionGround();
  }

  /** Preload the finished illustrated landmark sprites (one per zone). A
   *  failed load just leaves that zone without a texture, so buildZoneScene
   *  falls back to the code-drawn structure rather than going blank. */
  private async loadLandmarks(): Promise<void> {
    await Promise.all(
      (Object.keys(LANDMARK_ART) as ZoneKey[]).map(async (key) => {
        try {
          const tex = (await Assets.load(LANDMARK_ART[key].url)) as Texture;
          if (!this.destroyed) this.landmarkTextures.set(key, tex);
        } catch (err) {
          console.warn(`[island-scene] landmark art failed to load: ${key}`, err);
        }
      }),
    );
  }

  /** Pin the ground sprite so art-pixel (0,0) → world (originX, originY). */
  private positionGround(): void {
    const img = this.layout.terrainImage;
    if (!this.ground || !img) return;
    this.ground.position.set(img.originX, img.originY);
    this.ground.scale.set(img.scale);
  }

  private drawTerrain(): void {
    const { palette } = this.theme;
    const grid = this.layout.grid;

    // Finished illustration in use: it IS the ground. Skip the procedural
    // terrain/biome layers entirely — the engine still renders its animated
    // sky/sea backdrop. We DO keep a coast loop (derived from the same grid the
    // art was registered to) purely so drawWaves can lap a soft water shimmer
    // just off the painted shore.
    if (this.layout.terrainImage && this.ground) {
      this.terrain.clear();
      this.biomeLayer.clear();
      this.landMask.clear();
      this.coastLoop = islandOutline(this.layout.landCells);
      this.positionGround();
      return;
    }

    // The island as one smooth organic blob (no grid steps at the coast).
    this.coastLoop = islandOutline(this.layout.landCells);
    const loop = this.coastLoop;

    // Dramatic per-biome ground tones — each area feels like a different level.
    const beachBase = "#ecdcae";  // smooth sandy coastal fringe
    const forestFloor = lerpHex(palette.land, palette.foliageShadow, 0.66);
    const stone = lerpHex(palette.landAlt, "#8f8a82", 0.78);
    const meadowGrass = lerpHex(palette.land, "#a9e25a", 0.38);
    const grassBase = palette.land;

    const hash = (x: number, y: number) => {
      const h = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
      return h - Math.floor(h);
    };
    const ctx = landContext(grid, this.layout.landCells);
    const interior = (x: number, y: number) =>
      ctx.isLand(x, y) && ctx.isLand(x + 1, y) && ctx.isLand(x, y + 1) &&
      ctx.isLand(x - 1, y) && ctx.isLand(x, y - 1);

    const flowerCols = [hexNum(palette.accent), 0xfff0a0, 0xffffff, 0xb98aff];

    // ── Smooth landmass: cliff band, base fill (sandy fringe), bold coast ──
    this.terrain.clear();
    if (loop.length >= 4) {
      const cliffH = CLIFF + 6;
      this.terrain.poly(flatten(loop, 0, cliffH)).fill(shade(palette.land, -0.5));
      this.terrain.poly(flatten(loop)).fill(beachBase);
      this.terrain.poly(flatten(loop)).stroke({ width: 5, color: INK, alpha: 0.9 });
    }

    // Mask so interior coloring is clipped to the smooth silhouette.
    this.landMask.clear();
    if (loop.length >= 4) this.landMask.poly(flatten(loop)).fill(0xffffff);

    // ── Biome coloring as smooth ORGANIC blobs (no grid-square edges) ──
    // Sand fringe = the base terrain showing through; grass = inset blob;
    // forest / mountain / meadow = smoothed outlines of their cell clusters.
    this.biomeLayer.clear();
    if (loop.length >= 4) {
      this.biomeLayer.poly(flatten(insetLoop(loop, 0.12))).fill(grassBase);
    }
    const biomeBlob = (b: ReturnType<typeof biomeAt>, color: number | string) => {
      const cellsB = this.layout.landCells.filter((c) => biomeAt(c.x, c.y, ctx) === b);
      if (cellsB.length < 8) return;
      const outline = clusterOutline(cellsB);
      if (outline.length >= 4) this.biomeLayer.poly(flatten(insetLoop(outline, 0.06))).fill(color);
    };
    biomeBlob("forest", forestFloor);
    biomeBlob("mountain", stone);
    biomeBlob("meadow", meadowGrass);

    const cells = [...this.layout.landCells];
    for (const c of cells) {
      if (!interior(c.x, c.y)) continue;
      const biome = biomeAt(c.x, c.y, ctx);
      const r = hash(c.x, c.y);
      const ctr = tileCenter(c.x, c.y);
      if ((biome === "meadow" || biome === "grass") && r < 0.2) {
        const col = flowerCols[Math.floor(hash(c.y, c.x) * flowerCols.length) % flowerCols.length];
        for (let k = 0; k < 3; k++) {
          const fx = ctr.x + (hash(c.x + k, c.y) - 0.5) * 16;
          const fy = ctr.y + (hash(c.x, c.y + k) - 0.5) * 8;
          this.biomeLayer.circle(fx, fy, 1.8).fill(col);
          this.biomeLayer.circle(fx, fy, 0.8).fill(0xfff0a0);
        }
      } else if (biome === "forest" && r < 0.5) {
        for (let k = 0; k < 3; k++) {
          const fx = ctr.x + (hash(c.x + k * 3, c.y) - 0.5) * 18;
          const fy = ctr.y + (hash(c.x, c.y + k * 3) - 0.5) * 9;
          this.biomeLayer.ellipse(fx, fy, 2.2, 1.1).fill({ color: 0xc8893f, alpha: 0.7 });
        }
      } else if (biome === "mountain" && r < 0.34) {
        const fx = ctr.x + (hash(c.x, c.y) - 0.5) * 12;
        const fy = ctr.y + (hash(c.y, c.x) - 0.5) * 6;
        this.biomeLayer.ellipse(fx, fy, 3.4, 1.8).fill({ color: hexNum(shade(stone, -0.2)), alpha: 0.8 });
      }
    }
  }

  /** Animated shoreline foam (Wind Waker waves) along the smooth coast. */
  private drawWaves(): void {
    this.waves.clear();
    const loop = this.coastLoop;
    if (loop.length < 4) return;
    const { palette } = this.theme;

    // Painted island: a single, very soft shimmer just OUTSIDE the painted
    // shore (in the water), gently breathing. Subtle so it never competes with
    // the illustration's own warm foam ring.
    if (this.layout.terrainImage) {
      const off = insetLoop(loop, -0.03); // ~3% outward, into the sea
      const a = 0.08 + 0.05 * (0.5 + 0.5 * Math.sin(this.elapsed / 1300));
      this.waves.poly(flatten(off)).stroke({ width: 3, color: hexNum(palette.waterShimmer), alpha: a });
      const a2 = 0.05 + 0.04 * (0.5 + 0.5 * Math.sin(this.elapsed / 1300 + 1.6));
      this.waves.poly(flatten(insetLoop(loop, -0.06))).stroke({ width: 2, color: hexNum(palette.waterShimmer), alpha: a2 });
      return;
    }

    const a = 0.3 + 0.25 * (0.5 + 0.5 * Math.sin(this.elapsed / 700));
    this.waves.poly(flatten(loop)).stroke({ width: 5, color: hexNum(palette.waterShimmer), alpha: a });
    const a2 = 0.2 + 0.18 * (0.5 + 0.5 * Math.sin(this.elapsed / 700 + 1.4));
    this.waves.poly(flatten(loop, 0, 5)).stroke({ width: 3, color: hexNum(palette.waterShimmer), alpha: a2 });
  }

  private buildZones(): void {
    this.zoneAnimators = [];
    for (const z of this.zones) {
      const scene = buildZoneScene(
        z, this.theme, this.opts.hideTextLabels, this.landmarkTextures.get(z.key),
      );
      if (scene.animate) this.zoneAnimators.push(scene.animate);
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
    this.swayers = [];
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

      // Trees gently sway their canopy (pivot at the bottom anchor).
      if (d.kind.toLowerCase().includes("tree")) {
        this.swayers.push({ sprite, phase: Math.random() * Math.PI * 2 });
      }

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
      idleClock: 0,
      nextHopAt: 4 + Math.random() * 5,
      hopT: 0,
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

  /** Position an avatar container at its current cell with a soft bob, plus an
   *  occasional gentle idle hop (local avatar only). */
  private placeAvatar(view: AvatarView): void {
    const c = tileCenter(view.pos.x, view.pos.y);
    const amp = this.opts.reducedMotion ? 0 : view.moving ? 2.6 : 1.1;
    const bob = Math.abs(Math.sin(view.phase)) * amp;
    // Hop arc: a soft half-sine, ~7px peak, over HOP_DUR seconds.
    const hop =
      view.hopT > 0 ? Math.sin((1 - view.hopT / HOP_DUR) * Math.PI) * 7 : 0;
    view.container.position.set(c.x, c.y - bob - hop);
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
    const entrance = nearestWalkable(
      this.grid,
      center,
      12,
      local ? { x: Math.round(local.pos.x), y: Math.round(local.pos.y) } : undefined,
    );
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
    if (this.zoomLocked) return; // user has taken control of zoom
    const sw = this.app.screen.width;
    const sh = this.app.screen.height;
    this.camScale = Math.max(0.95, Math.min(1.6, Math.min(sw, sh) / 640));
  }

  /** Zoom by a factor, keeping the world point under (sx, sy) fixed. */
  zoomAt(factor: number, sx: number, sy: number): void {
    if (!this.inited || this.destroyed || this.currentZone !== null) return;
    const next = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, this.camScale * factor));
    if (next === this.camScale) return;
    const wx = (sx - this.camX) / this.camScale;
    const wy = (sy - this.camY) / this.camScale;
    this.camScale = next;
    this.camX = sx - wx * next;
    this.camY = sy - wy * next;
    this.zoomLocked = true;
    this.followEnabled = false; // anchored zoom sticks until the next walk
    this.clampCamera();
    this.applyCamera();
  }

  /** Zoom around the screen center (used by the +/- buttons). */
  zoomBy(factor: number): void {
    this.zoomAt(factor, this.app.screen.width / 2, this.app.screen.height / 2);
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

  /** Input is only live on the world map, once arrival + any transition end. */
  private inputLive(): boolean {
    return this.currentZone === null && !this.trans && this.arrival === "done";
  }

  private onWheel = (e: WheelEvent): void => {
    if (this.currentZone !== null) return;
    e.preventDefault();
    const rect = this.app.canvas.getBoundingClientRect();
    this.zoomAt(e.deltaY < 0 ? 1.12 : 1 / 1.12, e.clientX - rect.left, e.clientY - rect.top);
  };

  private onPointerDown = (e: FederatedPointerEvent): void => {
    // Mode 2 (zone view): a simple tap-to-walk; no pan/pinch/zoom. Accept taps
    // as soon as the zone view is on screen (don't wait for the fade-in to
    // finish — that just made early taps feel dead).
    if (this.currentZone !== null) {
      if (!this.zoneView.active || this.trans) return; // no taps mid-transition
      this.pointerDown = true;
      this.pointerMoved = false;
      this.downX = e.global.x;
      this.downY = e.global.y;
      return;
    }
    if (!this.inputLive()) return;
    this.pointers.set(e.pointerId, { x: e.global.x, y: e.global.y });
    if (this.pointers.size === 2) {
      // Begin pinch — cancel any single-pointer pan/tap.
      this.pointerDown = false;
      this.pinchDist = this.pointerSpread();
      return;
    }
    this.pointerDown = true;
    this.pointerMoved = false;
    this.downX = this.lastX = e.global.x;
    this.downY = this.lastY = e.global.y;
  };

  private onPointerMove = (e: FederatedPointerEvent): void => {
    // In a zone, only distinguish tap from drag (so a scroll doesn't walk).
    if (this.currentZone !== null) {
      if (this.pointerDown && Math.hypot(e.global.x - this.downX, e.global.y - this.downY) > DRAG_THRESHOLD) {
        this.pointerMoved = true;
      }
      return;
    }
    if (this.pointers.has(e.pointerId)) this.pointers.set(e.pointerId, { x: e.global.x, y: e.global.y });

    // Pinch-to-zoom takes priority while two fingers are down.
    if (this.pointers.size >= 2) {
      const dist = this.pointerSpread();
      const mid = this.pointerMid();
      if (this.pinchDist > 0 && dist > 0) this.zoomAt(dist / this.pinchDist, mid.x, mid.y);
      this.pinchDist = dist;
      return;
    }

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
    this.updateHover(e);
  };

  private onPointerUp = (e: FederatedPointerEvent): void => {
    if (this.currentZone !== null) {
      const wasZoneTap = this.pointerDown && !this.pointerMoved && !this.trans;
      this.pointerDown = false;
      if (wasZoneTap) {
        const kind = this.zoneView.handleTap(e.global.x, e.global.y);
        if (kind === "exit") {
          console.info("[island-scene] in-scene exit tapped → onZoneExit");
          this.opts.onZoneExit?.();
        } else if (kind === "activity" && this.currentZone) {
          console.info(`[island-scene] onActivityEnter(${this.currentZone})`);
          this.opts.onActivityEnter?.(this.currentZone);
        }
      }
      return;
    }
    this.pointers.delete(e.pointerId);
    if (this.pointers.size < 2) this.pinchDist = 0;
    const wasTap = this.pointerDown && !this.pointerMoved && this.pointers.size === 0;
    this.pointerDown = false;
    if (wasTap) this.tapAt(e);
  };

  private pointerSpread(): number {
    const pts = [...this.pointers.values()];
    if (pts.length < 2) return 0;
    return Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
  }

  private pointerMid(): { x: number; y: number } {
    const pts = [...this.pointers.values()];
    if (pts.length < 2) return { x: this.app.screen.width / 2, y: this.app.screen.height / 2 };
    return { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
  }

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

    if (!this.loggedIdle) {
      this.loggedIdle = true;
      // One-time diagnostic so the idle-animation wiring is verifiable in the
      // console (ticker is running if you see this; counts should be > 0).
      console.info(
        `[island-scene] idle anim ready — trees: ${this.swayers.length}, zone animators: ${this.zoneAnimators.length}, reducedMotion: ${this.opts.reducedMotion}`,
      );
    }

    this.tickZoneTransition(dt);
    this.tickArrival(dt);

    for (const view of this.avatarViews.values()) {
      this.advanceAvatar(view, dt);
    }
    // During a transition the world transform + zone view are driven by
    // tickZoneTransition; otherwise follow the avatar (Mode 1) or tick the
    // parallax (Mode 2).
    if (!this.trans) {
      if (this.currentZone === null) this.followCamera(dt);
      else this.zoneView.update(dt);
    }

    if (this.opts.reducedMotion) {
      this.fireflies.visible = false;
      this.flame.visible = false;
    } else {
      // Animate the world map whenever it's on screen — including while it
      // tilts/fades through a transition.
      this.fireflies.visible = this.world.visible;
      this.flame.visible = this.world.visible;
      if (this.world.visible) {
        const t = this.elapsed / 1000;
        this.drawShimmer();
        this.drawWaves();
        this.drawFlame();
        // Trees sway their canopy; zone landmarks have idle details.
        for (const s of this.swayers) s.sprite.rotation = Math.sin(t * 1.0 + s.phase) * 0.088;
        for (const anim of this.zoneAnimators) anim(t);
      }
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

  /** Arrival: boat glides to the dock, then the avatar steps off and walks in. */
  private tickArrival(dt: number): void {
    if (this.currentZone !== null || this.arrival === "done") return;
    const seg = this.dockApproach();
    if (this.arrival === "boat") {
      this.arrivalT = Math.min(1, this.arrivalT + dt / 2.6);
      const e = this.arrivalT * this.arrivalT * (3 - 2 * this.arrivalT); // smoothstep
      this.drawBoat(seg.fromX + (seg.toX - seg.fromX) * e, seg.fromY + (seg.toY - seg.fromY) * e);
      if (this.arrivalT >= 1) {
        this.arrival = "step";
        const local = this.localId ? this.avatarViews.get(this.localId) : null;
        if (local) {
          local.container.visible = true;
          // Step off at the dock's front, then walk inland to the spawn tile.
          const dock = this.zones.find((z) => z.key === "welcome_dock");
          const front = dock
            ? { x: Math.floor(dock.gridPosition.x + dock.footprint.w / 2), y: dock.gridPosition.y + dock.footprint.h - 1 }
            : this.layout.spawnPoint;
          const entrance = nearestWalkable(this.grid, front) ?? this.layout.spawnPoint;
          local.pos = { x: entrance.x, y: entrance.y };
          this.placeAvatar(local);
          this.walkView(local, this.layout.spawnPoint);
        } else {
          this.arrival = "done";
        }
      }
    } else if (this.arrival === "step") {
      const local = this.localId ? this.avatarViews.get(this.localId) : null;
      if (!local || !local.moving) this.arrival = "done";
    }
  }

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

    // Occasional gentle idle hop — local avatar only, frozen under reduced
    // motion. Never while walking, so it can't disturb pathing.
    if (view.isLocal && !this.opts.reducedMotion) {
      if (view.hopT > 0) {
        view.hopT = Math.max(0, view.hopT - dt);
      } else if (!view.moving) {
        view.idleClock += dt;
        if (view.idleClock >= view.nextHopAt) {
          view.hopT = HOP_DUR;
          view.idleClock = 0;
          view.nextHopAt = 5 + Math.random() * 6; // 5–11s between hops
        }
      } else {
        view.idleClock = 0;
      }
    }

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
      this.app.canvas.removeEventListener("wheel", this.onWheel);
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
