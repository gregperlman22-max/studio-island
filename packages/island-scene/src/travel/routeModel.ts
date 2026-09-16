/**
 * Guided travel — pure route model. No Pixi, no DOM.
 *
 * PORTED from the navigation POC (claude/travel-poc @ 51c59ad), which is where
 * the projection below was proven. The two fixes that POC earned on a phone are
 * carried over deliberately and are commented at their source — `lateralK`
 * scaling off the LARGER viewport dimension, and `frameUnit` clamping framing
 * props against the width. Both look like simplification bait; both are load
 * bearing, and `routeModel.test.ts` pins them at 390x844 vs 1440x900.
 *
 * THE PROJECTION
 * A route is a corridor receding from the camera. Every point is given in
 * corridor space: `t` is progress (0 = start, 1 = destination) and `lateral` is
 * a signed offset across it in world units. The camera sits ON the route at
 * progress `p`, so a point's depth is how far ahead of the camera it is:
 *
 *     z    = Z_NEAR + (t - p) * zSpan
 *     k    = Z_NEAR / z            1 at the near plane, 0 at the horizon
 *     y    = horizon + (near - horizon) * k
 *     x    = centre + (lateral - camLateral) * lateralK * k
 *     size = worldSize * lateralK * k
 *
 * x, y and size all fall off as 1/z, so the path narrows, props shrink toward
 * the vanishing point and the destination grows as the camera closes — with no
 * per-element fudging. That single formula is the depth illusion.
 */

export const Z_NEAR = 1;
/** Below this depth a point is level with / behind the camera — do not draw. */
export const Z_CULL = 0.28;
/** How far ahead of the camera the Friend walks. Constant, so they hold a fixed
 *  screen position and size while the world moves past — the thing that makes
 *  this read as travel rather than a scrolling picture. */
export const AVATAR_LEAD = 0.0245;
/** A prop the camera is passing projects enormous and can blanket the frame.
 *  Props dissolve as they sweep past, over this window, measured against the
 *  avatar's own depth. */
export const NEAR_FADE_LO = 0.62;
export const NEAR_FADE_HI = 1.0;

export interface Viewport { w: number; h: number }

export interface Projected {
  x: number;
  y: number;
  /** Perspective factor: 1 at the near plane, → 0 at the horizon. */
  k: number;
  z: number;
  visible: boolean;
}

export interface CameraOpts {
  horizonFrac: number;
  nearFrac: number;
  lateralFrac: number;
  zSpan: number;
}

export const DEFAULT_CAMERA: CameraOpts = {
  horizonFrac: 0.42,
  nearFrac: 1.02,
  lateralFrac: 0.42,
  zSpan: 20,
};

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));
export const smoothstep = (t: number): number => t * t * (3 - 2 * t);

/**
 * World lateral unit → px at the near plane.
 *
 * Derived from the LARGER viewport dimension, not the width. A width-only rule
 * collapsed on a 390x844 phone in the POC: the whole world scaled down with the
 * narrow screen, leaving the child ~10% of the frame tall and the corridor
 * reading as a distant diorama rather than as travel. Taking height into
 * account narrows the field of view on a tall screen — less ACROSS the path,
 * more ALONG it, which is the right trade on a phone.
 */
export function lateralK(cam: CameraOpts, view: Viewport): number {
  return Math.max(view.w, view.h) * cam.lateralFrac;
}

/**
 * Reference length for SCREEN-EDGE framing props. Height alone made the
 * overhanging canopy grow with the viewport's height and seal a portrait phone
 * shut — 100% of the frame was leaves. Clamping against the width keeps a frame
 * a frame at any aspect ratio.
 */
export function frameUnit(view: Viewport): number {
  return Math.min(view.h, view.w * 0.85);
}

/** Depth of the avatar's own plane. */
export function avatarZ(cam: CameraOpts): number {
  return Z_NEAR + AVATAR_LEAD * cam.zSpan;
}

/** Opacity for a corridor prop at depth `z`: full at or beyond the avatar's
 *  plane, dissolving below it so nothing the camera passes is painted across
 *  the child. */
