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
  const ekey = (e: [Pt, Pt]) => `${key(e[0])}>${key(e[1])}`;

  // start key -> list of boundary edges (clockwise around each land cell).
  // A multimap is essential: at concave corners two edges share a start point,
  // and a plain map would drop one and chord straight across the bay.
  const adj = new Map<string, [Pt, Pt][]>();
  const push = (a: Pt, b: Pt) => {
    const k = key(a);
    const list = adj.get(k);
    if (list) list.push([a, b]);
    else adj.set(k, [[a, b]]);
  };
  for (const c of landCells) {
    const { x: cx, y: cy } = tileToScreen(c.x, c.y);
    const T = { x: cx, y: cy };
    const R = { x: cx + HW, y: cy + HH };
    const B = { x: cx, y: cy + TH };
    const L = { x: cx - HW, y: cy + HH };
    if (!isLand(c.x, c.y - 1)) push(T, R);
    if (!isLand(c.x + 1, c.y)) push(R, B);
    if (!isLand(c.x, c.y + 1)) push(B, L);
    if (!isLand(c.x - 1, c.y)) push(L, T);
  }

  // Walk loops, always taking the most-clockwise unused continuation so the
  // outer perimeter is traced faithfully through bays and headlands.
  const used = new Set<string>();
  let best: Pt[] = [];
  for (const list of adj.values()) {
    for (const seed of list) {
      if (used.has(ekey(seed))) continue;
      const loop: Pt[] = [];
      let edge: [Pt, Pt] | undefined = seed;
      for (let i = 0; edge && i < adj.size * 4 + 8; i++) {
        if (used.has(ekey(edge))) break;
        used.add(ekey(edge));
        loop.push(edge[0]);
        const from = edge[0];
        const to = edge[1];
        const candidates = (adj.get(key(to)) ?? []).filter((c) => !used.has(ekey(c)));
        if (candidates.length === 0) break;
        edge = pickClockwise(candidates, { x: to.x - from.x, y: to.y - from.y });
      }
      if (loop.length > best.length) best = loop;
    }
  }

  // Resample to dissolve the tile staircase, Chaikin-smooth, then add a faint
  // organic wiggle so even genuinely-straight runs read as a hand-drawn coast.
  const resampled = resample(best, TILE_W * 1.1);
  if (resampled.length < 4) return best;
  return perturb(chaikin(resampled, iterations));
}

/** Choose the continuation edge that turns most clockwise (hugs the coast). */
function pickClockwise(candidates: [Pt, Pt][], inDir: { x: number; y: number }): [Pt, Pt] {
  let best = candidates[0];
  let bestTurn = Infinity;
  for (const c of candidates) {
    const out = { x: c[1].x - c[0].x, y: c[1].y - c[0].y };
    // Signed turn from inDir to out (screen coords, y-down). Smaller = more CW.
    const turn = Math.atan2(
      inDir.x * out.y - inDir.y * out.x,
      inDir.x * out.x + inDir.y * out.y,
    );
    if (turn < bestTurn) {
      bestTurn = turn;
      best = c;
    }
  }
  return best;
}

/** Small low-frequency offset along each point's normal — organic, not noisy. */
function perturb(loop: Pt[]): Pt[] {
  const n = loop.length;
  if (n < 8) return loop;
  return loop.map((p, i) => {
    const a = loop[(i - 1 + n) % n];
    const b = loop[(i + 1) % n];
    const tx = b.x - a.x;
    const ty = b.y - a.y;
    const len = Math.hypot(tx, ty) || 1;
    const nx = -ty / len;
    const ny = tx / len;
    const amp = 3.5 * Math.sin(i * 0.21) + 2.5 * Math.sin(i * 0.07 + 1.3);
    return { x: p.x + nx * amp, y: p.y + ny * amp };
  });
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
