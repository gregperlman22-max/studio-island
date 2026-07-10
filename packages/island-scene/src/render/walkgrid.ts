import type { GridPosition, LayoutConfig, ZoneInstance } from "../types";
import { nearestWalkable, type WalkGrid } from "./pathfind";

/**
 * Build the avatar's walk grid from a layout + zone set. Pure data in,
 * WalkGrid out — no Pixi — so the reachability contract (spawn connects to
 * every zone entrance) is unit-testable. SceneRenderer delegates here.
 *
 * Walkable = the sand the art actually renders (`walkableCells`, generated
 * from the sand-base silhouette; `landCells` only as a legacy fallback),
 * minus decoration cells and zone footprints, then trimmed to the region
 * actually reachable from spawn.
 */
export function buildWalkGrid(layout: LayoutConfig, zones: readonly ZoneInstance[]): WalkGrid {
  const land = new Set(
    (layout.walkableCells ?? layout.landCells).map((c) => `${c.x},${c.y}`),
  );
  const blocked = new Set<string>();
  // NOTE: obstacleCells (legacy home-island tree/rock masses) are deliberately
  // NOT blocked here. Overlaid on the sand silhouette they wall the spawn off
  // from the northern zones, and the only way the old grid routed around them
  // was across ocean cells — the very walk-on-water bug. The visible trees are
  // LayeredIsland scatter props, unrelated to these cells.
  for (const d of layout.decorations ?? []) {
    blocked.add(`${d.position.x},${d.position.y}`);
  }
  for (const z of zones) {
    for (let dx = 0; dx < z.footprint.w; dx++) {
      for (let dy = 0; dy < z.footprint.h; dy++) {
        blocked.add(`${z.gridPosition.x + dx},${z.gridPosition.y + dy}`);
      }
    }
  }
  const base = (x: number, y: number): boolean =>
    land.has(`${x},${y}`) && !blocked.has(`${x},${y}`);

  // The painted coastline is sampled per tile, which leaves a scatter of
  // isolated single-cell "land" specks sitting out on the water's edge — cells
  // the main island can't actually reach. They must never be walkable: the
  // avatar could otherwise be routed onto a tile that reads as ocean, and a
  // zone whose nearest-walkable entrance lands on such a speck would strand the
  // approach (the guide/entry never fires). Flood the reachable region from the
  // spawn using the SAME 8-dir + anti-corner-cut connectivity the pathfinder
  // uses, then keep only those cells — so "walkable" means "the avatar can
  // truly stand there", trimming the frayed water-edge tiles near the coast.
  const spawn = layout.spawnPoint;
  const seed = base(spawn.x, spawn.y)
    ? spawn
    : nearestWalkable({ walkable: base }, spawn) ?? spawn;
  const reachable = new Set<string>();
  if (base(seed.x, seed.y)) {
    const stack: GridPosition[] = [seed];
    reachable.add(`${seed.x},${seed.y}`);
    while (stack.length) {
      const c = stack.pop()!;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nx = c.x + dx, ny = c.y + dy, k = `${nx},${ny}`;
        if (base(nx, ny) && !reachable.has(k)) { reachable.add(k); stack.push({ x: nx, y: ny }); }
      }
      for (const [dx, dy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]] as const) {
        const nx = c.x + dx, ny = c.y + dy, k = `${nx},${ny}`;
        // Diagonals need both shared orthogonal cells open, mirroring findPath's
        // anti-corner-cut rule so reachability matches how walks actually route.
        if (base(nx, ny) && base(c.x + dx, c.y) && base(c.x, c.y + dy) && !reachable.has(k)) {
          reachable.add(k); stack.push({ x: nx, y: ny });
        }
      }
    }
  }
  return { walkable: (x, y) => reachable.has(`${x},${y}`) };
}
