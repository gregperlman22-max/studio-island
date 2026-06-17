import type { GridPosition } from "../types";

/**
 * Coarse-grid A* pathfinding for tap-to-move. Pure data in, path out — no
 * Pixi, no rendering.
 *
 * Movement is 8-directional so walks read like a person crossing open ground,
 * not a maze solver stepping in right angles. Diagonals cost √2 and are only
 * allowed when BOTH orthogonal cells they pass between are walkable, so the
 * avatar can never slip through the corner of an obstacle (a painted boulder,
 * tree mass, or zone structure). A final string-pulling pass collapses the grid
 * path to its essential waypoints wherever there is a clear line of sight, so
 * clear shots render as straight diagonals instead of staircases.
 */
export interface WalkGrid {
  /** True when grid cell (x, y) can be stood on / walked through. */
  walkable: (x: number, y: number) => boolean;
}

const key = (x: number, y: number) => `${x},${y}`;
const SQRT2 = Math.SQRT2;

const ORTHO: ReadonlyArray<readonly [number, number]> = [
  [1, 0], [-1, 0], [0, 1], [0, -1],
];
const DIAG: ReadonlyArray<readonly [number, number]> = [
  [1, 1], [1, -1], [-1, 1], [-1, -1],
];

/** Octile distance — admissible heuristic for 8-dir movement with √2 diagonals. */
function octile(ax: number, ay: number, bx: number, by: number): number {
  const dx = Math.abs(ax - bx);
  const dy = Math.abs(ay - by);
  return dx + dy + (SQRT2 - 2) * Math.min(dx, dy);
}

/**
 * Line-of-sight between two cells (Bresenham), used by the smoothing pass. A
 * diagonal step is only "clear" when both side cells are walkable too, so a
 * smoothed straight line obeys the same anti-corner-cutting rule as the A*
 * search and never visually clips an obstacle corner.
 */
function lineOfSight(grid: WalkGrid, a: GridPosition, b: GridPosition): boolean {
  let x = a.x;
  let y = a.y;
  const dx = Math.abs(b.x - x);
  const dy = Math.abs(b.y - y);
  const sx = x < b.x ? 1 : -1;
  const sy = y < b.y ? 1 : -1;
  let err = dx - dy;
  // Guard against degenerate loops.
  let guard = dx + dy + 2;
  while (guard-- > 0) {
    if (!grid.walkable(x, y)) return false;
    if (x === b.x && y === b.y) return true;
    const e2 = 2 * err;
    let movedX = false;
    let movedY = false;
    if (e2 > -dy) { err -= dy; x += sx; movedX = true; }
    if (e2 < dx) { err += dx; y += sy; movedY = true; }
    if (movedX && movedY) {
      // Diagonal hop: both orthogonal cells must be clear (no corner cut).
      if (!grid.walkable(x - sx, y) || !grid.walkable(x, y - sy)) return false;
    }
  }
  return false;
}

/**
 * String-pulling: keep a waypoint only when the line of sight from the last
 * committed anchor breaks. Endpoints are always preserved.
 */
function smooth(grid: WalkGrid, path: GridPosition[]): GridPosition[] {
  if (path.length <= 2) return path;
  const out: GridPosition[] = [path[0]];
  let anchor = 0;
  for (let i = 2; i < path.length; i++) {
    if (!lineOfSight(grid, path[anchor], path[i])) {
      out.push(path[i - 1]);
      anchor = i - 1;
    }
  }
  out.push(path[path.length - 1]);
  return out;
}

/**
 * Returns the path from `start` to `goal` inclusive of both ends, or null if
 * unreachable. If `goal` itself is not walkable, no path is returned — callers
 * that want "walk next to X" should resolve a walkable target first.
 *
 * The returned path is smoothed: consecutive points may be more than one cell
 * apart (straight diagonal/orthogonal runs). The avatar walker interpolates in
 * world space toward each waypoint, so longer hops render as straight lines.
 */
export function findPath(
  grid: WalkGrid,
  start: GridPosition,
  goal: GridPosition,
): GridPosition[] | null {
  if (!grid.walkable(goal.x, goal.y)) return null;
  if (start.x === goal.x && start.y === goal.y) return [{ ...start }];

  const startKey = key(start.x, start.y);
  const open = new Set<string>([startKey]);
  const cameFrom = new Map<string, string>();
  const g = new Map<string, number>([[startKey, 0]]);
  const f = new Map<string, number>([
    [startKey, octile(start.x, start.y, goal.x, goal.y)],
  ]);
  const coord = new Map<string, GridPosition>([
    [startKey, { x: start.x, y: start.y }],
  ]);

  // Guard against pathological loops on large/odd grids.
  let guard = 400000;

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
      return smooth(grid, reconstruct(cameFrom, coord, currentKey));
    }

    open.delete(currentKey);
    const currentG = g.get(currentKey) ?? Infinity;
    const cx = current.x;
    const cy = current.y;

    const consider = (nx: number, ny: number, cost: number) => {
      const nKey = key(nx, ny);
      const tentative = currentG + cost;
      if (tentative < (g.get(nKey) ?? Infinity)) {
        cameFrom.set(nKey, currentKey);
        g.set(nKey, tentative);
        f.set(nKey, tentative + octile(nx, ny, goal.x, goal.y));
        coord.set(nKey, { x: nx, y: ny });
        open.add(nKey);
      }
    };

    for (const [dx, dy] of ORTHO) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (grid.walkable(nx, ny)) consider(nx, ny, 1);
    }
    for (const [dx, dy] of DIAG) {
      const nx = cx + dx;
      const ny = cy + dy;
      // Anti-corner-cut: diagonal needs the destination AND both shared
      // orthogonal cells walkable, so we never clip an obstacle corner.
      if (
        grid.walkable(nx, ny) &&
        grid.walkable(cx + dx, cy) &&
        grid.walkable(cx, cy + dy)
      ) {
        consider(nx, ny, SQRT2);
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
 *
 * When `from` is given (the approaching avatar's cell), ties within a ring are
 * broken toward `from`, so the entrance lands on the side the avatar is coming
 * from instead of a fixed top-left scan bias.
 */
export function nearestWalkable(
  grid: WalkGrid,
  target: GridPosition,
  maxRadius = 12,
  from?: GridPosition,
): GridPosition | null {
  if (grid.walkable(target.x, target.y)) return { ...target };
  for (let r = 1; r <= maxRadius; r++) {
    let best: GridPosition | null = null;
    let bestScore = Infinity;
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue; // ring only
        const x = target.x + dx;
        const y = target.y + dy;
        if (!grid.walkable(x, y)) continue;
        // All cells in a ring are equidistant from target in chess terms;
        // prefer the one closest to the approaching avatar (else to target).
        const ref = from ?? target;
        const score = Math.hypot(x - ref.x, y - ref.y);
        if (score < bestScore) {
          bestScore = score;
          best = { x, y };
        }
      }
    }
    if (best) return best;
  }
  return null;
}
