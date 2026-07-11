import { Container, Sprite, type Texture } from "pixi.js";

import { BOAT_ART } from "./zones";

/**
 * Arrival cinematic — a flat, side-view close-up scene, fully separate from the
 * isometric world projection. A painted landscape (arrival-bg: warm sky, calm
 * water lower, sandy shore + trees on the right) fills the screen as the
 * stage. The side-on covered boat sails smoothly left → right across the water
 * and berths at the shore; SceneRenderer then cross-fades up into the world
 * map, where the chosen avatar steps onto Welcome Dock.
 *
 * The boat's helm is EMPTY in the art: when a rider texture is provided (the
 * player's chosen avatar — the same texture used on-island), it is drawn
 * UNDER the boat sprite, feet pinned to the deck behind the ship's wheel, so
 * the wheel and hull occlude the body and the head shows above the wheel —
 * each child sees their own friend sailing in. With no rider texture (art
 * still loading, or the free-build sail) the boat simply sails riderless.
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
  private boat = new Sprite();
  private rider = new Sprite();

  private bgTex?: Texture;
  private boatTex?: Texture;
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
    // Rider BEFORE boat: the hull and wheel occlude the rider's lower body.
    this.boatLayer.addChild(this.rider, this.boat);
    this.container.visible = false;
    this.boat.anchor.set(BOAT_ART.anchorX, BOAT_ART.anchorY); // hull waterline
    this.rider.anchor.set(0.5, 1); // feet
  }

  enter(
    bgTex: Texture | undefined,
    boatTex: Texture | undefined,
    w: number,
    h: number,
    mode: "arrive" | "depart" = "arrive",
    riderTex?: Texture,
  ): void {
    this.bgTex = bgTex;
    this.boatTex = boatTex;
    this.riderTex = riderTex;
    this.mode = mode;
    if (bgTex) this.bg.texture = bgTex;
    if (boatTex) this.boat.texture = boatTex;
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
  // Match the old boat's on-screen height: it filled ~0.29h of the screen once
  // its transparent margins are accounted for.
  private boatScale(): number { return (this.h * 0.29) / (this.boatTex?.height ?? 505); }

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
      const s = this.boatScale();
      this.boat.scale.set(s);
      this.boat.visible = true;

      // Rider at the helm: feet on the deck behind the wheel, in boat-layer
      // coords (the boat sprite sits at the layer origin by its anchor).
      if (this.riderTex) {
        const bw = this.boatTex.width * s;
        const bh = this.boatTex.height * s;
        const riderH = BOAT_ART.riderHeight * bh;
        this.rider.scale.set(riderH / this.riderTex.height);
        this.rider.position.set(
          (BOAT_ART.helmX - BOAT_ART.anchorX) * bw,
          (BOAT_ART.helmY - BOAT_ART.anchorY) * bh,
        );
        this.rider.visible = true;
      } else {
        this.rider.visible = false;
      }
    } else {
      this.boat.visible = false;
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
    // Rock the whole layer (boat + rider together) around the waterline anchor.
    if (!this.reducedMotion) this.boatLayer.rotation = Math.sin(t * 1.2 + 0.5) * 0.025;

    // Once berthed, let it rest a beat before the cross-fade to the world map.
    if (t >= SAIL + SETTLE) this._done = true;
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}
