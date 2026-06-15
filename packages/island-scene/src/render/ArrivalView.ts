import { Container, Graphics } from "pixi.js";
import type { AvatarConfig, ThemePalette } from "../types";
import { buildAvatarSprite, type AvatarSprite } from "./avatar";
import { hexNum, lerpHex, shade } from "./iso";

const INK = 0x23201c;

/** Duration of each arrival phase (seconds). */
const APPROACH_DUR = 3.0;
const DISEMBARK_DUR = 1.3;

export interface ArrivalViewOptions {
  reducedMotion: boolean;
}

/**
 * M1 — Ground-level parallax cinematic shown before the world map on every load.
 * The child's boat sails in from the left and docks at Welcome Dock (~4.3 s total).
 *
 * Screen-space layers (back → front):
 *   sky · horizon (far island) · animated sea · dock · boat+avatar
 *
 * Plain TS, no React. SceneRenderer owns one of these and calls update() each
 * frame; onDone fires when the disembark completes so the host can fade to the
 * world map.
 */
export class ArrivalView {
  readonly container = new Container();

  private sky = new Graphics();
  private horizon = new Graphics();
  private sea = new Graphics();
  private dockLayer = new Graphics();
  private boatLayer = new Container();
  private boatHull = new Graphics();
  private boatSail = new Graphics();
  private avatarContainer = new Container();

  private w = 0;
  private h = 0;
  private palette!: ThemePalette;
  private avatarCfg: AvatarConfig | null = null;
  private avatarSprite: AvatarSprite | null = null;

  /** Current phase of the arrival cinematic. */
  private phase: "approach" | "disembark" | "done" = "approach";
  private elapsed = 0; // within current phase

  constructor(
    private opts: ArrivalViewOptions,
    private onDone: () => void,
  ) {
    this.container.addChild(
      this.sky,
      this.horizon,
      this.sea,
      this.dockLayer,
      this.boatLayer,
    );
    this.boatLayer.addChild(this.boatHull, this.boatSail, this.avatarContainer);
    this.container.visible = false;
  }

  /** Rebuild from scratch for new dimensions / palette / avatar. */
  build(
    w: number,
    h: number,
    palette: ThemePalette,
    avatarCfg: AvatarConfig | null,
  ): void {
    this.w = w;
    this.h = h;
    this.palette = palette;
    this.avatarCfg = avatarCfg;

    this.drawSky();
    this.drawHorizon();
    this.drawDock();
    this.drawBoatArt();
    this.buildAvatarArt();

    this.phase = "approach";
    this.elapsed = 0;
    this.container.visible = true;
    this.layoutApproach(0);
  }

  /** Keep the static elements consistent after a window resize. */
  resize(w: number, h: number): void {
    this.w = w;
    this.h = h;
    if (!this.palette) return;
    this.drawSky();
    this.drawHorizon();
    this.drawDock();
    this.drawBoatArt();
    const t =
      this.phase === "approach" ? Math.min(1, this.elapsed / APPROACH_DUR) : 1;
    this.layoutApproach(t);
  }

  /** Advance the cinematic. dt in seconds. */
  update(dt: number): void {
    if (this.phase === "done") return;
    this.elapsed += dt;

    if (this.phase === "approach") {
      const t = Math.min(1, this.elapsed / APPROACH_DUR);
      this.layoutApproach(t);
      this.drawAnimatedSea(t);
      if (t >= 1) {
        this.phase = "disembark";
        this.elapsed = 0;
        console.info("[island-scene] ArrivalView → disembark");
      }
    } else if (this.phase === "disembark") {
      const t = Math.min(1, this.elapsed / DISEMBARK_DUR);
      this.layoutDisembark(t);
      this.drawAnimatedSea(1);
      if (t >= 1) {
        this.phase = "done";
        console.info("[island-scene] ArrivalView → done");
        this.onDone();
      }
    }
  }

