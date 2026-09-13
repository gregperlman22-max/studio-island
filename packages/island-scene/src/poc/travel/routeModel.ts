/**
 * POC — guided-travel route model. Pure math, no Pixi.
 *
 * THIS IS A PROOF OF CONCEPT, not production navigation. It exists to answer
 * three questions before the vertical slice is committed (see the spike memo):
 * can one painted kit compose two routes that feel like different journeys, is
 * new travel-pose character art a prerequisite, and does the depth illusion
 * survive a 390px-wide phone. Nothing here is wired into SceneRenderer, the
 * world map, the zone interiors or the public IslandScene contract.
 *
 * THE PROJECTION
 * A route is a corridor receding from the camera. Every point is given in
 * "corridor space": `t` is progress along the route (0 = start, 1 = the
 * destination) and `lateral` is a signed offset across it in world units.
 *
 * The camera sits ON the route at progress `p` and looks down its axis, so a
 * point's depth is simply how far ahead of the camera it is:
 *
 *     z = Z_NEAR + (t - p) * zSpan
 *
 * and everything else follows from real perspective, where a ground plane
 * projects as 1/z:
 *
 *     k = Z_NEAR / z        the perspective factor: 1 at the near plane, 0 at
 *                           the horizon
 *     y = horizon + (near - horizon) * k
 *     x = vanishingX + (lateral - cameraLateral) * lateralK * k
 *     size = worldSize * lateralK * k
 *
 * Because x, y AND size all fall off as 1/z, the whole scene is internally
 * consistent: the path narrows, props shrink and drift toward the vanishing
 * point, and the destination grows as the camera closes on it — with no
 * per-element fudging. That single formula is the depth illusion.
 *
 * Sizes are given in WORLD units (a child is ~0.58, a mature tree ~3.2), not in
 * pixels, so a kit prop keeps its proportions at any viewport and any depth.
 */

/** Depth of the near plane. Everything is measured relative to it. */
export const Z_NEAR = 1;
/** Below this depth a point is level with / behind the camera — do not draw. */
export const Z_CULL = 0.28;
/**
 * A prop the camera is passing projects enormous and can blanket the whole
 * frame — at 50% along the enclosed route, a wayside bush covered the path AND
 * the child. Real perspective, useless game. Props dissolve as they sweep past
 * the camera, over this depth window; anything at or beyond the avatar's own
 * depth is untouched, so the near foreground still does its job.
 */
export const NEAR_FADE_LO = 0.62;
export const NEAR_FADE_HI = 1.0;

/** Depth of the avatar's own plane, for a route's camera. */
export function avatarZ(cam: CameraOpts): number {
  return Z_NEAR + AVATAR_LEAD * cam.zSpan;
}

/**
 * Opacity for a corridor prop at depth `z`. Full once the prop is at or beyond
 * the avatar's plane; dissolving below it, so nothing the camera passes ends up
 * painted across the child. Screen-edge framing props are exempt — they are
 * what carries the near foreground, and they never sit between camera and
 * character.
 */
export function nearFade(z: number, avZ: number): number {
  const hi = avZ * NEAR_FADE_HI;
  const lo = avZ * NEAR_FADE_LO;
  if (z >= hi) return 1;
  if (z <= lo) return 0;
  const u = (z - lo) / (hi - lo);
  return u * u * (3 - 2 * u);
}

export interface Viewport {
  w: number;
  h: number;
}

export interface Projected {
  x: number;
  y: number;
  /** Perspective factor: 1 at the near plane, → 0 at the horizon. */
  k: number;
  z: number;
  /** False when the point is behind the camera (or so far it is sub-pixel). */
  visible: boolean;
}

export interface CameraOpts {
  /** Screen-y fraction of the horizon line. */
  horizonFrac: number;
  /** Screen-y fraction of the ground at the near plane (may exceed 1 — the
   *  ground directly under the camera is below the bottom edge). */
  nearFrac: number;
  /** World lateral unit → px at the near plane. Also the world→px size factor,
   *  so widths and heights stay in proportion. */
  lateralFrac: number;
  /** Total depth the route spans. Larger = a longer, deeper-feeling journey. */
  zSpan: number;
}

export const DEFAULT_CAMERA: CameraOpts = {
  horizonFrac: 0.4,
  nearFrac: 1.02,
  lateralFrac: 0.42,
  zSpan: 22,
};

/** How far ahead of the camera the avatar walks. Constant, so the avatar holds
 *  a fixed screen position and size while the world moves past it — the thing
 *  that makes this read as third-person travel rather than a scrolling image. */
export const AVATAR_LEAD = 0.0245;

const clamp = (v: number, lo: number, hi: number): number =>
  Math.max(lo, Math.min(hi, v));
