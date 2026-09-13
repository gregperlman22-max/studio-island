/**
 * POC — two travel routes composed from the SAME kit.
 *
 * Both end at the Treehouse. Neither uses a single sprite the other doesn't.
 * Everything that differs between them is recipe data:
 *
 *   Route A "Sunlit Rise"  — open, bright, wide path, a long lazy S-bend,
 *                            scenery set well back, destination in view from
 *                            the first frame and growing steadily. Reads as a
 *                            walk across open ground.
 *   Route B "Deep Hollow"  — enclosed, cool, narrow path, a firm dog-leg,
 *                            tree walls crowding both edges, an arch of
 *                            overhanging branches, destination HIDDEN until
 *                            just past halfway and then revealed through a gap
 *                            in the trees. Reads as a walk through forest.
 *
 * If those two read as the same corridor rearranged, the kit approach fails.
 */

import type { FramingProp, PropKind, RouteDef, RouteProp } from "./routeModel";

/** Deterministic PRNG so a route's scatter is identical on every run — a route
 *  that reshuffles itself is not a route, and could not be reviewed. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface ScatterSpec {
  kinds: readonly PropKind[];
  /** How many, across the whole route. */
  count: number;
  /** Lateral band (from the centre-line) the scatter lands in, per side. */
  near: number;
  far: number;
  /** World-size range. */
  size: readonly [number, number];
  /** Route span to scatter over. */
  from?: number;
  to?: number;
  tint?: number;
  /** Only scatter on this side (-1 left, +1 right). Omit for both. */
  side?: -1 | 1;
}

/** Scatter a band of props along the corridor, alternating sides. */
function scatter(seed: number, spec: ScatterSpec): RouteProp[] {
  const r = rng(seed);
  const from = spec.from ?? 0.02;
  const to = spec.to ?? 1.02;
  const out: RouteProp[] = [];
  for (let i = 0; i < spec.count; i++) {
    const t = from + ((to - from) * (i + r() * 0.85)) / spec.count;
    const sign = spec.side ?? (r() < 0.5 ? -1 : 1);
    const side = sign * (spec.near + r() * (spec.far - spec.near));
    out.push({
      kind: spec.kinds[Math.floor(r() * spec.kinds.length) % spec.kinds.length],
      t,
      side,
      size: spec.size[0] + r() * (spec.size[1] - spec.size[0]),
      flip: r() < 0.5,
      tint: spec.tint,
    });
  }
  return out;
}

// ── Route A — Sunlit Rise ──────────────────────────────────────────

const A_PROPS: RouteProp[] = [
  // Open ground: trees kept WELL back from the path so the sky stays wide.
  ...scatter(1101, { kinds: ["tree1", "tree2"], count: 20, near: 2.6, far: 5.2, size: [2.6, 3.6], to: 1.25 }),
  // A few closer specimens to give the eye something to pass.
  ...scatter(1102, { kinds: ["tree2"], count: 4, near: 1.5, far: 2.1, size: [2.2, 2.9], from: 0.1, to: 0.8 }),
  // Meadow edge: flowers and grass right up against the path — the signature
  // of this route is colour at ankle height, not canopy overhead.
  ...scatter(1103, { kinds: ["flower", "flowerBush", "grass"], count: 54, near: 0.6, far: 1.5, size: [0.3, 0.62], to: 1.2 }),
  ...scatter(1104, { kinds: ["grass"], count: 26, near: 0.58, far: 0.95, size: [0.22, 0.4] }),
  // Tufts right across the open field, so the ground plane carries texture
  // instead of reading as flat felt between the path and the treeline.
  ...scatter(1106, { kinds: ["grass"], count: 42, near: 1.6, far: 4.4, size: [0.22, 0.46], to: 1.25 }),
  ...scatter(1107, { kinds: ["flower"], count: 12, near: 1.7, far: 3.6, size: [0.26, 0.4] }),
  ...scatter(1105, { kinds: ["bush1", "bush2"], count: 10, near: 1.1, far: 2.2, size: [0.8, 1.3] }),
  // Two lone boulders as landmarks along the way.
  { kind: "rock", t: 0.26, side: -1.25, size: 0.85 } as RouteProp,
  { kind: "rock", t: 0.63, side: 1.35, size: 1.0, flip: true } as RouteProp,
];

const A_FRAMING: FramingProp[] = [
  { kind: "bush2", ax: 0.06, ay: 1.04, hFrac: 0.3, parallax: 44 },
  { kind: "flowerBush", ax: 0.93, ay: 1.06, hFrac: 0.26, parallax: 52, flip: true },
  { kind: "grass", ax: 0.72, ay: 1.03, hFrac: 0.16, parallax: 60 },
];

