import { BlurFilter, Container, Rectangle, Sprite, Texture } from "pixi.js";

import { getContentBounds } from "./avatarTexture";
import { OPENING_ART } from "./openingArt";
import { skyExtensionPixels } from "./skyExtension";

/**
 * What SceneRenderer needs from an arrival cinematic. The approved boat
 * opening (BoatOpeningView) and the earlier covered-boat cinematic
 * (ArrivalView, still the fallback and the free-build sail) both satisfy it.
 */
export interface ArrivalCinematic {
  readonly container: Container;
  readonly done: boolean;
  update(dt: number): void;
  skip(): void;
  resize(w: number, h: number): void;
  destroy(): void;
}

/** Everything the opening draws. Loaded as one all-or-nothing kit. */
export interface OpeningKit {
  environment: Texture;
  boatBack: Texture;
  boatFront: Texture;
  captain: Texture;
}

/** Seconds — this implementation's chosen timing, subject to runtime visual
 * review: the boat decelerates into the berth over 5.5 s (the handoff preview's
 * illustrative pace), then rests a beat while the rocking dies away. Greg
 * approved the visual direction, not these durations. */
export const APPROACH = 5.5;
export const SETTLE = 1.0;

/** Tall-screen sky (see skyExtension.ts). PAINTED_ROWS: height of the sky
 *  texture built from the plate's top row, stretched to fill the spare
 *  height. Fallback when no 2D canvas is available: SKY_ROWS of the plate's top
 *  edge (pure sky — the treehouse canopy starts near row 50) stretched and
 *  blurred sideways only; SKY_BLEED is how far that reaches under the plate and
 *  past its left/right edges, so the blur's soft rim never shows. */
const PAINTED_ROWS = 64;
const SKY_ROWS = 2;
const SKY_BLEED = 48;

/** The sky texture built from the plate's own top row, or undefined when the
 *  image or a 2D canvas is unavailable (then the blurred strip is used). */
function paintSky(env: Texture): Texture | undefined {
  try {
    const src = (env.source as { resource?: unknown }).resource as CanvasImageSource | undefined;
    if (!src || typeof document === "undefined") return undefined;
    const w = OPENING_ART.stage.w;
    const read = document.createElement("canvas");
    read.width = w;
    read.height = 1;
    const rc = read.getContext("2d", { willReadFrequently: true });
    if (!rc) return undefined;
    rc.drawImage(src, 0, 0, w, 1, 0, 0, w, 1);
    const pixels = skyExtensionPixels(rc.getImageData(0, 0, w, 1).data, w, PAINTED_ROWS);
    const out = document.createElement("canvas");
    out.width = w;
    out.height = PAINTED_ROWS;
    const oc = out.getContext("2d");
    if (!oc) return undefined;
    oc.putImageData(new ImageData(pixels, w, PAINTED_ROWS), 0, 0);
    return Texture.from(out);
  } catch {
    return undefined;
  }
}

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/**
 * The boat opening: the sailboat carrying Captain Pete and the child's chosen
 * Friend slows to a stop beside the sun-marked Welcome Dock.
 *
 * Draw order inside the boat: back layer (interior, seats, far rail, mast,
 * sail) → Captain Pete → Friend → front layer (near hull and rail). The two
 * layers are cut from one master on one canvas, so the front covers the
 * passengers' lower bodies and nothing else changes. Boat and passengers share
 * ONE transform (`boat`): only it moves, scales and rocks.
 *
 * Camera: the plate COVERS landscape screens (bottom-aligned, so any vertical
 * crop takes sky, never water or dock). In portrait it never shows less than
 * OPENING_ART.essentialW stage px across — both passengers, the whole boat and
 * the landing edge. The plate is bottom-aligned on EVERY screen: any crop, and
 * any spare height, is sky — never water or the dock. Where the plate is
 * shorter than the screen (phone portrait) the sky simply continues upward:
 * the plate's own top rows, stretched to the screen top and blurred sideways
 * only, so every column keeps its colour and the join has no seam, streak or
 * band. Narrow views follow the boat and settle on the berth.
 *
 * Reduced motion: the boat is placed at the berth — no travel, no rocking —
 * and the view completes after the settle beat. (SceneRenderer does not start
 * a cinematic under reduced motion at all; this is the view's own guarantee.)
 */