  hide(): void {
    this.container.visible = false;
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }

  // ── Static layer drawing ─────────────────────────────────────────

  private drawSky(): void {
    const { w, h, palette } = this;
    this.sky.clear();
    const skyH = h * 0.52;
    const bands = 22;
    for (let i = 0; i < bands; i++) {
      const t = i / (bands - 1);
      const col = lerpHex(palette.skyTop, palette.skyBottom, t);
      this.sky.rect(0, (skyH * i) / bands, w, skyH / bands + 1).fill(col);
    }
    // Warm morning sun glow (upper right)
    for (let i = 0; i < 4; i++) {
      this.sky
        .ellipse(w * 0.76, h * 0.13, 68 + i * 32, 38 + i * 18)
        .fill({ color: 0xffe9a0, alpha: 0.15 - i * 0.03 });
    }
    this.sky
      .ellipse(w * 0.76, h * 0.13, 18, 11)
      .fill({ color: 0xfffbe0, alpha: 0.85 });
    // Soft cloud wisps
    for (let i = 0; i < 3; i++) {
      const cx = w * (0.2 + i * 0.22);
      const cy = h * (0.1 + i * 0.06);
      this.sky
        .ellipse(cx, cy, 52 + i * 14, 12 + i * 4)
        .fill({ color: 0xffffff, alpha: 0.28 });
      this.sky
        .ellipse(cx + 22, cy - 4, 30 + i * 8, 10 + i * 3)
        .fill({ color: 0xffffff, alpha: 0.22 });
    }
  }

  private drawHorizon(): void {
    const { w, h, palette } = this;
    this.horizon.clear();
    const hy = h * 0.50;

    // Sea fill below horizon
    this.horizon.rect(0, hy, w, h - hy).fill(hexNum(palette.water));

    // Soft horizon glow
    this.horizon
      .rect(0, hy - 4, w, 8)
      .fill({ color: hexNum(palette.waterShimmer), alpha: 0.25 });

    // Distant island silhouette (center-right, hazy)
    const ix = w * 0.64;
    const iy = hy - 3;
    this.horizon
      .ellipse(ix, iy, 120, 22)
      .fill(hexNum(shade(palette.land, -0.3)));
    this.horizon
      .ellipse(ix - 28, iy - 14, 36, 18)
      .fill(hexNum(shade(palette.foliage, -0.14)));
    this.horizon
      .ellipse(ix + 34, iy - 9, 28, 14)
      .fill(hexNum(shade(palette.foliage, -0.20)));
    // Lighthouse silhouette (tiny, far away)
    this.horizon
      .rect(ix + 52, iy - 28, 6, 28)
      .fill(hexNum(shade(palette.land, -0.4)));
    this.horizon
      .ellipse(ix + 55, iy - 28, 5, 3)
      .fill({ color: 0xfffbe0, alpha: 0.7 });
  }

  private drawDock(): void {
    const { w, h } = this;
    this.dockLayer.clear();

    // Dock juts in from the right — only its left portion is visible.
    // The boat pulls up to the left edge of the dock.
    const dockX = this.dockLeft();
    const dockY = h * 0.535;
    const dockW = w * 0.38; // extends off-screen right
    const dockH = 26;

    // Platform surface
    this.dockLayer
      .roundRect(dockX, dockY, dockW, dockH, 4)
      .fill(0xcb9f5e)
      .stroke({ width: 3.5, color: INK });

    // Plank lines
    for (let i = 1; i <= 5; i++) {
      const px = dockX + (dockW * i) / 6;
      this.dockLayer
        .moveTo(px, dockY + 3)
        .lineTo(px, dockY + dockH - 3)
        .stroke({ width: 1.5, color: INK, alpha: 0.28 });
    }

    // Top-surface highlight stripe
    this.dockLayer
      .roundRect(dockX + 4, dockY + 3, dockW - 8, 7, 2)
      .fill({ color: 0xffffff, alpha: 0.12 });

    // Pilings (in the water beneath the dock)
    const pilings = 3;
    for (let i = 0; i < pilings; i++) {
      const px = dockX + (dockW * (i + 0.6)) / (pilings + 0.5);
      this.dockLayer
        .roundRect(px - 7, dockY + dockH, 14, 42 + i * 5, 3)
        .fill(0xa07040)
        .stroke({ width: 2.5, color: INK });
      // Piling ring (rope wrap)
      this.dockLayer
        .roundRect(px - 7, dockY + dockH + 14, 14, 5, 1)
        .fill({ color: 0xffa040, alpha: 0.55 });
    }

    // Mooring cleats at the dock edge (where the boat ties up)
    for (let i = 0; i < 2; i++) {
      const cx = dockX + 8;
      const cy = dockY + (dockH * (i + 0.6)) / 2;
      this.dockLayer.roundRect(cx - 5, cy - 4, 10, 8, 2).fill(0x8a6a40).stroke({ width: 2, color: INK });
    }
  }

