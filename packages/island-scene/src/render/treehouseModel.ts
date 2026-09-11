import type { DialogueLine } from "../content/types";

/**
 * Treehouse Hideaway — pure model for the single-screen room.
 *
 * Everything here is plain data + math with NO Pixi and no DOM beyond a
 * guarded localStorage, so the room's layout rules and the three activities
 * are unit-testable on their own (same split as contentBounds.ts /
 * content/practice.ts). TreehouseRoom.ts draws whatever these return.
 *
 * The room is STATIONARY: there is no camera, no world width and no walk
 * target anywhere in this file. If a scroll offset ever appears here, the
 * one-room design has regressed.
 */

// ── Geometry ────────────────────────────────────────────────────────

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const clamp = (v: number, lo: number, hi: number): number =>
  Math.max(lo, Math.min(hi, v));

/**
 * Fit a painted room image over the viewport with COVER semantics: fill the
 * screen entirely, preserve aspect, and let the overflow crop off-screen.
 * Returns the image's on-screen rect — hotspots are positioned against THIS,
 * not the raw viewport, so a marker keeps sitting on the object it was tuned
 * to as the window changes shape.
 *
 * Degenerate texture sizes (0 / NaN, e.g. a texture that failed to decode)
 * fall back to the full viewport so callers never divide by zero.
 */
export function coverRect(
  texW: number,
  texH: number,
  screenW: number,
  screenH: number,
): Rect {
  if (!(texW > 0) || !(texH > 0)) return { x: 0, y: 0, w: screenW, h: screenH };
  const scale = Math.max(screenW / texW, screenH / texH);
  const w = texW * scale;
  const h = texH * scale;
  return { x: (screenW - w) / 2, y: (screenH - h) / 2, w, h };
}

// ── Primary interactions ────────────────────────────────────────────

export type HotspotId = "decorate" | "puzzle" | "story";

export interface HotspotAnchor {
  id: HotspotId;
  label: string;
  icon: string;
  /**
   * Where this action lives ON THE PAINTING, as a fraction of the image's
   * width/height. These are the ONE place to retune when the final painted
   * room lands: point each at the object it belongs to (the decorating shelf,
   * the leaf pile, the reading nook) and the button follows the art at every
   * aspect ratio. Values below are aimed at the described composition —
   * cosy nook right, big tree centre, plants/shelf left.
   */
  ax: number;
  ay: number;
}

export const HOTSPOTS: readonly HotspotAnchor[] = [
  { id: "decorate", label: "Decorate", icon: "🎨", ax: 0.18, ay: 0.66 },
  { id: "puzzle", label: "Leaf Puzzle", icon: "🍃", ax: 0.5, ay: 0.76 },
  { id: "story", label: "Story Nook", icon: "📖", ax: 0.82, ay: 0.62 },
] as const;

export interface PlacedHotspot extends HotspotAnchor {
  /** Centre + size in screen px. */
  x: number;
  y: number;
  w: number;
  h: number;
}

/** How the three buttons ended up arranged — surfaced for tests/diagnostics. */
export type HotspotLayoutMode = "anchored" | "row" | "stack";

export interface HotspotLayout {
  mode: HotspotLayoutMode;
  spots: PlacedHotspot[];
}

/** Smallest comfortable child tap target (px) on the shortest edge. */
export const MIN_TAP = 56;

const PAD = 16;
const GAP = 12;
/** Kept clear for the host's bottom-right mute/zoom controls. */
const BOTTOM_RIGHT_RESERVE = 64;
/** Bottom inset for the stacked (phone) layout — clears the home indicator. */
const BOTTOM_INSET = 30;

/**
 * Place the three primary buttons.
 *
 * Wide enough for a row: anchor each to its spot on the painting, clamp it
 * inside a safe margin, and if clamping pushed any two into each other fall
 * back to an evenly-spaced row so nothing ever overlaps. Too narrow for three
 * abreast (phones in portrait): stack them bottom-left, clear of the host's
 * bottom-right controls. Every branch yields targets ≥ MIN_TAP tall.
 */
