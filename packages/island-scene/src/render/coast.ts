import { TILE_H, TILE_W } from "./constants";
import { tileToScreen } from "./iso";
import type { GridPosition } from "../types";

export interface Pt {
  x: number;
  y: number;
}

/**
 * Trace the land/water boundary of a tile island and return a smoothed,
 * organic outline (closed loop, world-pixel coordinates). The tile grid stays;
 * only the *visible* coast is smoothed — no stair steps, no 90° corners.
 *
 * Method: collect the diamond edges of land cells that border water (in
 * clockwise winding), stitch them into a loop, then Chaikin corner-cut a few
 * times for soft bays and headlands.
 */
export function islandOutline(landCells: GridPosition[], iterations = 3): Pt[] {
  const set = new Set(landCells.map((c) => `${c.x},${c.y}`));
  const isLand = (x: number, y: number) => set.has(`${x},${y}`);
  const HW = TILE_W / 2;
  const HH = TILE_H / 2;
  const TH = TILE_H;
  const key = (p: Pt) => `${Math.round(p.x)},${Math.round(p.y)}`;

  // startKey -> edge (clockwise around the land).
  const edges = new Map<string, [Pt, Pt]>();
  for (const c of landCells) {
    const { x: cx, y: cy } = tileToScreen(c.x, c.y);
    const T = { x: cx, y: cy };
    const R = { x: cx + HW, y: cy + HH };
    const B = { x: cx, y: cy + TH };
    const L = { x: cx - HW, y: cy + HH };
    if (!isLand(c.x, c.y - 1)) edges.set(key(T), [T, R]);
    if (!isLand(c.x + 1, c.y)) edges.set(key(R), [R, B]);
    if (!isLand(c.x, c.y + 1)) edges.set(key(B), [B, L]);
    if (!isLand(c.x - 1, c.y)) edges.set(key(L), [L, T]);
  }

  // Stitch the longest loop.
  const used = new Set<string>();
  let best: Pt[] = [];
  for (const startKey of edges.keys()) {
    if (used.has(startKey)) continue;
    const loop: Pt[] = [];
    let k: string | undefined = startKey;
    for (let i = 0; i <= edges.size; i++) {
      if (k === undefined || used.has(k)) break;
      const e = edges.get(k);
      if (!e) break;
      used.add(k);
      loop.push(e[0]);
      k = key(e[1]);
      if (k === startKey) break;
    }
    if (loop.length > best.length) best = loop;
  }

  return best.length >= 4 ? chaikin(best, iterations) : best;
}

function chaikin(pts: Pt[], iterations: number): Pt[] {
  let p = pts;
  for (let it = 0; it < iterations; it++) {
    const out: Pt[] = [];
    const n = p.length;
    for (let i = 0; i < n; i++) {
      const a = p[i];
      const b = p[(i + 1) % n];
      out.push({ x: a.x * 0.75 + b.x * 0.25, y: a.y * 0.75 + b.y * 0.25 });
      out.push({ x: a.x * 0.25 + b.x * 0.75, y: a.y * 0.25 + b.y * 0.75 });
    }
    p = out;
  }
  return p;
}

/** Flatten a loop to the number[] form Pixi's poly() wants. */
export function flatten(loop: Pt[], dx = 0, dy = 0): number[] {
  const out: number[] = [];
  for (const p of loop) {
    out.push(p.x + dx, p.y + dy);
  }
  return out;
}
