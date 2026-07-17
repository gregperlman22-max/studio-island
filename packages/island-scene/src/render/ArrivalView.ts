import { Container, Sprite, type Texture } from "pixi.js";

import { getContentBounds } from "./avatarTexture";
import { BOAT_ART } from "./zones";

/**
 * Arrival cinematic — a flat, side-view close-up scene, fully separate from the
 * isometric world projection. A painted landscape (arrival-bg: warm sky, calm
 * water lower, sandy shore + trees on the right) fills the screen as the
 * stage. The side-on covered boat sails smoothly left → right across the water
 * and berths at the shore; SceneRenderer then cross-fades up into the world
 * map, where the chosen avatar steps onto Welcome Dock.
 *
 * The Pete-baked boat ships as TWO layers (hull-back / hull-front, split along
 * the near gunwale — see BOAT_ART). When a rider texture is provided (the
 * player's chosen avatar — the same texture used on-island), it is drawn
 * BETWEEN the layers, feet pinned to the deck at the near rail: hull-back
 * (cabin, Pete, sail) sits behind it, hull-front (near rail) occludes the lower
 * ~third, so the child reads as a passenger standing in front of the cabin
 * while Pete drives. With no rider texture (art still loading, or the
 * free-build sail) the boat simply sails with Pete alone.
 *
 * Screen-space only: the boat moves horizontally in pixels; nothing here touches
 * the iso grid / pathfinding. Reduced motion is handled upstream (the renderer
 * skips this entirely and drops the avatar on the dock).
 */

// Phase timing (seconds) — calm + gentle; all easy to tune.
const SAIL = 4.0;
const SETTLE = 1.0;

export class ArrivalView {
  readonly container = new Container();

  private bg = new Sprite();
  private boatLayer = new Container(); // boat + rider, moved/rocked while sailing
  private boatBack = new Sprite();     // cabin, Pete, sail, far hull (behind rider)
  private rider = new Sprite();
  private boatFront = new Sprite();    // near rail + hull wall (in front of rider)

  private bgTex?: Texture;
  private boatBackTex?: Texture;
  private boatFrontTex?: Texture;
  private riderTex?: Texture;

  private w = 0;
  private h = 0;
  private t = 0;
  private _done = false;
  /** "arrive" sails off-left → berth; "depart" sails berth → off-left (the
   *  free-build island's sail-home). Same easing, mirrored endpoints. */
  private mode: "arrive" | "depart" = "arrive";

  constructor(private reducedMotion: boolean) {
    this.container.addChild(this.bg, this.boatLayer);
    // Layer order: hull-back → rider → hull-front, so the near rail occludes
    // the rider's legs and the cabin/Pete sit behind.
    this.boatLayer.addChild(this.boatBack, this.rider, this.boatFront);
    this.container.visible = false;
    // Both hull layers share the waterline anchor, so they overlay perfectly.
    this.boatBack.anchor.set(BOAT_ART.anchorX, BOAT_ART.anchorY);
    this.boatFront.anchor.set(BOAT_ART.anchorX, BOAT_ART.anchorY);
    this.rider.anchor.set(0.5, 1); // feet (overridden by content bounds in build)
  }

  enter(
    bgTex: Texture | undefined,
    boatBackTex: Texture | undefined,
    boatFrontTex: Texture | undefined,
    w: number,
    h: number,
    mode: "arrive" | "depart" = "arrive",
    riderTex?: Texture,
  ): void {
    this.bgTex = bgTex;
    this.boatBackTex = boatBackTex;
    this.boatFrontTex = boatFrontTex;
    this.riderTex = riderTex;
    this.mode = mode;
    if (bgTex) this.bg.texture = bgTex;
    if (boatBackTex) this.boatBack.texture = boatBackTex;
    if (boatFrontTex) this.boatFront.texture = boatFrontTex;
    if (riderTex) this.rider.texture = riderTex;
    this.t = 0;
    this._done = false;
    this.build(w, h);
    this.container.visible = true;
    this.container.alpha = 1;
  }

  get done(): boolean { return this._done; }

  /** Jump straight to the end state (tap-to-skip): the boat lands at its
   *  destination and the caller's next tick runs its normal exit path. */
  skip(): void {
    if (this._done || !this.container.visible) return;
    this.t = SAIL + SETTLE;
    this.boatLayer.position.set(this.sailTo(), this.waterY());
    this.boatLayer.rotation = 0;
    this._done = true;
  }

  hide(): void { this.container.visible = false; }

  resize(w: number, h: number): void {
    if (!this.container.visible) return;
    this.build(w, h);
  }

  // ── Layout (screen-relative; matches the painted bg: water lower, shore right) ──
  private waterY(): number { return this.h * 0.66; }      // where the hull rides
  private boatStartX(): number { return -this.w * 0.18; } // off the left edge
  private boatBerthX(): number { return this.w * 0.66; }  // near the shore on the right
  private sailFrom(): number { return this.mode === "arrive" ? this.boatStartX() : this.boatBerthX(); }
  private sailTo(): number { return this.mode === "arrive" ? this.boatBerthX() : this.boatStartX(); }
  // Match the on-screen boat height: it fills ~0.29h of the screen.
  private boatScale(): number { return (this.h * 0.29) / (this.boatBackTex?.height ?? 906); }

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

    const haveBoat = !!this.boatBackTex && !!this.boatFrontTex;
    if (haveBoat) {
      const s = this.boatScale();
      const bw = this.boatBackTex!.width * s;
      const bh = this.boatBackTex!.height * s;
      this.boatBack.scale.set(s);
      this.boatFront.scale.set(s);
      this.boatBack.visible = true;
      this.boatFront.visible = true;

      // Rider (passenger) at the near rail, feet pinned; content-anchored so
      // the true feet/centre pin and the sprite scales by visible content.
      if (this.riderTex) {
        const rt = this.riderTex;
        const b = getContentBounds(rt);
        if (b) {
          this.rider.anchor.set(b.centerX, b.feetY);
          this.rider.scale.set((BOAT_ART.riderHeight * bh) / (b.contentH * rt.height));
        } else {
          this.rider.anchor.set(0.5, 1);
          this.rider.scale.set((BOAT_ART.riderHeight * bh) / rt.height);
        }
        this.rider.position.set(
          (BOAT_ART.railX - BOAT_ART.anchorX) * bw,
          (BOAT_ART.railY - BOAT_ART.anchorY) * bh,
        );
        this.rider.visible = true;
      } else {
        this.rider.visible = false;
      }
    } else {
      this.boatBack.visible = false;
      this.boatFront.visible = false;
      this.rider.visible = false;
    }
    this.boatLayer.position.set(this.sailFrom(), this.waterY());
  }

  update(dt: number): void {
    if (!this.container.visible || this._done) return;
    this.t += dt;
    const t = this.t;
    const bob = this.reducedMotion ? 0 : Math.sin(t * 1.2) * (this.h * 0.008);

    // Sail: ease the boat between its endpoints over SAIL seconds.
    const ap = Math.min(1, t / SAIL);
    const e = ap * ap * (3 - 2 * ap); // smoothstep
    const bx = this.sailFrom() + (this.sailTo() - this.sailFrom()) * e;
    this.boatLayer.position.set(bx, this.waterY() + bob);
    // Rock the whole layer (both hull layers + rider together) around the anchor.
    if (!this.reducedMotion) this.boatLayer.rotation = Math.sin(t * 1.2 + 0.5) * 0.025;

    // Once berthed, let it rest a beat before the cross-fade to the world map.
    if (t >= SAIL + SETTLE) this._done = true;
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}