export function layoutHotspots(
  img: Rect,
  screenW: number,
  screenH: number,
): HotspotLayout {
  const minPillW = 124;
  const canRow = screenW >= minPillW * 3 + GAP * 2 + PAD * 2;

  if (!canRow) {
    const w = Math.min(screenW - PAD * 2 - BOTTOM_RIGHT_RESERVE, 420);
    const h = clamp(screenH * 0.085, MIN_TAP, 76);
    const total = h * 3 + GAP * 2;
    // Extra bottom inset so the last pill doesn't hug the screen edge (phone
    // home indicators / the host's bottom controls live down there).
    const top = screenH - BOTTOM_INSET - total;
    return {
      mode: "stack",
      spots: HOTSPOTS.map((s, i) => ({
        ...s,
        x: PAD + w / 2,
        y: top + h / 2 + i * (h + GAP),
        w,
        h,
      })),
    };
  }

  const w = clamp(screenW * 0.24, minPillW, 240);
  const h = clamp(screenH * 0.1, MIN_TAP, 84);
  const anchored: PlacedHotspot[] = HOTSPOTS.map((s) => ({
    ...s,
    x: clamp(img.x + s.ax * img.w, PAD + w / 2, screenW - PAD - w / 2),
    y: clamp(img.y + s.ay * img.h, PAD + h / 2, screenH - PAD - h / 2),
    w,
    h,
  }));

  const overlapping = anchored.some((a, i) =>
    anchored.some(
      (b, j) =>
        j > i &&
        Math.abs(a.x - b.x) < (a.w + b.w) / 2 + GAP &&
        Math.abs(a.y - b.y) < (a.h + b.h) / 2 + GAP,
    ),
  );
  if (!overlapping) return { mode: "anchored", spots: anchored };

  const y = screenH - PAD - h / 2;
  const span = w * 3 + GAP * 2;
  const left = (screenW - span) / 2 + w / 2;
  return {
    mode: "row",
    spots: HOTSPOTS.map((s, i) => ({ ...s, x: left + i * (w + GAP), y, w, h })),
  };
}

/** Back-to-Island pill, pinned top-left (the host's DOM exit sits top-right). */
export function backButtonRect(screenW: number, screenH: number): Rect {
  const w = clamp(screenW * 0.34, 148, 210);
  const h = clamp(screenH * 0.082, MIN_TAP, 64);
  return { x: PAD, y: PAD, w, h };
}

/** Point-in-rect for a CENTRED pill (hotspots) . */
export function hitPill(
  p: { x: number; y: number; w: number; h: number },
  sx: number,
  sy: number,
): boolean {
  return (
    Math.abs(sx - p.x) <= p.w / 2 && Math.abs(sy - p.y) <= p.h / 2
  );
}

/** Point-in-rect for a TOP-LEFT anchored rect (back button, panel tiles). */
export function hitRect(r: Rect, sx: number, sy: number): boolean {
  return sx >= r.x && sx <= r.x + r.w && sy >= r.y && sy <= r.y + r.h;
}

// ── 1. Decorate ─────────────────────────────────────────────────────

export type DecorId = "lantern" | "plant" | "cushion" | "garland";

export interface DecorItem {
  id: DecorId;
  label: string;
  icon: string;
  /** Where the decoration sits in the room, as image fractions. */
  ax: number;
  ay: number;
}

export const DECOR_ITEMS: readonly DecorItem[] = [
  { id: "lantern", label: "Lantern", icon: "🏮", ax: 0.3, ay: 0.3 },
  { id: "plant", label: "Plant", icon: "🪴", ax: 0.12, ay: 0.8 },
  { id: "cushion", label: "Cushion", icon: "🧸", ax: 0.74, ay: 0.8 },
  { id: "garland", label: "Garland", icon: "✨", ax: 0.52, ay: 0.14 },
] as const;

const DECOR_KEY = "engage-island.treehouse.decor";

const isDecorId = (v: unknown): v is DecorId =>
  typeof v === "string" && DECOR_ITEMS.some((d) => d.id === v);

