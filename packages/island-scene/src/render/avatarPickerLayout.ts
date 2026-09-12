/**
 * Avatar picker layout — pure geometry, no Pixi.
 *
 * The old picker was a fixed 4x4 wall of 16 animals that drag-scrolled on
 * anything small. With six core friends the arrangement can instead be chosen
 * per viewport, so the characters stay large and the screen reads as designed
 * rather than as a grid that happened to overflow.
 *
 * The rule: try 6 / 3 / 2 columns, discard any that would make a card too
 * small to read, and prefer the arrangement with the BIGGEST cards that still
 * fits without scrolling. When nothing fits we scroll, and there the tiebreak
 * flips to the FEWEST rows — on a short landscape phone the biggest-card
 * option would be one 500px card and a very long scroll. That lands on six
 * across for desktop, landscape tablet and landscape phone, 3x2 for portrait
 * tablets, and 2x3 with a little scroll on a phone, none of it special-cased.
 */

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface CardRect extends Rect {
  key: string;
}

export interface PickerLayout {
  cols: number;
  rows: number;
  /** Cards in CONTENT coordinates (y = 0 is the top of the scrolled area). */
  cards: CardRect[];
  /** Total content height; exceeds viewport.h only when `scrolls`. */
  contentH: number;
  scrolls: boolean;
  /** The clipped area the cards live in, in screen px. */
  viewport: Rect;
  /** Baseline y for the title / helper copy, in screen px. */
  titleY: number;
  /** The Continue button, in screen px (centre-anchored rect). */
  continueRect: Rect;
  cardW: number;
  cardH: number;
}

/**
 * Smallest card width that still reads and taps well for a 5-year-old. Well
 * above the ~44px touch target — the binding constraint is the name staying
 * legible, not the finger.
 *
 * A SHORT viewport (landscape phone) relaxes it: there is no vertical room for
 * a second row there, so slightly narrower cards in one row beat big cards
 * behind a long scroll. On a tall screen the stricter number is what keeps a
 * phone on 2x3 instead of cramming three columns of 111px.
 */
export function minCardW(h: number): number {
  return h < SHORT_VIEWPORT_H ? 100 : 132;
}
/** The tall-viewport minimum, exported for tests/diagnostics. */
export const MIN_CARD_W = 132;
/** Card height as a multiple of its width (image + name + traits). Cards grow
 *  TALLER, never wider, when a viewport has vertical room to spare — six across
 *  on a desktop otherwise leaves the characters small in a sea of background. */
export const CARD_ASPECT = 1.35;
export const CARD_ASPECT_MAX = 1.72;
/** Column counts we are willing to use, largest first. */
export const COLUMN_CHOICES = [6, 3, 2] as const;

const GUTTER = 14;
const MAX_GRID_W = 1240;
/** The host paints zoom/mute controls in the bottom-right. On a SHORT viewport
 *  those sit beside the cards rather than below them, so the grid gives up that
 *  strip; on a tall screen the cards clear them anyway. */
const CONTROL_RESERVE = 68;
/** Below this height a viewport is "short" (a landscape phone). */
const SHORT_VIEWPORT_H = 520;

const clamp = (v: number, lo: number, hi: number): number =>
  Math.max(lo, Math.min(hi, v));

/** Type sizes for the header, shared by the layout and the renderer so the
 *  reserved height always matches the text actually drawn. */
export function headerType(w: number, h: number): {
  titleSize: number;
  subSize: number;
  hintSize: number;
  titleY: number;
} {
  // Scaled by the SHORTER edge as well as the width: a landscape phone is wide
  // but only 390px tall, and a width-only title there ate the cards.
  const titleSize = clamp(Math.min(w / 17, h / 11), 20, 44);
  const subSize = clamp(Math.min(w / 44, h / 30), 12, 19);
  return {
    titleSize,
    subSize,
    hintSize: clamp(subSize * 0.88, 11, 17),
    titleY: clamp(h * 0.035, 8, 40),
  };
}

/** Height reserved at the top — computed from the real type sizes, not a
 *  viewport fraction, so the helper copy can never land on the cards. */
