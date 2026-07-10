import { getBuildItem, type BuildItemDef } from "../content/buildItems";
import {
  EMPTY_BUILD_STATE,
  type BuildEvent,
  type BuildRegion,
  type BuildState,
  type Placement,
  type PlacementUpdatePlan,
  type Rotation,
} from "./types";

/**
 * Build engine core — pure functions only (no Pixi, no storage, no DOM).
 * Everything here is deterministic on its inputs, so local taps, save-file
 * loads, and (later) remote sync events all flow through identical logic.
 */

/** The cells a placement occupies: footprint at rotation (1/3 swap w/h). */
export function placementCells(p: Placement, item: BuildItemDef): { x: number; y: number }[] {
  const swap = p.rotation % 2 === 1;
  const w = swap ? item.footprint.h : item.footprint.w;
  const h = swap ? item.footprint.w : item.footprint.h;
  const cells: { x: number; y: number }[] = [];
  for (let dx = 0; dx < w; dx++) {
    for (let dy = 0; dy < h; dy++) {
      cells.push({ x: p.cell.x + dx, y: p.cell.y + dy });
    }
  }
  return cells;
}

const key = (c: { x: number; y: number }) => `${c.x},${c.y}`;

/**
 * Ground-level occupancy + surface map for a state. Stackable placements
 * (sitting ON a surface) don't occupy ground cells; everything else does.
 * `surfaces` maps a cell to the GROUND placement providing a surface there,
 * and `stacked` maps a surface-placement id to the item stacked on it.
 */
export function occupancy(state: BuildState): {
  ground: Map<string, Placement>;
  surfaces: Map<string, Placement>;
  stacked: Map<string, Placement>;
} {
  const ground = new Map<string, Placement>();
  const surfaces = new Map<string, Placement>();
  const stacked = new Map<string, Placement>();
  // Pass 1: ground items claim cells; surface providers register surfaces.
  for (const p of state.placements) {
    const item = getBuildItem(p.itemId);
    if (!item || item.stackable) continue;
    for (const c of placementCells(p, item)) {
      ground.set(key(c), p);
      if (item.surfaceType !== null) surfaces.set(key(c), p);
    }
  }
  // Pass 2: stackables bind to the surface under their anchor cell.
  for (const p of state.placements) {
    const item = getBuildItem(p.itemId);
    if (!item || !item.stackable) continue;
    const host = surfaces.get(key(p.cell));
    if (host) stacked.set(host.id, p);
  }
  return { ground, surfaces, stacked };
}

/**
 * May `placement` legally join `state`?
 *  - every occupied cell inside the buildable region;
 *  - GROUND items: no cell already ground-occupied;
 *  - STACKABLE items: anchor cell must host a surface-providing item whose
 *    surface is still free (one item per surface — no towers), and the
 *    stackable's footprint must be 1×1 by schema (multi-cell stackables are
 *    rejected here defensively).
 */
export function canPlace(state: BuildState, placement: Placement, region: BuildRegion): boolean {
  const item = getBuildItem(placement.itemId);
  if (!item) return false;
  if (state.placements.some((p) => p.id === placement.id)) return false;
  const cells = placementCells(placement, item);
  for (const c of cells) {
    if (!region.buildable(c.x, c.y)) return false;
  }
  const occ = occupancy(state);
  if (item.stackable) {
    if (cells.length !== 1) return false;
    const host = occ.surfaces.get(key(placement.cell));
    if (!host) return false; // stackables live on surfaces only
    if (occ.stacked.has(host.id)) return false; // surface already taken
    return true;
  }
  for (const c of cells) {
    if (occ.ground.has(key(c))) return false;
  }
  return true;
}

/**
 * Pure reducer: apply one event to a state, returning the next state (or the
 * SAME reference when the event is invalid/no-op, so hosts can `===`-check).
 * Removing a surface item also removes whatever is stacked on it — a lantern
 * can't float where its table used to be.
 */
