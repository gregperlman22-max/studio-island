import { Container, Sprite, type Texture } from "pixi.js";
import type { AvatarConfig } from "../types";
import { buildAvatarSprite, type AvatarSprite } from "./avatar";

/**
 * Arrival cinematic — a flat, side-view close-up scene, fully separate from the
 * isometric world projection. A painted landscape (arrival-bg.png: warm sky,
 * calm water lower, sandy shore + trees on the right) fills the screen as the
 * stage. The side-on sailboat — with the avatar riding in it — sails smoothly
 * left → right across the water, berths at the shore, the avatar hops out onto
 * the sand, then SceneRenderer cross-fades up into the world map.
 *
 * Screen-space only: the boat moves horizontally in pixels; nothing here touches
 * the iso grid / pathfinding. Reduced motion is handled upstream (the renderer
 * skips this entirely and drops the avatar on the dock).
 */

// Phase timing (seconds) — calm + gentle; all easy to tune.
const SAIL = 4.0;
const HOP = 0.85;
const SETTLE = 0.6;

export class ArrivalView {
  readonly container = new Container();

  private bg = new Sprite();
  private boatLayer = new Container(); // boat + rider, moved together while sailing
  private boat = new Sprite();
  private charLayer = new Container();
  private avatar: AvatarSprite | null = null;

  private cfg: AvatarConfig | null = null;
  private bgTex?: Texture;
  private boatTex?: Texture;

  private w = 0;
  private h = 0;
  private t = 0;
  private _done = false;

  constructor(private reducedMotion: boolean) {
    // Avatar sits BEHIND the boat so the hull's front rim overlaps its lower
    // body (reads as seated IN the boat). It's lifted in front of the boat only
    // when it hops out onto the sand.
    this.container.addChild(this.bg, this.charLayer, this.boatLayer);
    this.boatLayer.addChild(this.boat);
    this.container.visible = false;
    this.boat.anchor.set(0.4892, 0.9027); // hull waterline (matches BOAT_ART)
  }

  enter(
    cfg: AvatarConfig | null,
    bgTex: Texture | undefined,
    boatTex: Texture | undefined,
    w: number,
    h: number,
  ): void {
    this.cfg = cfg;
    this.bgTex = bgTex;
    this.boatTex = boatTex;
    if (bgTex) this.bg.texture = bgTex;
    if (boatTex) this.boat.texture = boatTex;
    this.t = 0;
    this._done = false;
    this.build(w, h);
    this.container.visible = true;
    this.container.alpha = 1;
  }

  get done(): boolean { return this._done; }

  hide(): void { this.container.visible = false; }

  resize(w: number, h: number): void {
    if (!this.container.visible) return;
    this.build(w, h);
  }

  // ── Layout (screen-relative; matches the painted bg: water lower, shore right) ──
  private waterY(): number { return this.h * 0.66; }      // where the hull rides
  private boatStartX(): number { return -this.w * 0.18; } // off the left edge
  private boatBerthX(): number { return this.w * 0.66; }  // near the shore on the right
  private shoreX(): number { return this.w * 0.8; }       // avatar's landing spot on the sand
  private shoreY(): number { return this.h * 0.58; }
  private boatScale(): number { return (this.h * 0.34) / (this.boatTex?.height ?? 1254); }
  // Small enough to ride seated inside the hull (~55% of the earlier size).
  private avatarScale(): number { return Math.max(1.3, Math.min(2.0, this.h / 420)); }

  private build(w: number, h: number): void {
    this.w = w;
    this.h = h;

    // Background scaled to COVER the screen (no letterbox), anchored centre.
    if (this.bgTex) {
      const cover = Math.max(w / this.bgTex.width, h / this.bgTex.height);
      this.bg.anchor.set(0.5);
      this.bg.scale.set(cover);
      this.bg.position.set(w / 2, h / 2);
      this.bg.visible = true;
    } else {
      this.bg.visible = false;
    }

    if (this.boatTex) {
      this.boat.scale.set(this.boatScale());
      this.boat.visible = true;
    } else {
      this.boat.visible = false;
    }
    this.boatLayer.position.set(this.boatStartX(), this.waterY());

    // Avatar built once, riding in the boat hull.
    this.charLayer.removeChildren();
    this.avatar = null;
    if (this.cfg) {
      this.avatar = buildAvatarSprite(this.cfg);
      this.avatar.container.scale.set(this.avatarScale());
      this.charLayer.addChild(this.avatar.container);
    }
  }

  /** Feet height for the seated rider: low in the hull (just above the waterline)
   *  so, drawn behind the boat, only the upper body shows above the gunwale. */
  private riderOffsetY(): number { return -this.boat.height * 0.1; }

  update(dt: number): void {
    if (!this.container.visible || this._done) return;
    this.t += dt;
    const t = this.t;
    const bob = this.reducedMotion ? 0 : Math.sin(t * 1.2) * (this.h * 0.008);

    // Sail: ease the boat from off-left to the berth over SAIL seconds.
    const ap = Math.min(1, t / SAIL);
    const e = ap * ap * (3 - 2 * ap); // smoothstep
    const bx = this.boatStartX() + (this.boatBerthX() - this.boatStartX()) * e;
    this.boatLayer.position.set(bx, this.waterY() + bob);
    if (!this.reducedMotion) this.boat.rotation = Math.sin(t * 1.2 + 0.5) * 0.025;

    const disT = t - SAIL;
    if (this.avatar) {
      if (disT <= 0) {
        // Riding in the boat — track the boat layer.
        this.charLayer.position.set(bx, this.waterY() + bob + this.riderOffsetY());
        this.avatar.container.scale.x = Math.abs(this.avatar.container.scale.x);
      } else {
        // Climbing out: lift the avatar in front of the boat for the hop.
        this.container.setChildIndex(this.charLayer, this.container.children.length - 1);
        // Hop out onto the sandy shore with a gentle arc.
        const d = Math.min(1, disT / HOP);
        const ed = d * d * (3 - 2 * d);
        const fromX = this.boatBerthX();
        const fromY = this.waterY() + this.riderOffsetY();
        const toX = this.shoreX();
        const toY = this.shoreY();
        const arc = Math.sin(ed * Math.PI) * this.h * 0.1;
        this.charLayer.position.set(
          fromX + (toX - fromX) * ed,
          fromY + (toY - fromY) * ed - arc,
        );
      }
    }

    if (t >= SAIL + HOP + SETTLE) this._done = true;
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}