  /**
   * Programmatic side-view sailboat — same Wind Waker register as the rest of
   * the world. Origin at the waterline center. Art extends up for the mast and
   * down for the hull.
   */
  private drawBoatArt(): void {
    const h = this.boatHull;
    h.clear();

    // Hull shadow on water
    h.ellipse(0, 20, 52, 9).fill({ color: 0x000000, alpha: 0.11 });

    // Hull shape (side view)
    h.poly([-46, 0, 46, 0, 38, 20, -36, 20])
      .fill(0xb5763f)
      .stroke({ width: 3.5, color: INK });

    // Gunwale (top edge)
    h.roundRect(-46, -5, 92, 8, 3)
      .fill(0xcf9457)
      .stroke({ width: 3, color: INK });

    // Interior shadow / planking
    h.roundRect(-34, 3, 68, 12, 2).fill({ color: 0x000000, alpha: 0.09 });
    h.roundRect(-34, 3, 68, 5, 2).fill({ color: 0xcf9457, alpha: 0.5 });

    const s = this.boatSail;
    s.clear();

    // Mast
    s.moveTo(2, -5).lineTo(2, -82).stroke({ width: 4.5, color: INK });

    // Main sail (filled triangle, warm cream)
    s.poly([2, -78, 2, -6, 50, -30])
      .fill(0xfff5e8)
      .stroke({ width: 3, color: INK });
    // Sail shading
    s.poly([6, -64, 6, -10, 38, -30]).fill({ color: 0xf0dfc4, alpha: 0.42 });
    // Sail highlight crease
    s.poly([6, -66, 6, -48, 22, -54]).fill({ color: 0xffffff, alpha: 0.22 });

    // Jib (small front sail)
    s.poly([2, -62, 2, -16, -26, -36])
      .fill(0xfff5e8)
      .stroke({ width: 2.5, color: INK });

    // Flag at top
    s.poly([2, -82, 16, -74, 2, -66])
      .fill(0xe85d4a)
      .stroke({ width: 2, color: INK });

    // Boom (horizontal spar along foot of sail)
    s.moveTo(-1, -6).lineTo(52, -6).stroke({ width: 3, color: INK });
  }

  private buildAvatarArt(): void {
    this.avatarContainer.removeChildren().forEach((c) => c.destroy());
    this.avatarSprite = null;
    if (!this.avatarCfg) return;
    this.avatarSprite = buildAvatarSprite(this.avatarCfg);
    this.avatarSprite.container.scale.set(2.0);
    this.avatarSprite.setSelected(true); // local player ring
    this.avatarContainer.addChild(this.avatarSprite.container);
  }

  // ── Per-frame layout ─────────────────────────────────────────────

