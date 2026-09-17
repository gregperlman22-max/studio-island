import { discoveryWaypoint, nextWaypoint, type RouteDef } from "./routeModel";

/**
 * The journey's state machine and overlay geometry. Pure — no Pixi, no DOM.
 *
 * THE APPROVED FLOW, and the whole of it:
 *
 *   Treehouse tapped on the map
 *     → a small CHARACTER-FREE destination card ("Let's go!" / dismiss)
 *     → the A2 journey
 *     → the arrival greeting, where Olive meets the child's Friend
 *     → the Treehouse room
 *
 * Olive appears for the FIRST time at arrival. She is deliberately absent from
 * the destination card: the card is a confirmation, not a character beat, and
 * spending her entrance on the map would take the greeting away from where the
 * approved flow puts it.
 */

export type JourneyPhase = "card" | "travel" | "arrival";
export type DiscoveryState = "unseen" | "found";

export interface JourneyState {
  phase: JourneyPhase;
  /** Progress along the route, 0 → 1. */
  p: number;
  /** The child's steering offset across the path, -1 → 1. */
  steer: number;
  discovery: DiscoveryState;
  mapOpen: boolean;
  /** Under reduced motion the journey is a series of cuts between waypoints
   *  rather than a continuous walk. */
  reducedMotion: boolean;
}

export function newJourney(reducedMotion: boolean): JourneyState {
  return { phase: "card", p: 0, steer: 0, discovery: "unseen", mapOpen: false, reducedMotion };
}

/** "Let's go!" on the destination card. */
export function beginTravel(s: JourneyState): JourneyState {
  return { ...s, phase: "travel", p: 0, steer: 0 };
}

/** Walk speed in progress-per-second. ~14s end to end at a steady hold, which
 *  is a journey rather than an errand and still short enough for a five-year
 *  old to stay with. */
export const WALK_RATE = 0.072;
/** How fast steering crosses the path. */
export const STEER_RATE = 0.85;

/**
 * Continuous travel: hold to walk. Arrival is a state change, not a stop — the
 * journey ends itself so a child never has to work out that they have finished.
 */
export function advance(s: JourneyState, dt: number, walking: boolean, steer: number): JourneyState {
  if (s.phase !== "travel" || s.mapOpen) return s;
  // Reduced motion never walks continuously — it cuts between waypoints. The
  // view gates this too, but the rule belongs here: a caller that forgets is
  // then simply ignored rather than quietly reintroducing continuous motion.
  if (s.reducedMotion) return s;
  const p = walking ? Math.min(1, s.p + WALK_RATE * dt) : s.p;
  const next = clamp(s.steer + steer * STEER_RATE * dt, -1, 1);
  if (p >= 1) return { ...s, p: 1, steer: next, phase: "arrival" };
  return { ...s, p, steer: next };
}

/** Reduced motion: cut to the next waypoint. */
export function stepToNextWaypoint(s: JourneyState, route: RouteDef): JourneyState {
  if (s.phase !== "travel" || s.mapOpen) return s;
  const w = nextWaypoint(route, s.p);
  if (w === null || w >= 1) return { ...s, p: 1, phase: "arrival" };
  return { ...s, p: w };
}

/**
 * Is the discovery reachable from where the child is standing?
 *
 * Under reduced motion this is true only at the waypoint beside the log, which
 * is what lets the same two decisions — notice it, act on it — survive without
 * any continuous steering. In continuous travel it is a window around the log's
 * own position, so a child who walks past without looking simply walks past.
 */
export function discoveryReachable(s: JourneyState, route: RouteDef): boolean {
  if (s.phase !== "travel" || s.discovery === "found") return false;
  if (s.reducedMotion) return Math.abs(s.p - discoveryWaypoint(route)) < 1e-6;
  return Math.abs(s.p - route.discovery.t) < 0.13;
}

/** Tap the hollow log. Steering is never required: tapping it IS the action. */
export function findDiscovery(s: JourneyState): JourneyState {
  return { ...s, discovery: "found" };
}

export function openMap(s: JourneyState): JourneyState {
  return { ...s, mapOpen: true };
}
export function closeMap(s: JourneyState): JourneyState {
  return { ...s, mapOpen: false };
}

/**
 * Leave the journey and go back to the island.
 *
 * Deliberately a RESTART rather than a resume: the walk is ~14 seconds, and a
 * half-finished journey restored later is more confusing to a child than
 * setting off again. Consistent with the accepted amendment.
 */