export function nearFade(z: number, avZ: number): number {
  const hi = avZ * NEAR_FADE_HI;
  const lo = avZ * NEAR_FADE_LO;
  if (z >= hi) return 1;
  if (z <= lo) return 0;
  return smoothstep((z - lo) / (hi - lo));
}

/** The route's centre-line offset at `t`, smoothstepped through the control
 *  points (C1 at the knots, no overshoot — an overshooting path reads as a
 *  mistake rather than a bend). */
export function lateralAt(
  curve: readonly (readonly [number, number])[],
  t: number,
): number {
  if (curve.length === 0) return 0;
  if (t <= curve[0][0]) return curve[0][1];
  const last = curve[curve.length - 1];
  if (t >= last[0]) return last[1];
  for (let i = 0; i < curve.length - 1; i++) {
    const [t0, l0] = curve[i];
    const [t1, l1] = curve[i + 1];
    if (t >= t0 && t <= t1) {
      const u = t1 === t0 ? 0 : (t - t0) / (t1 - t0);
      return l0 + (l1 - l0) * smoothstep(u);
    }
  }
  return last[1];
}

/** Project a corridor-space point for a camera at progress `p`. */
export function project(
  t: number,
  lateral: number,
  p: number,
  camLateral: number,
  cam: CameraOpts,
  view: Viewport,
): Projected {
  const z = Z_NEAR + (t - p) * cam.zSpan;
  if (z < Z_CULL) return { x: 0, y: 0, k: 0, z, visible: false };
  const k = Z_NEAR / z;
  const horizonY = view.h * cam.horizonFrac;
  const nearY = view.h * cam.nearFrac;
  return {
    x: view.w / 2 + (lateral - camLateral) * lateralK(cam, view) * k,
    y: horizonY + (nearY - horizonY) * k,
    k,
    z,
    visible: k > 0.004,
  };
}

/** World size (world units) → pixels at a projected point. */
export function pxSize(worldSize: number, k: number, cam: CameraOpts, view: Viewport): number {
  return worldSize * lateralK(cam, view) * k;
}

// ── Route data ──────────────────────────────────────────────────────

/** Kit sprite identifiers. One kit, reused by every route. */
export type PropKind =
  | "tree1" | "tree2" | "bush1" | "bush2" | "rock" | "flower" | "flowerBush" | "grass";

export interface RouteProp {
  kind: PropKind;
  t: number;
  /** Lateral offset from the route centre-line, in world units. */
  side: number;
  /** Height in world units (a child is ~0.58). */
  size: number;
  flip?: boolean;
  tint?: number;
}

/** A prop pinned to the screen edge rather than the corridor: the overhanging
 *  branch that frames the shot. Parallax only — no depth. */
export interface FramingProp {
  kind: PropKind;
  ax: number;
  ay: number;
  hFrac: number;
  flip?: boolean;
  parallax: number;
  tint?: number;
  alpha?: number;
}

export interface RoutePalette {
  skyTop: number;
  skyBottom: number;
  hazeFar: number;
  groundFar: number;
  groundNear: number;
  pathFar: number;
  pathNear: number;
  farTree: number;
}

export interface RouteDef {
  id: string;
  name: string;
  curve: readonly (readonly [number, number])[];
  halfWidth: number;
  props: readonly RouteProp[];
  framing: readonly FramingProp[];
  destination: { t: number; side: number; size: number };
  /** Progress before which the destination is hidden behind the scenery. */
  revealAt: number;
  palette: RoutePalette;
  camera?: Partial<CameraOpts>;
  /** Where the optional discovery sits, off the path. */
  discovery: { t: number; side: number; size: number };
  /** Waypoints for reduced-motion travel: the child taps from one to the next
   *  instead of walking continuously. */
  waypoints: readonly number[];
}

export function cameraFor(route: RouteDef): CameraOpts {
  return { ...DEFAULT_CAMERA, ...route.camera };
}

/** Camera lateral for progress `p` plus the child's steering offset. The camera
 *  only partly follows the steer, so steering visibly moves the Friend across
 *  the path instead of dragging the whole world with it. */
export function cameraLateral(route: RouteDef, p: number, steer: number): number {
  return lateralAt(route.curve, p) + steer * 0.6;
}