export function applyBuildEvent(
  state: BuildState,
  event: BuildEvent,
  region: BuildRegion,
): BuildState {
  switch (event.type) {
    case "place": {
      if (!canPlace(state, event.placement, region)) return state;
      return { version: 1, placements: [...state.placements, { ...event.placement }] };
    }
    case "remove": {
      const target = state.placements.find((p) => p.id === event.id);
      if (!target) return state;
      const occ = occupancy(state);
      const rider = occ.stacked.get(target.id) ?? null;
      const drop = new Set([event.id, ...(rider ? [rider.id] : [])]);
      return { version: 1, placements: state.placements.filter((p) => !drop.has(p.id)) };
    }
    case "rotate": {
      const target = state.placements.find((p) => p.id === event.id);
      if (!target || target.rotation === event.rotation) return state;
      const rotated: Placement = { ...target, rotation: event.rotation };
      // Re-validate against the world WITHOUT the target (its rotated
      // footprint may sweep different cells).
      const without: BuildState = {
        version: 1,
        placements: state.placements.filter((p) => p.id !== event.id),
      };
      const item = getBuildItem(target.itemId);
      if (!item) return state;
      // A 1×1 (or stackable) rotation never changes cells — always legal.
      const changesCells = item.footprint.w !== item.footprint.h && !item.stackable;
      if (changesCells && !canPlace(without, rotated, region)) return state;
      return {
        version: 1,
        placements: state.placements.map((p) => (p.id === event.id ? rotated : p)),
      };
    }
  }
}

/** Next quarter-turn (the tap-to-rotate cycle). */
export function nextRotation(r: Rotation): Rotation {
  return (((r + 1) % 4) as Rotation);
}

// ── Diff (the sceneDiff pattern, for the view's targeted bundles) ────

const placementSig = (p: Placement): string =>
  [p.itemId, p.cell.x, p.cell.y, p.rotation].join("|");

/**
 * planPlacementUpdate — compare two states by VALUE and return the minimal
 * display work: a same-content state (memo bust / echo of our own event) is
 * a strict no-op; otherwise exactly the added / removed / changed placements.
 */
export function planPlacementUpdate(
  prev: readonly Placement[],
  next: readonly Placement[],
): PlacementUpdatePlan {
  const prevById = new Map(prev.map((p) => [p.id, p]));
  const nextIds = new Set(next.map((p) => p.id));
  const add: Placement[] = [];
  const remove: string[] = [];
  const update: Placement[] = [];
  for (const p of prev) {
    if (!nextIds.has(p.id)) remove.push(p.id);
  }
  for (const n of next) {
    const p = prevById.get(n.id);
    if (!p) add.push(n);
    else if (placementSig(p) !== placementSig(n)) update.push(n);
  }
  return {
    add,
    remove,
    update,
    isNoop: add.length === 0 && remove.length === 0 && update.length === 0,
  };
}

// ── Serialization ────────────────────────────────────────────────────

/**
 * Parse a serialized BuildState defensively: unknown items, malformed
 * placements, and duplicate ids are dropped (a stale save can't crash the
 * island); anything else round-trips exactly.
 */
export function deserializeBuildState(raw: string): BuildState {
  try {
    const data = JSON.parse(raw) as BuildState;
    if (!data || !Array.isArray(data.placements)) return EMPTY_BUILD_STATE;
    const seen = new Set<string>();
    const placements: Placement[] = [];
    for (const p of data.placements) {
      if (
        typeof p?.id !== "string" || seen.has(p.id) ||
        typeof p?.itemId !== "string" || !getBuildItem(p.itemId) ||
        !Number.isInteger(p?.cell?.x) || !Number.isInteger(p?.cell?.y) ||
        ![0, 1, 2, 3].includes(p?.rotation)
      ) {
        continue;
      }
      seen.add(p.id);
      placements.push({ id: p.id, itemId: p.itemId, cell: { x: p.cell.x, y: p.cell.y }, rotation: p.rotation });
    }
    return { version: 1, placements };
  } catch {
    return EMPTY_BUILD_STATE;
  }
}

export function serializeBuildState(state: BuildState): string {
  return JSON.stringify(state);
}