export function headerHeight(w: number, h: number): number {
  const t = headerType(w, h);
  const gap = h < SHORT_VIEWPORT_H ? 5 : 8;
  return (
    t.titleY + t.titleSize * 1.3 + gap + t.subSize * 1.35 + 2 + t.hintSize * 1.35 + 14
  );
}

/** Height reserved at the bottom for the Continue button. */
export function footerHeight(h: number): number {
  return clamp(h * 0.15, 84, 132);
}

function gridFor(
  keys: readonly string[],
  cols: number,
  w: number,
  vp: Rect,
): { cards: CardRect[]; rows: number; cardW: number; cardH: number; contentH: number } {
  const sideMargin = Math.max(14, w * 0.035);
  const rightReserve = vp.h + vp.y < SHORT_VIEWPORT_H ? CONTROL_RESERVE : 0;
  const gridW = Math.min(w - sideMargin * 2 - rightReserve, MAX_GRID_W);
  const cardW = (gridW - GUTTER * (cols - 1)) / cols;
  const rows = Math.ceil(keys.length / cols);
  // Grow into spare vertical room, up to CARD_ASPECT_MAX.
  const roomPerRow = (vp.h - GUTTER * (rows - 1)) / rows;
  const cardH = clamp(roomPerRow, cardW * CARD_ASPECT, cardW * CARD_ASPECT_MAX);
  const gridLeft = (w - rightReserve - (cardW * cols + GUTTER * (cols - 1))) / 2;

  const cards: CardRect[] = keys.map((key, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    // Short final row (e.g. 2 columns, 6 items is exact; 3 columns, 4 items is
    // not) is centred rather than left-ragged.
    const inRow = Math.min(cols, keys.length - row * cols);
    const rowW = cardW * inRow + GUTTER * (inRow - 1);
    const rowLeft = inRow === cols ? gridLeft : (w - rowW) / 2;
    return {
      key,
      x: rowLeft + col * (cardW + GUTTER),
      y: row * (cardH + GUTTER),
      w: cardW,
      h: cardH,
    };
  });

  return {
    cards,
    rows,
    cardW,
    cardH,
    contentH: rows * cardH + (rows - 1) * GUTTER,
  };
}

/** Arrange `keys` (the six core friends) for a viewport. */
export function pickerLayout(
  keys: readonly string[],
  w: number,
  h: number,
): PickerLayout {
  const top = headerHeight(w, h);
  const bottom = footerHeight(h);
  const viewport: Rect = {
    x: 0,
    y: top,
    w,
    h: Math.max(120, h - top - bottom),
  };

  type Candidate = ReturnType<typeof gridFor> & { cols: number; fits: boolean };
  const all: Candidate[] = COLUMN_CHOICES.map((cols) => {
    const g = gridFor(keys, cols, w, viewport);
    return { ...g, cols, fits: g.contentH <= viewport.h };
  });

  const floor = minCardW(h);
  const tappable = all.filter((c) => c.cardW >= floor);
  const pool = tappable.length ? tappable : [all[all.length - 1]];
  const fitting = pool.filter((c) => c.fits);
  const chosen = fitting.length
    // Everything on screen at once: take the BIGGEST cards among those that
    // fit, which is what puts 3x2 (not 6-across) on a portrait tablet.
    ? fitting.reduce((best, c) => (c.cardW > best.cardW ? c : best))
    // Nothing fits, so we will scroll. Compromise on card SIZE, not on scroll
    // length: fewest rows first. Picking the biggest cards here would hand a
    // short landscape phone a single 500px card and a very long scroll.
    : pool.reduce((best, c) =>
        c.rows !== best.rows ? (c.rows < best.rows ? c : best)
          : c.cardW > best.cardW ? c : best,
      );

  const bw = clamp(w * 0.42, 200, 320);
  const bh = clamp(h * 0.085, 58, 76);

  return {
    cols: chosen.cols,
    rows: chosen.rows,
    cards: chosen.cards,
    contentH: chosen.contentH,
    scrolls: chosen.contentH > viewport.h,
    viewport,
    titleY: headerType(w, h).titleY,
    continueRect: {
      x: (w - bw) / 2,
      y: h - bottom / 2 - bh / 2,
      w: bw,
      h: bh,
    },
    cardW: chosen.cardW,
    cardH: chosen.cardH,
  };
}
