import type { ZoneInstance, ZoneKey } from "../types";

/**
 * sceneDiff — pure prop-diffing for the renderer's targeted-update paths
 * (AUDIT X6/F6). No Pixi, no renderer state, so the "a prop change no longer
 * triggers a full rebuild" contract is unit-testable.
 *
 * The renderer used to tear down and rebuild every static display object on
 * ANY zones/avatars/theme prop identity change. That was fine for a memoized
 * demo host, but the build engine (Session 5) and the shared island's sync
 * channel (Session 6) stream frequent, small state changes through props —
 * each one must translate into the smallest possible display update.
 *
 * planZoneUpdate compares the previous and next zones arrays by VALUE and
 * returns exactly the work the renderer must do:
 *  - a new array with identical content (the common memo-bust case) → no-op;
 *  - a cosmetic change (unlocked / displayName) → rebuild just that zone's
 *    display bundle + the labels;
 *  - a geometry change (position / footprint / add / remove) → additionally
 *    rebuild the walk grid, the island's scatter keep-out layout, and — only
 *    when the treehouse itself moved — the firefly cloud anchored to it.
 *
 * `skinName` is deliberately EXCLUDED: it is tooltip metadata the world map
 * never renders, so a theme-pack skin rename must not rebuild anything.
 */

/** Value signature of everything the world map RENDERS for a zone. */
export function zoneRenderSig(z: ZoneInstance): string {
  return [
    z.key, z.gridPosition.x, z.gridPosition.y, z.footprint.w, z.footprint.h,
    z.unlocked ? 1 : 0, z.displayName,
  ].join("|");
}

/** Value signature of a zone's world-space geometry (grid + scatter inputs). */
export function zoneGeometrySig(z: ZoneInstance): string {
  return [z.key, z.gridPosition.x, z.gridPosition.y, z.footprint.w, z.footprint.h].join("|");
}

export interface ZoneUpdatePlan {
  /** Zones whose display bundle (landmark scene + fx) must be re-created. */
  rebuildScenes: ZoneKey[];
  /** Zones no longer present — their bundles are torn down. */
  removeScenes: ZoneKey[];
  /** Zone name labels must be re-created (text or zone set changed). */
  rebuildLabels: boolean;
  /** Walk grid must be re-derived (a footprint moved/resized/appeared/left). */
  updateGrid: boolean;
  /** Island scatter keep-out marks changed → re-layout the prop scatter. */
  updateScatter: boolean;
  /** The treehouse (firefly anchor) moved/appeared/left. */
  updateFireflies: boolean;
  /** Nothing rendered changed — the renderer does no display work at all. */
  isNoop: boolean;
}

const FIREFLY_ANCHOR: ZoneKey = "treehouse_hideaway";

export function planZoneUpdate(
  prev: readonly ZoneInstance[],
  next: readonly ZoneInstance[],
): ZoneUpdatePlan {
  const prevByKey = new Map(prev.map((z) => [z.key, z]));
  const nextKeys = new Set(next.map((z) => z.key));

  const rebuildScenes: ZoneKey[] = [];
  const removeScenes: ZoneKey[] = [];
  let geometryChanged = false;
  let fireflyAnchorChanged = false;

  for (const p of prev) {
    if (!nextKeys.has(p.key)) {
      removeScenes.push(p.key);
      geometryChanged = true;
      if (p.key === FIREFLY_ANCHOR) fireflyAnchorChanged = true;
    }
  }
  for (const n of next) {
    const p = prevByKey.get(n.key);
    if (!p) {
      rebuildScenes.push(n.key);
      geometryChanged = true;
      if (n.key === FIREFLY_ANCHOR) fireflyAnchorChanged = true;
      continue;
    }
    if (zoneRenderSig(p) !== zoneRenderSig(n)) rebuildScenes.push(n.key);
    if (zoneGeometrySig(p) !== zoneGeometrySig(n)) {
      geometryChanged = true;
      if (n.key === FIREFLY_ANCHOR) fireflyAnchorChanged = true;
    }
  }

  const anySceneWork = rebuildScenes.length > 0 || removeScenes.length > 0;
  return {
    rebuildScenes,
    removeScenes,
    rebuildLabels: anySceneWork,
    updateGrid: geometryChanged,
    updateScatter: geometryChanged,
    updateFireflies: fireflyAnchorChanged,
    isNoop: !anySceneWork && !geometryChanged,
  };
}
