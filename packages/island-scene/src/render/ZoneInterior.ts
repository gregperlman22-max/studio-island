import type { Container } from "pixi.js";
import type { AvatarConfig, ThemePalette, ZoneKey } from "../types";

/**
 * The Mode-2 interior contract.
 *
 * Two implementations exist, and SceneRenderer picks per zone:
 *   - ZoneView       — the original side-scrolling parallax interior (8 zones);
 *   - TreehouseRoom  — a single painted STATIONARY room (Treehouse Hideaway).
 *
 * This interface was extracted so the renderer can hold either behind one
 * shape. ZoneView satisfies it STRUCTURALLY and was not modified — nothing
 * here may grow a member ZoneView doesn't already have, or the eight
 * scrolling interiors start changing shape for a Treehouse-only reason.
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
  ): void;
  hide(): void;
  resize(w: number, h: number): void;
  /** Re-skin in place (theme / avatar prop change) without losing state. */
  restyle(palette: ThemePalette, cfg: AvatarConfig | null): void;
  update(dt: number): void;
  handleTap(sx: number, sy: number): ZoneTap;
  destroy(): void;
}