export const ROUTE_A: RouteDef = {
  id: "a",
  name: "Sunlit Rise",
  blurb: "Open ground · long S-bend · destination in view from the start",
  // A long, lazy S. Nothing ever leaves the field of view.
  curve: [
    [0, 0],
    [0.3, 0.55],
    [0.6, -0.4],
    [0.85, 0.12],
    [1, 0.18],
  ],
  halfWidth: 0.62,
  props: A_PROPS,
  framing: A_FRAMING,
  destination: { t: 1.0, side: 0.15, size: 6.2 },
  revealAt: -1, // visible from the first frame
  palette: {
    skyTop: 0x7fc4e8,
    skyBottom: 0xfbeec2,
    hazeFar: 0xe8f0cf,
    groundFar: 0xd3dc9a,
    groundNear: 0x7fa243,
    pathFar: 0xe7d6a6,
    pathNear: 0xd6b477,
    farTree: 0xa8c489,
  },
};

// ── Route B — Deep Hollow ──────────────────────────────────────────

const B_PROPS: RouteProp[] = [
  // Tree WALLS: dense, close, both sides — the corridor is the subject here.
  ...scatter(2201, { kinds: ["tree1", "tree2"], count: 22, near: 0.95, far: 1.7, size: [3.0, 4.1], side: -1 }),
  ...scatter(2202, { kinds: ["tree1", "tree2"], count: 22, near: 0.95, far: 1.7, size: [3.0, 4.1], side: 1 }),
  // Second rank behind, tinted cooler so depth reads inside the wall itself.
  ...scatter(2203, { kinds: ["tree1", "tree2"], count: 18, near: 1.9, far: 3.4, size: [3.2, 4.4], tint: 0x9fbfa6 }),
  // THE GAP: no trees on the left between t 0.5 and 0.62 — this is the hole the
  // destination is revealed through, and it is the one composition decision
  // that gives this route its beat.
  ...scatter(2204, { kinds: ["bush1", "bush2"], count: 14, near: 0.86, far: 1.2, size: [0.7, 1.15] }),
  ...scatter(2205, { kinds: ["rock"], count: 11, near: 0.8, far: 1.35, size: [0.5, 1.05] }),
  // Sparse undergrowth only — this floor is shaded, not flowering.
  ...scatter(2206, { kinds: ["grass"], count: 20, near: 0.6, far: 1.0, size: [0.2, 0.34] }),
  ...scatter(2207, { kinds: ["flower"], count: 6, near: 0.62, far: 0.9, size: [0.24, 0.36] }),
  // Two hero trunks hard against the path, right where the dog-leg turns.
  { kind: "tree1", t: 0.3, side: -0.82, size: 4.3 } as RouteProp,
  { kind: "tree2", t: 0.42, side: 0.8, size: 4.0, flip: true } as RouteProp,
].filter(
  // Punch the reveal gap out of everything scattered on the left.
  (p) => !(p.side < 0 && p.t > 0.5 && p.t < 0.63 && p.kind !== "grass" && p.kind !== "rock"),
);

const B_FRAMING: FramingProp[] = [
  // An arch of overhanging canopy: two big trees rooted off-frame, hanging in
  // from the top corners. Cheap, and it does more for the depth read than any
  // other single element.
  { kind: "tree1", ax: -0.07, ay: 1.46, hFrac: 1.42, parallax: 26, tint: 0x5f7f57 },
  { kind: "tree2", ax: 1.07, ay: 1.5, hFrac: 1.5, parallax: 30, flip: true, tint: 0x56744f },
  { kind: "bush1", ax: 0.11, ay: 1.06, hFrac: 0.34, parallax: 70, tint: 0x7d9a6c },
  { kind: "bush2", ax: 0.88, ay: 1.05, hFrac: 0.3, parallax: 76, flip: true, tint: 0x7d9a6c },
];

export const ROUTE_B: RouteDef = {
  id: "b",
  name: "Deep Hollow",
  blurb: "Enclosed forest · dog-leg turn · destination hidden until the gap",
  // A firm left, then back right — the destination swings out of view and
  // returns, which is what makes the reveal land.
  curve: [
    [0, 0],
    [0.22, -0.72],
    [0.45, -0.95],
    [0.66, -0.1],
    [0.85, 0.3],
    [1, 0.22],
  ],
  halfWidth: 0.44,
  props: B_PROPS,
  framing: B_FRAMING,
  destination: { t: 1.0, side: 0.1, size: 6.0 },
  revealAt: 0.52,
  palette: {
    skyTop: 0x9fc9d8,
    skyBottom: 0xdce8c8,
    hazeFar: 0xc4d6bb,
    groundFar: 0x9ab081,
    groundNear: 0x5d7a3e,
    pathFar: 0xc2b085,
    pathNear: 0x9d8354,
    farTree: 0x6f8f66,
  },
  camera: { horizonFrac: 0.45, zSpan: 18 },
};

export const ROUTES: readonly RouteDef[] = [ROUTE_A, ROUTE_B];

export function routeById(id: string): RouteDef {
  return ROUTES.find((r) => r.id === id) ?? ROUTE_A;
}