export class BoatOpeningView implements ArrivalCinematic {
  readonly container = new Container();

  private stage = new Container(); // stage px
  private sky = new Sprite(); // tall screens: the plate's sky, continued upward
  private env = new Sprite();
  private boat = new Container(); // boat px, pivot on the keel
  private boatBack = new Sprite();
  private captain = new Sprite();
  private friend = new Sprite();
  private boatFront = new Sprite();

  private w = 0;
  private h = 0;
  private t = 0;
  private _done = false;
  private k = 1; // stage px -> screen px
  private blur?: BlurFilter;
  private skyTex?: Texture; // this view's own sky texture (never the plate's)
  private skyPainted = false; // built from the plate's top row (else: strip + blur)
  private followWeight = 0;

  constructor(private reducedMotion: boolean) {
    this.container.addChild(this.stage);
    this.stage.addChild(this.sky, this.env, this.boat);
    this.boat.addChild(this.boatBack, this.captain, this.friend, this.boatFront);
    this.boat.pivot.set(OPENING_ART.pivot.x, OPENING_ART.pivot.y);
    this.captain.anchor.set(OPENING_ART.captain.anchorX, OPENING_ART.captain.anchorY);
    this.captain.position.set(OPENING_ART.captain.x, OPENING_ART.captain.y);
    this.captain.scale.set(OPENING_ART.captain.scale);
    this.container.visible = false;
  }

  enter(kit: OpeningKit, w: number, h: number, friendTex?: Texture): void {
    this.env.texture = kit.environment;
    this.releaseSky();
    const painted = paintSky(kit.environment);
    this.skyPainted = !!painted;
    this.skyTex =
      painted ??
      new Texture({
        source: kit.environment.source,
        frame: new Rectangle(0, 0, OPENING_ART.stage.w, SKY_ROWS),
      });
    this.sky.texture = this.skyTex;
    this.boatBack.texture = kit.boatBack;
    this.boatFront.texture = kit.boatFront;
    this.captain.texture = kit.captain;
    this.placeFriend(friendTex);
    this.t = 0;
    this._done = false;
    this.container.visible = true;
    this.container.alpha = 1;
    this.layout(w, h);
    this.pose();
  }

  get done(): boolean {
    return this._done;
  }

  /** Tap-to-skip: land level at the berth; the caller's next tick exits. */
  skip(): void {
    if (this._done || !this.container.visible) return;
    this.t = APPROACH + SETTLE;
    this._done = true;
    this.pose();
  }

  resize(w: number, h: number): void {
    if (!this.container.visible) return;
    this.layout(w, h);
    this.pose();
  }

  update(dt: number): void {
    if (!this.container.visible || this._done) return;
    this.t += dt;
    if (this.t >= APPROACH + SETTLE) this._done = true;
    this.pose();
  }

  destroy(): void {
    // The kit and Friend textures are shared with the asset cache: destroy the
    // display tree and this view's own sky frame only.
    this.releaseSky();
    this.container.destroy({ children: true });
    this.blur?.destroy();
    this.blur = undefined;
  }

  /** The sky texture is this view's own frame over the plate's source:
   *  release the frame, never the shared source. */
  private releaseSky(): void {
    // A painted sky owns its canvas source; the fallback strip shares the plate's.
    this.skyTex?.destroy(this.skyPainted);
    this.skyTex = undefined;
    this.sky.texture = Texture.EMPTY;
  }

  // ── Placement ──────────────────────────────────────────────────────

  /** The Friend by its measured content (true feet / centre), in boat px. */
  private placeFriend(tex?: Texture): void {
    if (!tex) {
      // No avatar texture (it failed to load): the boat sails with Pete alone.
      this.friend.visible = false;
      return;
    }
    const f = OPENING_ART.friend;
    const b = getContentBounds(tex);
    this.friend.texture = tex;
    if (b) {
      this.friend.anchor.set(b.centerX, b.feetY);
      this.friend.scale.set(f.contentHeight / (b.contentH * tex.height));
    } else {
      this.friend.anchor.set(0.5, 1);
      this.friend.scale.set(f.contentHeight / tex.height);
    }
    this.friend.position.set(f.x, f.y);
    this.friend.visible = true;
  }

