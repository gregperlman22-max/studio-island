import { Container, Graphics, Sprite, type Texture } from "pixi.js";
import type { AvatarConfig, ThemePalette } from "../types";
import { buildAvatarSprite, type AvatarSprite } from "./avatar";
import { hexNum, lerpHex } from "./iso";

/**
 * Arrival cinematic — a ground-level, third-person open. The camera sits at the
 * water: a side-on sailboat glides in from the left and berths at the dock
 * (~3.3s), the avatar hops off onto the dock, then SceneRenderer cross-fades up
 * into the world map (Mode 1). Screen-space (not the iso world), so the side-on
 * boat art reads correctly instead of sliding along the diamond grid.
 *
 * Plain TS, mirrors the ZoneView pattern: SceneRenderer owns one, ticks it, and
 * watches `done` to start the cross-fade. Honors reduced motion upstream (the
 * renderer skips this entirely and drops the avatar on the dock).
 */
const INK = 0x23201c;

// Phase timing (seconds).
const APPROACH = 3.3;
const DISEMBARK = 0.8;
const SETTLE = 0.5;

export class ArrivalView {
  readonly container = new Container();

  private sky = new Graphics();
  private sea = new Graphics();
  private dock = new Sprite();
  private boat = new Sprite();
  private charLayer = new Container();
  private avatar: AvatarSprite | null = null;

  private palette!: ThemePalette;
  private cfg: AvatarConfig | null = null;
  private boatTex?: Texture;
  private dockTex?: Texture;

  private w = 0;
  private h = 0;
  private t = 0;
  private _done = false;

  constructor(private reducedMotion: boolean) {
    this.container.addChild(this.sky, this.sea, this.dock, this.boat, this.charLayer);
    this.container.visible = false;
    this.boat.anchor.set(0.4892, 0.9027); // hull waterline (matches BOAT_ART)
    this.dock.anchor.set(0.5205, 0.7676); // dock base (matches LANDMARK_ART)
  }

  /** Begin the cinematic. Textures may be undefined if art failed to load. */
  enter(
    palette: ThemePalette,
    cfg: AvatarConfig | null,
    boatTex: Texture | undefined,
    dockTex: Texture | undefined,
    w: number,
    h: number,
  ): void {
    this.palette = palette;
    this.cfg = cfg;
    this.boatTex = boatTex;
    this.dockTex = dockTex;
    if (boatTex) this.boat.texture = boatTex;
    if (dockTex) this.dock.texture = dockTex;
    this.t = 0;
    this._done = false;
    this.build(w, h);
    this.container.visible = true;
    this.container.alpha = 1;
  }

  get done(): boolean {
    return this._done;
  }

  hide(): void {
    this.container.visible = false;
  }

  resize(w: number, h: number): void {
    if (!this.container.visible) return;
    this.build(w, h);
  }

  // ── Layout helpers (all relative to screen size) ──
  private horizonY(): number { return this.h * 0.44; }
  private waterlineY(): number { return this.h * 0.68; }
  private dockX(): number { return this.w * 0.76; }
  private boatBerthX(): number { return this.w * 0.46; }
  private boatStartX(): number { return -this.w * 0.35; }

  private build(w: number, h: number): void {
    this.w = w;
    this.h = h;
    this.drawBackdrop();

    // Dock on the right at the water's edge.
    if (this.dockTex) {
      const dockH = h * 0.34;
      this.dock.scale.set(dockH / this.dock.texture.height);
      this.dock.position.set(this.dockX(), this.waterlineY() + h * 0.05);
      this.dock.visible = true;
    } else {
      this.dock.visible = false;
    }

    // Boat sized to read beside the dock.
    if (this.boatTex) {
      const boatH = h * 0.3;
      this.boat.scale.set(boatH / this.boat.texture.height);
      this.boat.position.set(this.boatStartX(), this.waterlineY());
      this.boat.visible = true;
    } else {
      this.boat.visible = false;
    }

    // Avatar (built once), hidden until disembark.
    this.charLayer.removeChildren();
    this.avatar = null;
    if (this.cfg) {
      this.avatar = buildAvatarSprite(this.cfg);
      const s = Math.max(2.2, Math.min(3.4, h / 300));
      this.avatar.container.scale.set(s);
      this.charLayer.addChild(this.avatar.container);
      this.charLayer.visible = false;
    }
  }

