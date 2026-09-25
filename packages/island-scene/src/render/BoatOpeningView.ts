import { BlurFilter, Container, Rectangle, Sprite, Texture } from "pixi.js";

import { getContentBounds } from "./avatarTexture";
import { OPENING_ART } from "./openingArt";

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

/** Portrait fill. PAD_STRIP: the plate's own edge rows each pad stretches —
 *  the top 40 are sky only (the treehouse canopy starts near row 50), the
 *  bottom 40 are water and dock. PAD_BLEED: stage px each pad reaches under the
 *  plate and past the screen edge, so the blur's soft rim (it fades to
 *  transparent) never shows. PAD_SKY_SHARE: the share of the spare height
 *  given to the sky above the plate. */
const PAD_STRIP = 40;
const PAD_BLEED = 48;
const PAD_SKY_SHARE = 0.62;

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
 * the landing edge; where that leaves the plate shorter than the screen (phone
 * portrait), the painting is continued above and below by a blurred, stretched
 * MIRROR of its own edge rows — sky above, water below — so each seam meets
 * matching colour instead of a hard band. The plate sits a little low (more sky
 * than water in the fill). Narrow views follow the boat and settle on the berth.
 *
 * Reduced motion: the boat is placed at the berth — no travel, no rocking —
 * and the view completes after the settle beat. (SceneRenderer does not start
 * a cinematic under reduced motion at all; this is the view's own guarantee.)
 */
export class BoatOpeningView implements ArrivalCinematic {
  readonly container = new Container();

  private stage = new Container(); // stage px
  private padTop = new Sprite(); // portrait fill: the sky strip, mirrored above
  private padBottom = new Sprite(); // …and the water strip, mirrored below
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
  private strips: Texture[] = []; // the pads' frames over the plate
  private followWeight = 0;

  constructor(private reducedMotion: boolean) {
    this.container.addChild(this.stage);
    this.stage.addChild(this.padTop, this.padBottom, this.env, this.boat);
    this.boat.addChild(this.boatBack, this.captain, this.friend, this.boatFront);
    this.boat.pivot.set(OPENING_ART.pivot.x, OPENING_ART.pivot.y);
    this.captain.anchor.set(OPENING_ART.captain.anchorX, OPENING_ART.captain.anchorY);
    this.captain.position.set(OPENING_ART.captain.x, OPENING_ART.captain.y);
    this.captain.scale.set(OPENING_ART.captain.scale);
    this.container.visible = false;
  }

  enter(kit: OpeningKit, w: number, h: number, friendTex?: Texture): void {
    this.env.texture = kit.environment;
    this.releasePads();
    this.strips = [0, OPENING_ART.stage.h - PAD_STRIP].map(
      (y) =>
        new Texture({
          source: kit.environment.source,
          frame: new Rectangle(0, y, OPENING_ART.stage.w, PAD_STRIP),
        }),
    );
    [this.padTop.texture, this.padBottom.texture] = this.strips;
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
    // display tree and this view's own strip frames only.
    this.releasePads();
    this.container.destroy({ children: true });
    this.blur?.destroy();
    this.blur = undefined;
  }

  /** The pads' strip textures are this view's own frames over the plate's
   *  source: release the frames, never the shared source. */
  private releasePads(): void {
    for (const t of this.strips) t.destroy(false);
    this.strips = [];
    this.padTop.texture = Texture.EMPTY;
    this.padBottom.texture = Texture.EMPTY;
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
    // Cropping vertically takes sky (bottom-aligned); a short plate sits a
    // little below centre, so more of the fill is sky than water.
    this.stage.y = plateH >= h ? h - plateH : (h - plateH) * PAD_SKY_SHARE;

    const gap = plateH < h - 0.5;
    if (gap) {
      this.blur ??= new BlurFilter({ strength: 4 });
      this.blur.strength = Math.min(10, Math.max(4, w * 0.016));
      // Each strip is mirrored about the plate edge (the edge row meets the
      // seam) and stretched over its gap plus the bleed at both ends, in stage px.
      const above = this.stage.y / k + 2 * PAD_BLEED;
      const below = (h - this.stage.y - plateH) / k + 2 * PAD_BLEED;
      // They also bleed past the plate's left and right edges, where the
      // camera can rest at the start of the approach.
      const sx = (S.w + 2 * PAD_BLEED) / S.w;
      this.padTop.scale.set(sx, -above / PAD_STRIP);
      this.padTop.position.set(-PAD_BLEED, PAD_BLEED);
      this.padBottom.scale.set(sx, -below / PAD_STRIP);
      this.padBottom.position.set(-PAD_BLEED, S.h - PAD_BLEED + below);
    }
    for (const pad of [this.padTop, this.padBottom]) {
      pad.visible = gap;
      pad.filters = gap && this.blur ? [this.blur] : [];
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