  /** Scale, vertical offset and backdrop for this viewport. */
  private layout(w: number, h: number): void {
    this.w = w;
    this.h = h;
    const S = OPENING_ART.stage;
    const cover = Math.max(w / S.w, h / S.h);
    const k = w >= h ? cover : Math.max(w / S.w, Math.min(h / S.h, w / OPENING_ART.essentialW));
    this.k = k;
    this.stage.scale.set(k);
    const plateH = S.h * k;
    // Bottom-aligned everywhere: a crop, or spare height, is always sky.
    this.stage.y = h - plateH;

    const gap = plateH < h - 0.5;
    this.sky.visible = gap;
    if (gap && this.skyPainted) {
      // The painted sky's bottom row IS the plate's top row: meet it exactly
      // (1 stage px under the edge), span the plate's width, reach past the top.
      const tall = this.stage.y / k + 1 + SKY_BLEED;
      this.sky.scale.set(1, tall / PAINTED_ROWS);
      this.sky.position.set(0, 1 - tall);
      this.sky.filters = [];
    } else if (gap) {
      // Fallback — sideways-only blur: smooths column-to-column grain without bleeding
      // the extension's colour vertically into (or away from) the join.
      this.blur ??= new BlurFilter({ strengthX: 8, strengthY: 0, quality: 4 });
      this.blur.strengthX = Math.min(60, Math.max(24, w * 0.1));
      this.blur.strengthY = 0;
      // From SKY_BLEED under the plate's top edge up past the screen top, and
      // past the plate's left/right edges (the camera can rest on either).
      const tall = this.stage.y / k + 2 * SKY_BLEED;
      this.sky.scale.set((S.w + 2 * SKY_BLEED) / S.w, tall / SKY_ROWS);
      this.sky.position.set(-SKY_BLEED, SKY_BLEED - tall);
      this.sky.filters = [this.blur];
    } else {
      this.sky.filters = [];
    }
    // Wide views hold the berth framing; narrow ones follow the boat.
    const visibleW = w / k;
    this.followWeight = clamp01((1100 - visibleW) / (1100 - OPENING_ART.essentialW));
  }

  /** Boat transform and camera for the current time. */
  private pose(): void {
    const A = OPENING_ART;
    const p = this.reducedMotion ? 1 : clamp01(this.t / APPROACH);
    const e = 1 - (1 - p) ** 3; // ease-out: decelerate into the berth
    const t = this.t;
    // Rocking fades out across the settle beat, so the boat is level when done.
    const motion = this.reducedMotion || this._done ? 0 : 1 - clamp01((t - APPROACH) / SETTLE);
    const x = lerp(A.from.x, A.to.x, e);
    const y = lerp(A.from.y, A.to.y, e);
    const s = lerp(A.from.s, A.to.s, e);
    // Restrained rocking, calming as the boat slows.
    const bob = motion * Math.sin(t * 2.1) * 2.2 * (1 - 0.7 * e);
    const roll = motion * Math.sin(t * 1.8) * 0.007 * (1 - 0.65 * e);

    this.boat.scale.set(s);
    this.boat.position.set(x + A.pivot.x * s, y + A.pivot.y * s + bob);
    this.boat.rotation = roll;

    // Camera: the berth framing's centre, shifted with the boat in narrow views.
    const boatCx = x + 627 * s;
    const endCx = A.to.x + 627 * A.to.s;
    const berthCx = (A.essential.left + A.essential.right) / 2;
    const cx = berthCx + (boatCx - endCx) * this.followWeight;
    const plateW = A.stage.w * this.k;
    const ox = this.w / 2 - cx * this.k;
    this.stage.x = Math.min(0, Math.max(this.w - plateW, ox));
  }
}