/** Where the Friend stands, in corridor space. */
export function avatarAt(route: RouteDef, p: number, steer: number): { t: number; lateral: number } {
  const t = p + AVATAR_LEAD;
  return { t, lateral: lateralAt(route.curve, t) + steer };
}

/** Edge points of the path ribbon, far → near, as shadeable segments. */
export function pathRibbon(
  route: RouteDef,
  p: number,
  camLateral: number,
  cam: CameraOpts,
  view: Viewport,
  steps = 34,
): { left: Projected; right: Projected; u: number }[] {
  const out: { left: Projected; right: Projected; u: number }[] = [];
  // Start a little BEHIND the camera so the ribbon runs off the bottom edge
  // rather than beginning in mid-air.
  const t0 = p - 0.02;
  for (let i = 0; i <= steps; i++) {
    const u = i / steps;
    // Bias sampling toward the near end, where perspective changes fastest.
    const t = t0 + (1 - t0) * (u * u);
    const c = lateralAt(route.curve, t);
    const left = project(t, c - route.halfWidth, p, camLateral, cam, view);
    const right = project(t, c + route.halfWidth, p, camLateral, cam, view);
    if (!left.visible || !right.visible) continue;
    out.push({ left, right, u });
  }
  return out;
}

/** Props in draw order (far first), already projected. Culled behind camera. */
export function drawOrder(
  route: RouteDef,
  p: number,
  camLateral: number,
  cam: CameraOpts,
  view: Viewport,
): { prop: RouteProp; at: Projected; px: number }[] {
  const out: { prop: RouteProp; at: Projected; px: number }[] = [];
  for (const prop of route.props) {
    const centre = lateralAt(route.curve, prop.t);
    const at = project(prop.t, centre + prop.side, p, camLateral, cam, view);
    if (!at.visible) continue;
    out.push({ prop, at, px: pxSize(prop.size, at.k, cam, view) });
  }
  out.sort((a, b) => b.at.z - a.at.z);
  return out;
}

/** Destination transform, plus how revealed it is (0 hidden → 1 full). */
export function destinationAt(
  route: RouteDef,
  p: number,
  camLateral: number,
  cam: CameraOpts,
  view: Viewport,
): { at: Projected; px: number; reveal: number } {
  const d = route.destination;
  const centre = lateralAt(route.curve, d.t);
  const at = project(d.t, centre + d.side, p, camLateral, cam, view);
  // Fade in over the 12% of the route after revealAt, so the reveal is a
  // moment rather than a pop.
  const reveal = clamp((p - route.revealAt) / 0.12, 0, 1);
  return { at, px: pxSize(d.size, at.k, cam, view), reveal: smoothstep(reveal) };
}

/** The discovery's transform, wherever the camera is. */
export function discoveryAt(
  route: RouteDef,
  p: number,
  camLateral: number,
  cam: CameraOpts,
  view: Viewport,
): { at: Projected; px: number } {
  const d = route.discovery;
  const centre = lateralAt(route.curve, d.t);
  const at = project(d.t, centre + d.side, p, camLateral, cam, view);
  return { at, px: pxSize(d.size, at.k, cam, view) };
}

/** Straight-line progress remaining. */
export function remaining(p: number): number {
  return clamp(1 - p, 0, 1);
}

// ── Reduced motion ──────────────────────────────────────────────────

/**
 * The next waypoint after progress `p`, or null at the end.
 *
 * Under reduced motion the journey is a series of cuts between fixed points
 * rather than a continuous walk. The child still makes the same two decisions
 * about the discovery — notice it, act on it — because the waypoint nearest the
 * log is one of these, and the log is tappable from it. No steering is
 * required at any motion setting.
 */
export function nextWaypoint(route: RouteDef, p: number): number | null {
  for (const w of route.waypoints) if (w > p + 1e-6) return w;
  return null;
}

/** The waypoint the discovery is reachable from — the one nearest its `t`. */
export function discoveryWaypoint(route: RouteDef): number {
  let best = route.waypoints[0] ?? 0;
  for (const w of route.waypoints) {
    if (Math.abs(w - route.discovery.t) < Math.abs(best - route.discovery.t)) best = w;
  }
  return best;
}
