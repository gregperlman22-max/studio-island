import type { Container, Texture } from "pixi.js";
import type { AvatarConfig, ThemePalette, ZoneKey } from "../types";

/**
 * The Mode-2 interior contract.
 *
 * Two implementations exist, and SceneRenderer picks per zone:
 *   - ZoneView       — the original side-scrolling parallax interior (8 zones);
 *   - TreehouseRoom  — a single painted STATIONARY room (Treehouse Hideaway).
 *
 * This interface was extracted so the renderer can hold either behind one
 * shape. ZoneView satisfies it STRUCTURALLY, and nothing here may grow a
 * member ZoneView doesn't already have, or the eight scrolling interiors
 * start changing shape for a Treehouse-only reason.
 *
 * S-89 / issue #6: `enter` and `restyle` gained ONE OPTIONAL TRAILING
 * parameter, `avatarTex`. Optional and trailing is the whole point — an
 * implementation that ignores it still satisfies the interface structurally,
 * so the constraint above is respected. It exists because `AvatarConfig`
 * describes a PROCEDURAL animal (species / bodyColor / accessory) and carries
 * at most a URL string, never a resolved Texture — so an interior had no way
 * to draw the painted Island Friend the child actually chose, and every zone
 * fell back to the code-drawn compositor. The renderer owns the texture cache;
 * this parameter is how it reaches an interior.
 */

/** What a tap inside an interior resolved to, so the renderer can respond. */
export type ZoneTap = "move" | "exit" | "activity";

export interface ZoneInterior {
  readonly container: Container;
  /** True while this interior is the one on screen. */
  readonly active: boolean;
  enter(
    zone: ZoneKey,
    palette: ThemePalette,
    cfg: AvatarConfig | null,
    w: number,
    h: number,
    /** The chosen Island Friend's resolved art. Absent until it loads (or if
     *  it failed) — implementations fall back to the programmatic compositor. */
    avatarTex?: Texture,
  ): void;
  hide(): void;
  resize(w: number, h: number): void;
  /** Re-skin in place (theme / avatar prop change) without losing state. */
  restyle(palette: ThemePalette, cfg: AvatarConfig | null, avatarTex?: Texture): void;
  update(dt: number): void;
  handleTap(sx: number, sy: number): ZoneTap;
  destroy(): void;
}
