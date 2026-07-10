import type { GridPosition } from "../types";

/**
 * Build engine — public contract (Session 5).
 *
 * STATE-IN / EVENTS-OUT, the one architecture rule that makes Session 6's
 * shared island cheap: the engine (and its Pixi view) consumes a
 * `BuildState` object and emits `BuildEvent`s. It NEVER mutates its own
 * state and NEVER knows whether a state change came from a local tap or a
 * remote sync channel. The host owns the loop:
 *
 *     tap → view emits event → host applies event (applyBuildEvent, pure)
 *         → host passes new state back → view diffs → targeted display update
 *
 * A future sync module slots into the same loop by broadcasting events and
 * applying remote ones with the identical reducer — zero engine changes.
 */

/** Quarter-turn rotation: 0 = north, 1 = east, 2 = south, 3 = west. */
export type Rotation = 0 | 1 | 2 | 3;

export interface Placement {
  /** Unique per placed instance (host-generated; stable across saves/sync). */
  id: string;
  /** Build-item catalog id (content/build-items.json). */
  itemId: string;
  /** Anchor cell (top-left of the rotated footprint). */
  cell: GridPosition;
  rotation: Rotation;
}

/** The whole scene, serializable as-is to a save slot or a sync channel. */
export interface BuildState {
  version: 1;
  placements: Placement[];
}

export const EMPTY_BUILD_STATE: BuildState = { version: 1, placements: [] };

export type BuildEvent =
  | { type: "place"; placement: Placement }
  | { type: "remove"; id: string }
  | { type: "rotate"; id: string; rotation: Rotation };

/** The buildable world the engine validates against (a static region map). */
export interface BuildRegion {
  /** True when (x, y) may host a placement anchor cell. */
  buildable: (x: number, y: number) => boolean;
}

/** What one placement update requires — mirror of sceneDiff's ZoneUpdatePlan. */
export interface PlacementUpdatePlan {
  add: Placement[];
  remove: string[];
  /** Same id, changed cell/rotation/item — bundle is re-created in place. */
  update: Placement[];
  isNoop: boolean;
}
