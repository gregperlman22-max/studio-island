import { Container, Graphics } from "pixi.js";
import type { AvatarConfig, ZoneKey, ThemePalette } from "../types";
import { buildAvatarSprite, type AvatarSprite } from "./avatar";
import { buildZoneEnv, PARALLAX, type EnvLayers, type ZoneEnv } from "./zoneEnv";

/**
 * Mode 2 — third-person zone view. A ground-level, behind-the-character take on
 * a zone, faked from 2D parallax layers (sky / far / mid / ground) plus a large
 * animal avatar that taps to walk left & right across the ground plane. The
 * world is wider than the screen, so the child explores to find the beacon.
 *
 * Plain TS, screen-space. SceneRenderer owns one of these and swaps it in for
 * the world map while `currentZone` is set. Props in, callbacks out — the
 * renderer wires taps + the per-frame tick.
 */

/** Ground-plane walk speed (px/sec). */
const WALK_SPEED = 320;

export interface ZoneViewOptions {
  reducedMotion: boolean;
}

export class ZoneView {
  readonly container = new Container();

  // Parallax layers, back → front. Sky never scrolls; far/mid/ground scroll at
  // increasing rates; the character rides the ground plane in front of all.
  private sky = new Graphics();
  private far = new Container();
  private mid = new Container();
  private ground = new Container();
  private beaconGlow = new Graphics();
  private charLayer = new Container();
  /** Tap-feedback ripples (screen space, above everything). */
  private fx = new Container();
  private ripples: { g: Graphics; age: number }[] = [];

  private env!: ZoneEnv;
  private zone: ZoneKey | null = null;
  private palette!: ThemePalette;
  private cfg: AvatarConfig | null = null;
  private avatar: AvatarSprite | null = null;

  private w = 0;
  private h = 0;

  // Ground-plane motion state.
  private charX = 0;
  private targetX = 0;
  private camX = 0;
  private facing = 1; // +1 faces right (toward the beacon), -1 faces left
  private phase = 0;
  private moving = false;
  private elapsed = 0;

  constructor(private opts: ZoneViewOptions) {
    // Back → front: sky, far silhouettes, mid landmark, ground strip, character,
    // then tap-feedback FX on top of all of it.
    this.container.addChild(this.sky, this.far, this.mid, this.ground, this.charLayer, this.fx);
    this.container.visible = false;
  }

  /** Build (or rebuild) the environment for `zone` at the given size. */
  enter(zone: ZoneKey, palette: ThemePalette, cfg: AvatarConfig | null, w: number, h: number): void {
    this.zone = zone;
    this.palette = palette;
    this.cfg = cfg;
    this.build(w, h);
    // Spawn left of the beacon, facing it.
    this.charX = this.targetX = this.env.spawnX;
    this.camX = this.clampCam(this.charX - this.anchorX());
    this.facing = 1;
    this.moving = false;
    this.phase = 0;
    this.container.visible = true;
    this.layout();
  }

  hide(): void {
    this.container.visible = false;
  }

  get active(): boolean {
    return this.container.visible;
  }

  /** Rebuild layers for the current zone at a new size (resize / re-enter). */
  private build(w: number, h: number): void {
    this.w = w;
    this.h = h;
    const layers: EnvLayers = {
      sky: this.sky,
      far: this.far,
      mid: this.mid,
      ground: this.ground,
      beaconGlow: this.beaconGlow,
    };
    this.env = buildZoneEnv(this.zone!, layers, w, h, this.palette);

    // (Re)build the avatar at zone scale: ~2× the world-map size, 3/4 side view.
    this.charLayer.removeChildren();
    this.avatar = null;
    if (this.cfg) {
      this.avatar = buildAvatarSprite(this.cfg);
      this.avatar.container.scale.set(this.charScale());
      this.charLayer.addChild(this.avatar.container);
    }

    // Diagnostic: confirm the layers were actually populated. If any child
    // count is 0 (other than sky, which is a single Graphics), the env builder
    // didn't draw — surface that loudly rather than failing silently.
    console.info(
      `[island-scene] ZoneView.build zone=${this.zone} size=${w}x${h} ` +
        `worldWidth=${this.env.worldWidth.toFixed(0)} spawnX=${this.env.spawnX.toFixed(0)} ` +
        `beaconX=${this.env.beacon.x.toFixed(0)} | layer children → ` +
        `far:${this.far.children.length} mid:${this.mid.children.length} ground:${this.ground.children.length} ` +
        `char:${this.charLayer.children.length} | visible=${this.container.visible} attached=${!!this.container.parent}`,
    );
  }

  resize(w: number, h: number): void {
    if (!this.zone) return;
    // Keep the explorer roughly where they were across a resize.
    const frac = this.env ? this.charX / this.env.worldWidth : 0.2;
    this.build(w, h);
    this.charX = this.targetX = frac * this.env.worldWidth;
    this.camX = this.clampCam(this.charX - this.anchorX());
    this.layout();
  }

