import { Container, Sprite, type Texture } from "pixi.js";

/**
 * Arrival cinematic — a flat, side-view close-up scene, fully separate from the
 * isometric world projection. A painted landscape (arrival-bg.png: warm sky,
 * calm water lower, sandy shore + trees on the right) fills the screen as the
 * stage. The side-on covered boat — a pelican captain at the wheel, the
 * passenger tucked out of sight under the canopy — sails smoothly left → right
 * across the water and berths at the shore; SceneRenderer then cross-fades up
 * into the world map, where the chosen avatar steps onto Welcome Dock.
 *
 * The rider is deliberately NOT shown here: the covered boat keeps the
 * passenger hidden during the ride, and the avatar first appears on the dock
 * after the cinematic ends.
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
  private boatLayer = new Container(); // boat, moved while sailing
  private boat = new Sprite();

  private bgTex?: Texture;
  private boatTex?: Texture;

  private w = 0;
  private h = 0;
  private t = 0;
  private _done = false;

  constructor(private reducedMotion: boolean) {
    this.container.addChild(this.bg, this.boatLayer);
    this.boatLayer.addChild(this.boat);
    this.container.visible = false;
    this.boat.anchor.set(0.5267, 0.9062); // hull waterline (matches BOAT_ART)
  }

  enter(
    bgTex: Texture | undefined,
    boatTex: Texture | undefined,
    w: number,
    h: number,
  ): void {
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
  // Match the old boat's on-screen height: it filled ~0.29h of the screen once
  // its transparent margins are accounted for.
  private boatScale(): number { return (this.h * 0.29) / (this.boatTex?.height ?? 906); }

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
  }

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

    // Once berthed, let it rest a beat before the cross-fade to the world map.
    if (t >= SAIL + SETTLE) this._done = true;
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}