/**
 * Read the child's saved decorations. Storage is optional everywhere (private
 * windows, SSR, tests), so every failure degrades to "nothing placed yet"
 * rather than throwing — same guard style as build-engine/saves.ts.
 */
export function loadDecor(): DecorId[] {
  try {
    const raw = globalThis.localStorage?.getItem(DECOR_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isDecorId) : [];
  } catch {
    return [];
  }
}

/** Persist decorations. Returns false when storage was unavailable, so the UI
 *  can withhold the "Saved" tick rather than promise something that didn't
 *  happen. */
export function saveDecor(ids: readonly DecorId[]): boolean {
  try {
    globalThis.localStorage?.setItem(DECOR_KEY, JSON.stringify([...ids]));
    return !!globalThis.localStorage;
  } catch {
    return false;
  }
}

export function toggleDecor(
  current: readonly DecorId[],
  id: DecorId,
): DecorId[] {
  return current.includes(id)
    ? current.filter((d) => d !== id)
    : [...current, id];
}

// ── 2. Leaf Puzzle ──────────────────────────────────────────────────

/** Relative leaf sizes, smallest → largest. Index IS the rank. */
export const LEAF_SIZES = [0.52, 0.7, 0.88, 1.1] as const;

export interface PuzzleLeaf {
  /** 0 = smallest … 3 = largest. Tap order is by rank, ascending. */
  rank: number;
  /** Display slot 0..3, left → right. */
  slot: number;
}

export interface PuzzleState {
  leaves: PuzzleLeaf[];
  /** How many leaves have been tapped correctly so far (0..4). */
  progress: number;
  done: boolean;
  /** Rank of the leaf most recently tapped wrong, for a gentle nudge. */
  wrongRank: number | null;
}

/** Tiny seeded RNG so a puzzle can be reproduced exactly in a test. */
function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A fresh puzzle: the four leaves shuffled across the four slots. The shuffle
 * is re-rolled until it isn't already in size order, so a child is never
 * handed a puzzle that is solved before they touch it.
 */
export function newPuzzle(seed: number): PuzzleState {
  const rnd = mulberry(seed);
  let ranks = [0, 1, 2, 3];
  for (let attempt = 0; attempt < 8; attempt++) {
    const next = [0, 1, 2, 3];
    for (let i = next.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [next[i], next[j]] = [next[j], next[i]];
    }
    ranks = next;
    if (!next.every((r, i) => r === i)) break;
  }
  return {
    leaves: ranks.map((rank, slot) => ({ rank, slot })),
    progress: 0,
    done: false,
    wrongRank: null,
  };
}

/**
 * Tap a leaf. Correct (the next smallest) advances; anything else is a no-op
 * that flags the leaf for a shake — progress is NEVER reset, so a wrong guess
 * costs a five-year-old nothing but a wobble.
 */
export function tapLeaf(state: PuzzleState, rank: number): PuzzleState {
  if (state.done) return state;
  if (rank !== state.progress) return { ...state, wrongRank: rank };
  const progress = state.progress + 1;
  return {
    ...state,
    progress,
    done: progress >= LEAF_SIZES.length,
    wrongRank: null,
  };
}

// ── 3. Story Nook ───────────────────────────────────────────────────

/** Shown when no `.story.` lines are authored (prod soft-skip path). */
export const STORY_FALLBACK = [
  "Olive settles onto a branch and opens a well-loved book.",
  "Outside, the leaves whisper. Inside, it is warm and quiet.",
  "“Stories keep best up here,” she says. “Come back any time.”",
];

/**
 * The Story Nook's pages, read from the zone's dialogue content: every line
 * whose node is `story`, in sequence order. Authoring a new page is a JSON
 * edit — no code change — which is the whole point of the content pipeline.
 */
export function storyPages(lines: readonly DialogueLine[]): string[] {
  const pages = lines
    .filter((l) => l.id.split(".")[2] === "story")
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((l) => l.text)
    .filter((t) => t.length > 0);
  return pages.length ? pages : [...STORY_FALLBACK];
}
