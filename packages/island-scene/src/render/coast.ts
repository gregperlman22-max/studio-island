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
export function islandOutline(landCells: GridPosition[], iterations = 4): Pt[] {
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

  // Resample at a coarse, uniform spacing first — this dissolves the tile
  // staircase into a few big control points — then Chaikin corner-cut several
  // times for a soft, hand-drawn Animal-Crossing silhouette.
  const resampled = resample(best, TILE_W * 1.1);
  return resampled.length >= 4 ? chaikin(resampled, iterations) : best;
}

/** Uniform-arc-length resample of a closed loop (kills tile-scale zigzag). */
function resample(loop: Pt[], spacing: number): Pt[] {
  if (loop.length < 4) return loop;
  const out: Pt[] = [];
  let carry = 0;
  for (let i = 0; i < loop.length; i++) {
    const a = loop[i];
    const b = loop[(i + 1) % loop.length];
    let segLen = Math.hypot(b.x - a.x, b.y - a.y);
    if (segLen === 0) continue;
    let d = -carry;
    while (d + spacing <= segLen) {
      d += spacing;
      const t = d / segLen;
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
    carry = segLen - d;
  }
  return out.length >= 4 ? out : loop;
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
