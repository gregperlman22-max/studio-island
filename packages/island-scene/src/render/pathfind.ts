import type { GridPosition } from "../types";

/**
 * Coarse-grid A* pathfinding for tap-to-move. Pure data in, path out — no
 * Pixi, no rendering. 4-neighbour movement keeps walks readable on the
 * isometric grid (no diagonal corner-cutting through water/props).
 */
export interface WalkGrid {
  /** True when grid cell (x, y) can be stood on / walked through. */
  walkable: (x: number, y: number) => boolean;
}

const key = (x: number, y: number) => `${x},${y}`;

const NEIGHBOURS = [
  { dx: 1, dy: 0 },
  { dx: -1, dy: 0 },
  { dx: 0, dy: 1 },
  { dx: 0, dy: -1 },
];

function manhattan(ax: number, ay: number, bx: number, by: number): number {
  return Math.abs(ax - bx) + Math.abs(ay - by);
}

/**
 * Returns the path from `start` to `goal` inclusive of both ends, or null if
 * unreachable. If `goal` itself is not walkable, no path is returned — callers
 * that want "walk next to X" should resolve a walkable target first.
 */
export function findPath(
  grid: WalkGrid,
  start: GridPosition,
  goal: GridPosition,
): GridPosition[] | null {
  if (!grid.walkable(goal.x, goal.y)) return null;
  if (start.x === goal.x && start.y === goal.y) return [{ ...start }];

  const open = new Set<string>([key(start.x, start.y)]);
  const cameFrom = new Map<string, string>();
  const g = new Map<string, number>([[key(start.x, start.y), 0]]);
  const f = new Map<string, number>([
    [key(start.x, start.y), manhattan(start.x, start.y, goal.x, goal.y)],
  ]);
  const coord = new Map<string, GridPosition>([
    [key(start.x, start.y), { x: start.x, y: start.y }],
  ]);

  // Guard against pathological loops on large/odd grids.
  let guard = 100000;

  while (open.size > 0 && guard-- > 0) {
    // Pick the open node with the lowest f score.
    let currentKey = "";
    let best = Infinity;
    for (const k of open) {
      const score = f.get(k) ?? Infinity;
      if (score < best) {
        best = score;
        currentKey = k;
      }
    }

    const current = coord.get(currentKey)!;
    if (current.x === goal.x && current.y === goal.y) {
      return reconstruct(cameFrom, coord, currentKey);
    }

    open.delete(currentKey);
    const currentG = g.get(currentKey) ?? Infinity;

    for (const n of NEIGHBOURS) {
      const nx = current.x + n.dx;
      const ny = current.y + n.dy;
      if (!grid.walkable(nx, ny)) continue;
      const nKey = key(nx, ny);
      const tentative = currentG + 1;
      if (tentative < (g.get(nKey) ?? Infinity)) {
        cameFrom.set(nKey, currentKey);
        g.set(nKey, tentative);
        f.set(nKey, tentative + manhattan(nx, ny, goal.x, goal.y));
        coord.set(nKey, { x: nx, y: ny });
        open.add(nKey);
      }
    }
  }

  return null;
}

function reconstruct(
  cameFrom: Map<string, string>,
  coord: Map<string, GridPosition>,
  endKey: string,
): GridPosition[] {
  const path: GridPosition[] = [];
  let k: string | undefined = endKey;
  while (k) {
    path.unshift(coord.get(k)!);
    k = cameFrom.get(k);
  }
  return path;
}

/**
 * Find the walkable cell nearest to `target` (used to resolve a zone's
 * entrance: tap a zone -> walk to the closest standable tile to its center).
 * Breadth-first ring search outward from the target.
 */
export function nearestWalkable(
  grid: WalkGrid,
  target: GridPosition,
  maxRadius = 12,
): GridPosition | null {
  if (grid.walkable(target.x, target.y)) return { ...target };
  for (let r = 1; r <= maxRadius; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue; // ring only
        const x = target.x + dx;
        const y = target.y + dy;
        if (grid.walkable(x, y)) return { x, y };
      }
    }
  }
  return null;
}