  /** Sky → sea gradient with a soft horizon, golden glow, and a far shore. */
  private drawBackdrop(): void {
    const { palette } = this;
    const w = this.w, h = this.h, hz = this.horizonY();
    this.sky.clear();
    const bands = 20;
    for (let i = 0; i < bands; i++) {
      const t = i / (bands - 1);
      const yy = (hz * i) / bands;
      const color = lerpHex(palette.skyTop, palette.skyBottom, t);
      this.sky.rect(0, yy, w, hz / bands + 1).fill(color);
    }
    // Warm sun glow near the horizon.
    this.sky.ellipse(w * 0.5, hz, w * 0.5, h * 0.16).fill({ color: 0xffe9b0, alpha: 0.5 });
    // Far island silhouette on the horizon.
    this.sky.ellipse(w * 0.32, hz, w * 0.22, h * 0.05).fill({ color: hexNum(lerpHex(palette.foliage, palette.skyBottom, 0.4)), alpha: 0.7 });
    this.sky.ellipse(w * 0.6, hz, w * 0.16, h * 0.04).fill({ color: hexNum(lerpHex(palette.foliage, palette.skyBottom, 0.5)), alpha: 0.6 });

    // Sea below the horizon.
    this.sea.clear();
    const seaBands = 14;
    for (let i = 0; i < seaBands; i++) {
      const t = i / (seaBands - 1);
      const yy = hz + ((h - hz) * i) / seaBands;
      const color = lerpHex(palette.waterShimmer, palette.water, t);
      this.sea.rect(0, yy, w, (h - hz) / seaBands + 1).fill(color);
    }
  }

  /** Advance the cinematic. dt in seconds. Sets `done` when fully settled. */
  update(dt: number): void {
    if (!this.container.visible || this._done) return;
    this.t += dt;
    const t = this.t;

    // Boat: ease from off-left to the berth over APPROACH seconds.
    const ap = Math.min(1, t / APPROACH);
    const e = ap * ap * (3 - 2 * ap); // smoothstep
    const bx = this.boatStartX() + (this.boatBerthX() - this.boatStartX()) * e;
    const bob = this.reducedMotion ? 0 : Math.sin(t * 1.3) * (this.h * 0.006);
    this.boat.position.set(bx, this.waterlineY() + bob);
    if (!this.reducedMotion) this.boat.rotation = Math.sin(t * 1.3 + 0.5) * 0.02;

    // Disembark: avatar hops from the boat deck up onto the dock.
    const disT = t - APPROACH;
    if (this.avatar) {
      if (disT <= 0) {
        // Ride on the boat deck during approach.
        this.charLayer.visible = e > 0.55; // appear as it nears the dock
        this.charLayer.position.set(bx + this.w * 0.01, this.waterlineY() - this.h * 0.06 + bob);
        this.avatar.container.scale.x = Math.abs(this.avatar.container.scale.x);
      } else {
        this.charLayer.visible = true;
        const d = Math.min(1, disT / DISEMBARK);
        const ed = d * d * (3 - 2 * d);
        const fromX = this.boatBerthX() + this.w * 0.01;
        const toX = this.dockX() - this.w * 0.06;
        const fromY = this.waterlineY() - this.h * 0.06;
        const toY = this.dock.position.y - this.dock.height * 0.62;
        const hop = Math.sin(ed * Math.PI) * this.h * 0.08; // arc
        this.charLayer.position.set(
          fromX + (toX - fromX) * ed,
          fromY + (toY - fromY) * ed - hop,
        );
      }
    }

    if (t >= APPROACH + DISEMBARK + SETTLE) this._done = true;
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}
