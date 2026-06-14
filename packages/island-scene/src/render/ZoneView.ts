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
    this.container.addChild(this.sky, this.far, this.mid, this.ground, this.charLayer);
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
  handleTap(sx: number, _sy: number): "move" {
    const worldX = sx + this.camX; // ground plane scrolls 1:1 with the camera
    const m = 50;
    this.targetX = Math.max(m, Math.min(this.env.worldWidth - m, worldX));
    this.moving = Math.abs(this.targetX - this.charX) > 1;
    if (this.moving) this.facing = this.targetX >= this.charX ? 1 : -1;
    return "move";
  }

  /** Advance walk + parallax. dt in seconds. */
  update(dt: number): void {
    if (!this.zone || !this.container.visible) return;
    this.elapsed += dt;

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
