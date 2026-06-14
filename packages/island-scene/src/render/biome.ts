import type { GridPosition } from "../types";

/** Natural regions that give the island distinct, real-feeling places. */
export type Biome = "beach" | "forest" | "mountain" | "meadow" | "grass";

export interface BiomeContext {
  grid: { w: number; h: number };
  isLand: (x: number, y: number) => boolean;
}

/** Region centers as fractions of the grid (so it scales with any layout). */
const REGIONS: { biome: Biome; cx: number; cy: number; r: number }[] = [
  { biome: "mountain", cx: 0.47, cy: 0.12, r: 0.22 },
  { biome: "forest", cx: 0.22, cy: 0.27, r: 0.26 },
  { biome: "meadow", cx: 0.70, cy: 0.32, r: 0.22 },
];

/** True when any water sits within `d` cells (Chebyshev) — i.e. near the coast. */
export function coastDistance(x: number, y: number, ctx: BiomeContext, max = 2): number {
  for (let r = 1; r <= max; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
        if (!ctx.isLand(x + dx, y + dy)) return r;
      }
    }
  }
  return max + 1;
}

export function biomeAt(x: number, y: number, ctx: BiomeContext): Biome {
  // A sandy beach wraps the whole shore.
  if (coastDistance(x, y, ctx, 2) <= 2) return "beach";

  const nx = x / ctx.grid.w;
  const ny = y / ctx.grid.h;
  let best: Biome = "grass";
  let bestD = Infinity;
  for (const reg of REGIONS) {
    const d = Math.hypot(nx - reg.cx, ny - reg.cy);
    if (d < reg.r && d < bestD) {
      bestD = d;
      best = reg.biome;
    }
  }
  return best;
}

/** Convenience for callers that have raw land cells. */
export function landContext(grid: { w: number; h: number }, landCells: GridPosition[]): BiomeContext {
  const set = new Set(landCells.map((c) => `${c.x},${c.y}`));
  return { grid, isLand: (x, y) => set.has(`${x},${y}`) };
}
