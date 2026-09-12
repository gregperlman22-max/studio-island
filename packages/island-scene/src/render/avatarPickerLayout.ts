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
 *
 * VERTICAL COMPOSITION. The cards and the Continue button are laid out as ONE
 * block, not as two independently anchored bands. The button used to be pinned
 * to the bottom of the screen while the cards centred in whatever was left,
 * which on a desktop left ~170px of empty background between the roster and the
 * button — the screen read as a debug grid with a stray button under it. Now the
 * card band is exactly as tall as its content, the button sits a fixed gap below
 * it, and the whole block is centred in the space under the header. Spare room
 * therefore shows up as margin around the composition instead of as a hole
 * inside it.
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
export const CARD_ASPECT_MAX = 1.92;
/** Column counts we are willing to use, largest first. */
export const COLUMN_CHOICES = [6, 3, 2] as const;

/**
 * How wide the six-card roster is allowed to get. A hard cap is what stops an
 * ultrawide monitor from stretching six cards across 2500px, but the previous
 * 1240 also capped a perfectly ordinary 1920 desktop at 195px cards — a third
 * of the screen sat empty on each side of a small row. 1640 lets a 1080p
 * desktop use ~85% of its width and still reins in an ultrawide.
 */
const MAX_GRID_W = 1640;
/** Side margin: a percentage on small screens, but capped so a wide desktop
 *  spends its pixels on cards rather than on gutters. */
const MAX_SIDE_MARGIN = 40;
/** The host paints zoom/mute controls in the bottom-right. On a SHORT viewport
 *  those sit beside the cards rather than below them, so the grid gives up that
 *  strip; on a tall screen the cards clear them anyway. */
const CONTROL_RESERVE = 68;
/** Below this height a viewport is "short" (a landscape phone). */
const SHORT_VIEWPORT_H = 520;

const clamp = (v: number, lo: number, hi: number): number =>
  Math.max(lo, Math.min(hi, v));

/** Gap between cards. Wider screens carry a slightly larger gutter so the row
 *  reads as six deliberate cards rather than one striped slab. */
function gutterFor(w: number): number {
  return w >= 1100 ? 18 : 14;
}

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
  // Hosts paint a settings control in the TOP-LEFT. On a narrow portrait
  // screen a centred full-width title runs straight under it, so the header
  // starts below that control instead. Not applied to a short viewport (a
  // landscape phone), where 76px of top inset would cost the cards their row.
  const clearHostControl = w < 900 && h >= 560 ? 76 : 0;
  return {
    titleSize,
    subSize,
    hintSize: clamp(subSize * 0.88, 11, 17),
    titleY: Math.max(clamp(h * 0.035, 8, 40), clearHostControl),
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

/** Continue button size (the renderer reads it back off `continueRect`). */
function buttonSize(w: number, h: number): { bw: number; bh: number } {
  return {
    bw: clamp(w * 0.42, 200, 320),
    bh: clamp(h * 0.085, 58, 76),
  };
}

/** Gap between the bottom of the roster and the top of the Continue button.
 *  Small enough that the button reads as part of the same composition. */
export function rosterButtonGap(h: number): number {
  return clamp(h * 0.035, 20, 48);
}

/** Breathing room below the button. */
function bottomMargin(h: number): number {
  return clamp(h * 0.032, 14, 40);
}

function gridFor(
  keys: readonly string[],
  cols: number,
  w: number,
  vp: Rect,
): { cards: CardRect[]; rows: number; cardW: number; cardH: number; contentH: number } {
  const gutter = gutterFor(w);
  const sideMargin = Math.max(14, Math.min(w * 0.035, MAX_SIDE_MARGIN));
  const rightReserve = vp.h + vp.y < SHORT_VIEWPORT_H ? CONTROL_RESERVE : 0;
  const gridW = Math.min(w - sideMargin * 2 - rightReserve, MAX_GRID_W);
  const cardW = (gridW - gutter * (cols - 1)) / cols;
  const rows = Math.ceil(keys.length / cols);
  // Grow into spare vertical room, up to CARD_ASPECT_MAX.
  const roomPerRow = (vp.h - gutter * (rows - 1)) / rows;
  const cardH = clamp(roomPerRow, cardW * CARD_ASPECT, cardW * CARD_ASPECT_MAX);
  const gridLeft = (w - rightReserve - (cardW * cols + gutter * (cols - 1))) / 2;

  const cards: CardRect[] = keys.map((key, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    // Short final row (e.g. 2 columns, 6 items is exact; 3 columns, 4 items is
    // not) is centred rather than left-ragged.
    const inRow = Math.min(cols, keys.length - row * cols);
    const rowW = cardW * inRow + gutter * (inRow - 1);
    const rowLeft = inRow === cols ? gridLeft : (w - rowW) / 2;
    return {
      key,
      x: rowLeft + col * (cardW + gutter),
      y: row * (cardH + gutter),
      w: cardW,
      h: cardH,
    };
  });

  return {
    cards,
    rows,
    cardW,
    cardH,
    contentH: rows * cardH + (rows - 1) * gutter,
  };
}

/** Arrange `keys` (the six core friends) for a viewport. */
export function pickerLayout(
  keys: readonly string[],
  w: number,
  h: number,
): PickerLayout {
  const top = headerHeight(w, h);
  const { bw, bh } = buttonSize(w, h);
  const gap = rosterButtonGap(h);
  const bottom = bottomMargin(h);

  // Room the cards may use once the button and its gap are subtracted. This is
  // the band the arrangement is chosen against, NOT the band it is drawn in:
  // a non-scrolling layout shrinks to its content below.
  const band = Math.max(120, h - top - bottom - bh - gap);
  const probe: Rect = { x: 0, y: top, w, h: band };

  type Candidate = ReturnType<typeof gridFor> & { cols: number; fits: boolean };
  const all: Candidate[] = COLUMN_CHOICES.map((cols) => {
    const g = gridFor(keys, cols, w, probe);
    // Half a pixel of slack: a row sized to exactly fill the band computes a
    // contentH equal to it, and float error must not turn that into a scroll.
    return { ...g, cols, fits: g.contentH <= band + 0.5 };
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

  const scrolls = chosen.contentH > band + 0.5;
  // The clipped band is the content's own height when it all fits, so the
  // button can ride directly under the last row instead of being stranded at
  // the bottom of the screen.
  const bandH = scrolls ? band : Math.min(band, chosen.contentH);
  const blockH = bandH + gap + bh;
  // Centre the whole [cards + gap + button] block in the space under the
  // header. Spare room becomes margin around the composition, never a hole
  // between the roster and the button.
  const slack = Math.max(0, h - top - bottom - blockH);
  const lift = slack * 0.5;
  const vpY = top + lift;

  return {
    cols: chosen.cols,
    rows: chosen.rows,
    cards: chosen.cards,
    contentH: chosen.contentH,
    scrolls,
    viewport: { x: 0, y: vpY, w, h: bandH },
    titleY: headerType(w, h).titleY,
    continueRect: {
      x: (w - bw) / 2,
      y: vpY + bandH + gap,
      w: bw,
      h: bh,
    },
    cardW: chosen.cardW,
    cardH: chosen.cardH,
  };
}
