import type { GridPosition } from "../types";

/**
 * Free-build island layout (Session 5) — a small fixed island: open buildable
 * meadow + beach ring, one fixed dock on the southern shore (the arrival
 * point). Deterministic (a seeded wobble, no Math.random) so tests and saves
 * always agree on the same world. This layout is NOT the locked main-island
 * layout — it is the second scene's own little world.
 */

export const BUILD_GRID_W = 26;
export const BUILD_GRID_H = 20;

/** Deterministic per-angle wobble so the coast isn't a perfect ellipse. */
const wobble = (a: number): number =>
  1 + 0.07 * Math.sin(a * 3 + 1.7) + 0.05 * Math.sin(a * 5 + 0.4);

const CX = BUILD_GRID_W / 2 - 0.5; // 12.5
const CY = BUILD_GRID_H / 2 - 0.5; // 9.5
const RX = 10.5;
const RY = 7.5;

function isLand(x: number, y: number): boolean {
  const dx = (x - CX) / RX;
  const dy = (y - CY) / RY;
  const a = Math.atan2(dy, dx);
  return Math.hypot(dx, dy) <= wobble(a);
}

export const buildLandCells: GridPosition[] = (() => {
  const out: GridPosition[] = [];
  for (let y = 0; y < BUILD_GRID_H; y++) {
    for (let x = 0; x < BUILD_GRID_W; x++) {
      if (isLand(x, y)) out.push({ x, y });
    }
  }
  return out;
})();

/** The fixed dock: a 3×2 pad on the southern shore. Not buildable. */
export const DOCK_CELLS: readonly GridPosition[] = [
  { x: 12, y: 15 }, { x: 13, y: 15 }, { x: 14, y: 15 },
  { x: 12, y: 16 }, { x: 13, y: 16 }, { x: 14, y: 16 },
];

/** World anchor for the dock sprite (center of its pad). */
export const DOCK_ANCHOR: GridPosition = { x: 13, y: 15 };

const dockSet = new Set(DOCK_CELLS.map((c) => `${c.x},${c.y}`));
const landSet = new Set(buildLandCells.map((c) => `${c.x},${c.y}`));

/**
 * Buildable = every land cell except the dock pad. ("Mostly open buildable
 * meadow + beach" — the whole island is the canvas; only the arrival dock is
 * fixed.)
 */
export const buildableCells: GridPosition[] = buildLandCells.filter(
  (c) => !dockSet.has(`${c.x},${c.y}`),
);

const buildableSet = new Set(buildableCells.map((c) => `${c.x},${c.y}`));

export const buildRegion = {
  buildable: (x: number, y: number): boolean => buildableSet.has(`${x},${y}`),
};

export const isBuildLand = (x: number, y: number): boolean => landSet.has(`${x},${y}`);
