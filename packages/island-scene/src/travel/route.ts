import type { FramingProp, PropKind, RouteDef, RouteProp } from "./routeModel";

/**
 * The one production route: Welcome Dock → Treehouse Hideaway.
 *
 * ONE route, deliberately. The brief is explicit that navigation must not be
 * scaled to the other eight destinations in this slice, so there is exactly one
 * here and everything about it is data — curve, enclosure, prop scatter, reveal
 * timing, palette, waypoints. A second route is a second object in this file,
 * not a second renderer.
 *
 * The composition takes the POC's "Deep Hollow" discipline (enclosed, a firm
 * dog-leg, the destination hidden until it is revealed through a gap) with a
 * warmer palette, because this is a walk a five-year-old takes to somewhere
 * welcoming rather than a walk into a forest.
 */

/** Deterministic PRNG, so a route's scatter is identical on every run. A route
 *  that reshuffles itself is not a route and could not be reviewed. */
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
  count: number;
  near: number;
  far: number;
  size: readonly [number, number];
  from?: number;
  to?: number;
  tint?: number;
  side?: -1 | 1;
}

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

/** The gap in the left-hand tree wall the Treehouse is revealed through. */
const GAP = { from: 0.52, to: 0.66 } as const;

const PROPS: RouteProp[] = [
  // Tree walls: close, both sides — the corridor is the subject.
  ...scatter(3301, { kinds: ["tree1", "tree2"], count: 20, near: 0.98, far: 1.7, size: [3.0, 4.0], side: -1 }),
  ...scatter(3302, { kinds: ["tree1", "tree2"], count: 20, near: 0.98, far: 1.7, size: [3.0, 4.0], side: 1 }),
  // Second rank behind, tinted cooler so depth reads inside the wall itself.
  ...scatter(3303, { kinds: ["tree1", "tree2"], count: 16, near: 1.9, far: 3.3, size: [3.2, 4.3], tint: 0xa6c4a8 }),
  ...scatter(3304, { kinds: ["bush1", "bush2"], count: 14, near: 0.86, far: 1.25, size: [0.7, 1.15] }),
  ...scatter(3305, { kinds: ["rock"], count: 9, near: 0.8, far: 1.35, size: [0.5, 1.0] }),
  // Warm undergrowth — this floor is dappled, not gloomy.
  ...scatter(3306, { kinds: ["grass"], count: 26, near: 0.58, far: 1.05, size: [0.2, 0.36] }),
  ...scatter(3307, { kinds: ["flower", "flowerBush"], count: 18, near: 0.6, far: 1.0, size: [0.24, 0.42] }),
  // Two hero trunks hard against the path, right where the dog-leg turns.
  { kind: "tree1", t: 0.3, side: -0.84, size: 4.2 } as RouteProp,
  { kind: "tree2", t: 0.43, side: 0.82, size: 3.9, flip: true } as RouteProp,
].filter(
  // Punch the reveal gap out of everything scattered on the left, so the
  // Treehouse can be seen through it. Ground cover stays — it is too low to
  // block anything.
  (p) => !(p.side < 0 && p.t > GAP.from && p.t < GAP.to && p.kind !== "grass" && p.kind !== "flower"),
);

const FRAMING: FramingProp[] = [
  // An arch of overhanging canopy: two big trees rooted off-frame, hanging in
  // from the top corners. Cheap, and it does more for the depth read than any
  // other single element.
  { kind: "tree1", ax: -0.07, ay: 1.46, hFrac: 1.36, parallax: 26, tint: 0x6f8f5c },
  { kind: "tree2", ax: 1.07, ay: 1.5, hFrac: 1.44, parallax: 30, flip: true, tint: 0x63814f },
  { kind: "bush1", ax: 0.11, ay: 1.06, hFrac: 0.32, parallax: 70, tint: 0x84a06e },
  { kind: "bush2", ax: 0.88, ay: 1.05, hFrac: 0.29, parallax: 76, flip: true, tint: 0x84a06e },
];

export const TREEHOUSE_ROUTE: RouteDef = {
  id: "welcome_dock__treehouse_hideaway",
  name: "The way to the Treehouse",
  // A firm left, then back right — the destination swings out of view and
  // returns, which is what makes the reveal land.
  curve: [
    [0, 0],
    [0.22, -0.7],
    [0.45, -0.92],
    [0.66, -0.08],
    [0.85, 0.28],
    [1, 0.2],
  ],
  halfWidth: 0.46,
  props: PROPS,
  framing: FRAMING,
  destination: { t: 1.0, side: 0.12, size: 6.0 },
  revealAt: GAP.from,
  palette: {
    skyTop: 0x8ec9e0,
    skyBottom: 0xf3e6bd,
    hazeFar: 0xd8e4c2,
    groundFar: 0xa8bd82,
    groundNear: 0x6d8f45,
    pathFar: 0xd8c395,
    pathNear: 0xb2935f,
    farTree: 0x7d9c6a,
  },
  camera: { horizonFrac: 0.44, zSpan: 18 },
  // The hollow log: OFF the path, on the right, a little past a third of the
  // way. Far enough out that a child has to choose to go to it.
  discovery: { t: 0.4, side: 1.15, size: 0.7 },
  // Six stops for reduced-motion travel. 0.38 is one of them, so the log is
  // reachable without any continuous steering.
  // The stop nearest the log is 0.30 — BEFORE it, so the child sees the log
  // ahead and off the path and can decide, rather than arriving on top of it.
  waypoints: [0.16, 0.3, 0.52, 0.7, 0.86, 1.0],
};