const smoothstep = (t: number): number => t * t * (3 - 2 * t);

/**
 * World lateral unit → px at the near plane.
 *
 * Derived from the LARGER of the two viewport dimensions, not the width. A
 * width-only rule collapsed on a 390x844 phone: the whole world scaled down
 * with the narrow screen, leaving the child ~10% of the frame tall and the
 * corridor reading as a distant diorama rather than as travel. Taking the
 * height into account narrows the field of view on a tall screen — you see
 * less ACROSS the path and more ALONG it, which is the right trade on a phone.
 */
export function lateralK(cam: CameraOpts, view: Viewport): number {
  return Math.max(view.w * cam.lateralFrac, view.h * cam.lateralFrac);
}

/**
 * Reference length for SCREEN-EDGE framing props. Height alone made the
 * overhanging canopy on the enclosed route grow with the viewport's height and
 * seal a portrait phone shut — 100% of the frame was leaves. Clamping against
 * the width keeps a frame a frame at any aspect ratio.
 */
export function frameUnit(view: Viewport): number {
  return Math.min(view.h, view.w * 0.85);
}

/**
 * The route's centre-line offset at `t`, interpolated through the control
 * points with smoothstep easing (C1 at the knots, no overshoot — a path that
 * overshoots reads as a mistake rather than a bend).
 */
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

/** World size (in world units) → pixels at a projected point. */
export function pxSize(worldSize: number, k: number, cam: CameraOpts, view: Viewport): number {
  return worldSize * lateralK(cam, view) * k;
}

// ── Route definitions ──────────────────────────────────────────────

/** Kit sprite identifiers. One kit, reused by every route. */
export type PropKind =
  | "tree1" | "tree2" | "bush1" | "bush2" | "rock" | "flower" | "flowerBush" | "grass";

export interface RouteProp {
  kind: PropKind;
  /** Position along the route. */
  t: number;
  /** Lateral offset from the route CENTRE-LINE, in world units. */
  side: number;
  /** Height in world units (a child is ~0.58). */
  size: number;
  flip?: boolean;
  /** Optional tint, for depth haze or a cooler stand of trees. */
  tint?: number;
}

/** A prop pinned to the screen edge rather than the corridor: the overhanging
 *  branch / bank that frames the shot. Parallax only — no depth. */
export interface FramingProp {
  kind: PropKind;
  /** Screen-x anchor (0 = left edge, 1 = right edge). */
  ax: number;
  /** Screen-y anchor for the sprite's BASE. */
  ay: number;
  /** Height as a fraction of viewport height. */
  hFrac: number;
  flip?: boolean;
  /** How much camera lateral movement shifts it (px per world unit). */
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
  blurb: string;
  /** Centre-line control points as [t, lateral]. */
  curve: readonly (readonly [number, number])[];
  /** Path half-width in world units. */
  halfWidth: number;
  props: readonly RouteProp[];
  framing: readonly FramingProp[];
  destination: { t: number; side: number; size: number };
  /** Progress before which the destination is hidden behind the scenery. The
   *  reveal moment is a composition choice, and one of the things that makes
   *  two routes from the same kit feel like different journeys. */
  revealAt: number;
  palette: RoutePalette;
  camera?: Partial<CameraOpts>;
}

export function cameraFor(route: RouteDef): CameraOpts {
  return { ...DEFAULT_CAMERA, ...route.camera };
}

/** Camera lateral for progress `p` plus the child's steering offset. The camera
 *  only partly follows the steer, so steering visibly moves the avatar across
 *  the path instead of dragging the whole world with it. */
export function cameraLateral(route: RouteDef, p: number, steer: number): number {
  return lateralAt(route.curve, p) + steer * 0.6;
}

/** Where the avatar stands, in corridor space. */
export function avatarAt(route: RouteDef, p: number, steer: number): { t: number; lateral: number } {
  const t = p + AVATAR_LEAD;
  return { t, lateral: lateralAt(route.curve, t) + steer };
}

/** Edge points of the path ribbon, far → near, ready to fill as a polygon.
 *  Returned as segments so the fill can be shaded from far to near. */
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
    // Bias sampling toward the near end, where the perspective changes fastest.
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

/** Destination transform, plus how revealed it is (0 = hidden, 1 = full). */
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
  // Fade in over the 12% of the route after revealAt, so the reveal is a moment
  // rather than a pop.
  const reveal = clamp((p - route.revealAt) / 0.12, 0, 1);
  return { at, px: pxSize(d.size, at.k, cam, view), reveal: smoothstep(reveal) };
}

/** Straight-line progress remaining, for a "destination is closer" readout. */
export function remaining(p: number): number {
  return clamp(1 - p, 0, 1);
}