  /** Re-skin in place (theme / avatar prop change) without losing position. */
  restyle(palette: ThemePalette, cfg: AvatarConfig | null): void {
    if (!this.zone) return;
    this.palette = palette;
    this.cfg = cfg;
    const frac = this.env ? this.charX / this.env.worldWidth : 0.2;
    this.build(this.w, this.h);
    this.charX = this.targetX = frac * this.env.worldWidth;
    this.camX = this.clampCam(this.charX - this.anchorX());
    this.layout();
  }

  private anchorX(): number {
    return this.w * 0.4; // character rests centered-left
  }

  private charScale(): number {
    // World map draws avatars at scale 1.6; zone view wants ~2× that, nudged
    // up on taller screens so the character stays readable.
    return Math.max(3.2, Math.min(4.4, this.h / 230));
  }

  private charFeetY(): number {
    return this.h * 0.82;
  }

  /** Clamp the camera so we never scroll past the world's edges. */
  private clampCam(x: number): number {
    const max = Math.max(0, this.env.worldWidth - this.w);
    return Math.max(0, Math.min(max, x));
  }

  /**
   * Handle a tap at screen (sx, sy): walk toward that point on the ground plane.
   * Returns the kind of thing tapped so the renderer can react (beacon / exit
   * interactions land in later milestones; M1 just walks).
   */
  handleTap(sx: number, sy: number): "move" {
    this.spawnRipple(sx, sy);
    const worldX = sx + this.camX; // ground plane scrolls 1:1 with the camera
    const m = 50;
    this.targetX = Math.max(m, Math.min(this.env.worldWidth - m, worldX));
    this.moving = Math.abs(this.targetX - this.charX) > 1;
    if (this.moving) this.facing = this.targetX >= this.charX ? 1 : -1;
    console.info(
      `[island-scene] ZoneView.handleTap screen=(${sx.toFixed(0)},${sy.toFixed(0)}) ` +
        `→ worldX=${worldX.toFixed(0)} target=${this.targetX.toFixed(0)} moving=${this.moving}`,
    );
    return "move";
  }

  /** A quick expanding ring at the tap point so taps are visibly registering. */
  private spawnRipple(sx: number, sy: number): void {
    const g = new Graphics();
    g.circle(0, 0, 14).stroke({ width: 3, color: 0xffffff, alpha: 0.95 });
    g.circle(0, 0, 4).fill({ color: 0xffffff, alpha: 0.9 });
    g.position.set(sx, sy);
    this.fx.addChild(g);
    this.ripples.push({ g, age: 0 });
  }

  private tickRipples(dt: number): void {
    for (let i = this.ripples.length - 1; i >= 0; i--) {
      const r = this.ripples[i];
      r.age += dt;
      const t = r.age / 0.55;
      if (t >= 1) {
        r.g.destroy();
        this.ripples.splice(i, 1);
        continue;
      }
      r.g.scale.set(1 + t * 2.4);
      r.g.alpha = 1 - t;
    }
  }

  /** Advance walk + parallax. dt in seconds. */
  update(dt: number): void {
    if (!this.zone || !this.container.visible) return;
    this.elapsed += dt;
    this.tickRipples(dt);

    if (this.moving) {
      const dx = this.targetX - this.charX;
      const step = WALK_SPEED * dt;
      if (Math.abs(dx) <= step) {
        this.charX = this.targetX;
        this.moving = false;
      } else {
        this.charX += Math.sign(dx) * step;
        this.facing = dx >= 0 ? 1 : -1;
      }
    }
    this.phase += dt * (this.moving ? 9 : 2.2);

    // Camera eases to keep the character at the rest anchor (clamped to world).
    const camTarget = this.clampCam(this.charX - this.anchorX());
    if (this.opts.reducedMotion) {
      this.camX = camTarget;
    } else {
      this.camX += (camTarget - this.camX) * (1 - Math.exp(-7 * dt));
    }

    this.layout();

    // Beacon proximity (0 far → 1 at the beacon) drives the glow + flame pulse.
    if (!this.opts.reducedMotion && this.env.animate) {
      const d = Math.abs(this.charX - this.env.beacon.x);
      const prox = Math.max(0, 1 - d / (this.env.beacon.r * 2.4));
      this.env.animate(this.elapsed, prox);
    }
  }

  /** Apply the parallax offsets + character placement for the current frame. */
  private layout(): void {
    this.sky.position.x = 0; // sky is infinitely far — it never scrolls
    this.far.position.x = -this.camX * PARALLAX.far;
    this.mid.position.x = -this.camX * PARALLAX.mid;
    this.ground.position.x = -this.camX * PARALLAX.ground;

    if (this.avatar) {
      const screenX = this.charX - this.camX; // ground plane (factor 1.0)
      const amp = this.opts.reducedMotion ? 0 : this.moving ? 7 : 2.4;
      const bob = Math.abs(Math.sin(this.phase)) * amp;
      this.charLayer.position.set(screenX, this.charFeetY() - bob);
      this.avatar.container.scale.x = this.facing * this.charScale();
    }
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}