export function abandon(s: JourneyState): JourneyState {
  return newJourney(s.reducedMotion);
}

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

// ── The journey map ─────────────────────────────────────────────────

export interface Rect { x: number; y: number; w: number; h: number }

/**
 * The map panel: a framed window onto a SNAPSHOT OF THE REAL WORLD MAP, taken
 * when the journey began. It is the island the child was just looking at, not
 * a drawing of one.
 */
export function mapPanelRect(screenW: number, screenH: number): Rect {
  const w = Math.min(screenW - 32, 560);
  const h = Math.min(screenH - 200, w * 0.62);
  return { x: (screenW - w) / 2, y: Math.max(76, (screenH - h) / 2 - 40), w, h };
}

/**
 * The progress track, BELOW the map rather than drawn across it.
 *
 * This is the deliberate part. Drawing a line between the two landmarks on the
 * island would assert a navigable route through locked geography that nobody
 * has verified — the walkgrid and the landmark coordinates are locked, and the
 * journey is a composed corridor, not a path anyone has pathfound across the
 * island. So the map answers "where am I going" and "where did I start" by
 * marking the two real landmarks at their real positions, and answers "how far
 * along am I" on a separate, obviously abstract track underneath. Nothing on
 * the island itself is claimed.
 */
export function progressTrackRect(panel: Rect): Rect {
  const h = 26;
  return { x: panel.x + 24, y: panel.y + panel.h + 26, w: panel.w - 48, h };
}

/** Where the Friend's marker sits on that track, for progress `p`. */
export function progressMarkerX(track: Rect, p: number): number {
  return track.x + clamp(p, 0, 1) * track.w;
}

/** The two buttons under the map: keep going, or go back to the island. */
export function mapButtonRects(panel: Rect, screenW: number, screenH: number): {
  keepGoing: Rect;
  backToIsland: Rect;
} {
  const h = 58;
  const gap = 12;
  const w = Math.min((Math.min(screenW - 32, 560) - gap) / 2, 240);
  const total = w * 2 + gap;
  const left = (screenW - total) / 2;
  const y = Math.min(screenH - h - 20, progressTrackRect(panel).y + 56);
  return {
    keepGoing: { x: left, y, w, h },
    backToIsland: { x: left + w + gap, y, w, h },
  };
}

export function hitRect(r: Rect, x: number, y: number): boolean {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}

/**
 * Where the world-map snapshot lands inside the map panel.
 *
 * The snapshot is cover-fitted, so on a viewport whose panel aspect differs
 * from the aspect the snapshot was taken at, part of it is cropped. Anything
 * marked ON the snapshot has to be placed through this same rect or it drifts
 * off the landmark it is pointing at.
 */
export function snapshotRect(panel: Rect, texW: number, texH: number): Rect {
  const k = Math.max(panel.w / (texW || 1), panel.h / (texH || 1));
  const w = (texW || 0) * k;
  const h = (texH || 0) * k;
  return { x: panel.x + (panel.w - w) / 2, y: panel.y + (panel.h - h) / 2, w, h };
}

/** A normalised point inside the snapshot, in screen coordinates. */
export function markPoint(rect: Rect, n: { x: number; y: number }): { x: number; y: number } {
  return { x: rect.x + n.x * rect.w, y: rect.y + n.y * rect.h };
}

/**
 * The arrival stage: where the ground is, and how big the Treehouse is drawn
 * on it.
 *
 * The journey used to end by simply leaving the corridor's last frame on
 * screen. At p = 1 the destination sits on the near plane at six frame-units,
 * so what the child actually arrived at was a wall of trunk — no approach, no
 * way in, and the Friend and Olive standing beside it with nothing to connect
 * them to it.
 *
 * Arrival is its own composition instead: the whole structure base-pinned on
 * the SAME ground line the two characters stand on, so the approach (the
 * stairs, in the approved art) visibly meets the ground where their feet are.
 * The characters sit either side of centre so neither covers the foot of it.
 */
export function arrivalStage(view: { w: number; h: number }): {
  groundY: number;
  treeX: number;
  treeH: number;
} {
  const groundY = view.h * ARRIVAL_GROUND;
  return { groundY, treeX: view.w * 0.5, treeH: Math.max(80, groundY - 10) };
}

/** Fraction of screen height where the arrival ground line sits. */
export const ARRIVAL_GROUND = 0.8;