  /** Position the boat+avatar for approach progress t ∈ [0,1]. */
  private layoutApproach(approachT: number): void {
    const pos = this.boatScreenPos(approachT);
    const bob = this.opts.reducedMotion ? 0 : Math.sin(this.elapsed * 3.1) * 2.8 * pos.scale;
    const tilt = this.opts.reducedMotion ? 0 : Math.sin(this.elapsed * 1.7) * 0.035;
    this.boatLayer.position.set(pos.x, pos.y + bob);
    this.boatLayer.scale.set(pos.scale);
    this.boatLayer.rotation = tilt;
    // Avatar stands on deck (feet at deck level, y≈-5 in boat local space)
    this.avatarContainer.position.set(-12, -5);
    this.avatarContainer.visible = true;
  }

  /** Boat holds at dock; avatar steps off rightward onto the dock. */
  private layoutDisembark(t: number): void {
    const pos = this.boatScreenPos(1);
    const bob = this.opts.reducedMotion ? 0 : Math.sin(this.elapsed * 3.1) * 1.6;
    const tilt = this.opts.reducedMotion ? 0 : Math.sin(this.elapsed * 1.7) * 0.018;
    this.boatLayer.position.set(pos.x, pos.y + bob);
    this.boatLayer.scale.set(pos.scale);
    this.boatLayer.rotation = tilt;

    // Avatar hops off the boat and walks onto the dock
    const ease = t * t * (3 - 2 * t); // smoothstep
    const avX = -12 + ease * 96; // boat center → onto dock
    const avY = -5 - Math.max(0, Math.sin(t * Math.PI) * 10); // gentle hop
    this.avatarContainer.position.set(avX, avY);
  }

  // ── Animated sea (redrawn every frame) ──────────────────────────

  private drawAnimatedSea(approachT: number): void {
    const { w, h, palette } = this;
    this.sea.clear();
    const horizonY = h * 0.50;
    const t = this.elapsed;
    const shimmer = hexNum(palette.waterShimmer);

    // Wave bands at varying depths
    for (let i = 0; i < 6; i++) {
      const wy = horizonY + 16 + i * 28 + Math.sin(t * 0.85 + i * 0.78) * 5;
      const wx = Math.sin(t * 0.52 + i * 1.15) * 24;
      const alpha = 0.09 + 0.05 * Math.sin(t * 1.2 + i * 0.9);
      this.sea
        .ellipse(w * 0.5 + wx, wy, w * (0.26 + i * 0.055), 5 + i * 2)
        .fill({ color: shimmer, alpha });
    }

    // Boat wake (V-shaped trail, fades as boat slows near dock)
    if (approachT < 0.91) {
      const pos = this.boatScreenPos(approachT);
      const wakeA = (1 - approachT) * 0.20;
      for (let i = 0; i < 3; i++) {
        const wx = pos.x - (58 + i * 42) * pos.scale;
        const wy = pos.y + 16 * pos.scale;
        this.sea
          .ellipse(wx, wy, (26 + i * 9) * pos.scale, (4 - i) * pos.scale)
          .fill({ color: shimmer, alpha: wakeA * (1 - i * 0.28) });
      }
    }
  }

  // ── Helpers ──────────────────────────────────────────────────────

  /**
   * The x-coordinate of the dock's left (water-facing) edge.
   * The boat docks here: at approachT=1, boatRight ≈ dockLeft.
   */
  private dockLeft(): number {
    return this.w * 0.67;
  }

  /** Boat screen position + uniform scale for approach progress t ∈ [0,1]. */
  private boatScreenPos(t: number): { x: number; y: number; scale: number } {
    const ease = t * t * (3 - 2 * t); // smoothstep
    // Boat docks with its right edge (hull extends +46 local units) at dockLeft.
    const x1 = this.dockLeft() - 46; // hull right edge lands at dock edge
    const x0 = this.w * 0.08;        // starts at left
    return {
      x: x0 + (x1 - x0) * ease,
      y: this.h * 0.565,
      scale: 0.50 + (1.0 - 0.50) * ease, // grows from distant to full-size
    };
  }
}
