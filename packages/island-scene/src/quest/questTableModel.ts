import { coverRect, roomFit, type Rect, type RoomFit } from "../render/treehouseModel";

/**
 * Quest Table — pure model for the Treehouse's magical object.
 *
 * EC-1 SCOPE. This file carries the geometry that makes the Quest Table read
 * as a physical object IN the room, plus a single hard-coded story beat used
 * to prove the interaction. The full seven-beat quest engine, the three age
 * bands and the content pipeline are later S-89 work and deliberately absent.
 *
 * Everything here is plain data + math with NO Pixi and no DOM, exactly like
 * treehouseModel.ts, so the composition rules are unit-testable on their own.
 * QuestTable.ts draws whatever these return.
 *
 * THE DESIGN RULE THIS FILE EXISTS TO ENFORCE: the Quest Table is not an
 * overlay. The room stays visible and un-dimmed around it, the diorama rises
 * from the painted table, and the two characters stand ON the room's floor.
 * Every anchor below is therefore an IMAGE fraction — tuned to the shipped
 * 2000x1125 painting — not a screen fraction. Repaint the room and these get
 * retuned, the same contract HOTSPOTS already has.
 */

// ── Anchors on the painting ─────────────────────────────────────────

/**
 * The round wooden table, measured off treehouse-hideaway.webp.
 *
 * `cx`/`cy` are the centre of the table's TOP SURFACE (the ellipse the leaf
 * tiles and the fruit bowl sit on), `halfW` its horizontal radius and `topRy`
 * its vertical radius — the foreshortening of a round table seen from the
 * room's eye level. The diorama is staged against this ellipse, so the
 * miniature world sits on the wood rather than floating over it.
 */
export const TABLE = {
  cx: 0.531,
  cy: 0.712,
  halfW: 0.136,
  topRy: 0.03,
} as const;

/**
 * Where the two characters stand, as image fractions of their FEET.
 *
 * Olive to the left of the table on open floorboards, the child's Friend to
 * the right, both turned inward. Flanking the table (rather than standing
 * behind it) is what makes the table read as the thing being shared, and it
 * keeps both faces clear of the tree trunk behind.
 */
export const OLIVE_ANCHOR = { ax: 0.318, ay: 0.845 } as const;
export const FRIEND_ANCHOR = { ax: 0.742, ay: 0.862 } as const;

/**
 * The band of the painting that MUST be on screen while the table is open:
 * Olive, the table and the Friend, plus a margin of room around them.
 *
 * This is the number that stops the composition from silently failing on a
 * phone. Plain cover-fit at 390x844 shows only the middle ~26% of the
 * painting's width — the table survives, and both characters are cropped
 * away. `questRoomFit` below uses this span to pull the framing back instead.
 */
export const QUEST_SPAN_X = { from: 0.27, to: 0.79 } as const;

/** Height of a character, as a fraction of the painting's height. Olive is
 *  deliberately a little shorter than the Friend: she is a guide standing in
 *  her own room, not a looming adult. */
export const OLIVE_H = 0.28;
export const FRIEND_H = 0.31;

// ── Room framing while the table is open ────────────────────────────

/**
 * How the painting is framed when the Quest Table is open.
 *
 * Normal room framing (`roomFit`) optimises for the room as a whole. With the
 * table open the subject is narrower and specific — Olive, table, Friend — and
 * that band must never be cropped. So: start from the room's own fit, and if
 * it would crop QUEST_SPAN_X, scale back until the span fits the width and
 * centre it on the table.
 *
 * On desktop and tablet this returns the normal fit unchanged (the span is
 * already visible). It is phone portrait that actually moves — and there the
 * pull-back is a feature, not a compromise: the room visibly draws back to
 * take in the table, which is how a camera would cover two people sharing an
 * object. Leftover height is filled by TreehouseRoom's existing blurred
 * portrait surround, so there are still no bars.
 */
export function questRoomFit(
  texW: number,
  texH: number,
  screenW: number,
  screenH: number,
): RoomFit {
  const base = roomFit(texW, texH, screenW, screenH);
  if (!(texW > 0) || !(texH > 0) || !(screenW > 0)) return base;

  const span = QUEST_SPAN_X.to - QUEST_SPAN_X.from;
  // The span occupies `span * w` px. The widest the painting may be drawn and
  // still fit all of it across the screen is therefore screenW / span.
  const maxW = screenW / span;
  if (base.w <= maxW) return base; // the span already fits — leave the room be.

  const w = maxW;
  const h = (texH / texW) * w;
  // Centre the REQUIRED SPAN, not the painting. The span sits left of the
  // painting's centre, so centring the painting would push the Friend back off
  // the right edge — the exact crop this function exists to prevent.
  const spanCentre = (QUEST_SPAN_X.from + QUEST_SPAN_X.to) / 2;
  const x = screenW / 2 - spanCentre * w;
  return { x, y: (screenH - h) / 2, w, h, mode: "portrait" };
}

/** Resolve an image-fraction anchor to a screen point. */
export function atImage(img: Rect, ax: number, ay: number): { x: number; y: number } {
  return { x: img.x + ax * img.w, y: img.y + ay * img.h };
}

// ── The diorama stage ───────────────────────────────────────────────

/** The miniature world's footprint on the table top, in screen px. */
export interface DioramaStage {
  /** Centre of the table's top surface. */
  cx: number;
  cy: number;
  /** Horizontal radius of the staging ellipse. */
  rx: number;
  /** Vertical radius of the table's own top ellipse (foreshortened). */
  ry: number;
  /**
   * Front-to-back spread of the CLEARING sitting on that ellipse. The table
   * top is a shallow ellipse; the modelled ground on it is a rounder plate, and
   * everything in the miniature world is positioned against this rather than
   * against `ry` — using `ry` put the whole cast on one line, which read as a
   * row of stickers instead of a world with depth.
   */
  depth: number;
  /** How tall the miniature world stands above the table, in px. */
  height: number;
}

/**
 * Stage the miniature world on the table top. Sized from the PAINTING, not the
 * viewport, so the diorama keeps its size relative to the table it stands on
 * at every framing — the same rule the room's decorations already follow.
 */
export function dioramaStage(img: Rect): DioramaStage {
  const rx = TABLE.halfW * img.w * 0.86;
  const ry = Math.max(6, TABLE.topRy * img.h * 0.9);
  return {
    cx: img.x + TABLE.cx * img.w,
    cy: img.y + TABLE.cy * img.h,
    rx,
    ry,
    depth: ry * 2.6,
    height: rx * 0.95,
  };
}

// ── Choice cards ────────────────────────────────────────────────────

export interface PlacedCard extends Rect {
  id: string;
}

/** Smallest comfortable child tap target — matches treehouseModel.MIN_TAP. */
export const MIN_CARD = 56;

/** Height of the "put it down" tab, and the margins around the bottom stack. */
export const TAB_H = 56;
const EDGE = 14;
const STACK_GAP = 12;

/**
 * Where the choices and the close tab go, given how the room is framed.
 *
 * Two cases, and the difference matters more than it sounds:
 *
 * "surround" — the framed room does not fill the viewport (phone portrait, and
 *   tablet), so there is a band of the blurred room-coloured surround beneath
 *   it. The cards go THERE. That band was dead space, and putting the cards in
 *   it means they cover none of the miniature world. On a phone the alternative
 *   is not "slightly overlapping" — it is the cards burying the diorama almost
 *   completely, including the child's own Friend, which defeats the point of
 *   the screen.
 *
 * "inset" — the room fills the viewport (desktop), so there is no band and the
 *   cards lie on the rug in the room's own perspective, clear of the table's
 *   front edge.
 */
export type CardPlacement = "surround" | "inset";

/** Vertical space a card row of height `ch` needs, with its tab below it. */
function stackHeight(ch: number): number {
  return ch + STACK_GAP + TAB_H + EDGE;
}

/**
 * Lay the illustrated choices out in front of the table, on the rug — nearer
 * the camera than the characters, so they overlap the cast's feet the way
 * objects in a foreground would.
 *
 * They are allowed to overhang the table's own width: a card narrow enough to
 * fit the table top is too small to be illustrated, and an illustration is
 * what carries meaning for a five-year-old with the sound off.
 *
 * Two hard constraints, in this order: the row and the tab below it must BOTH
 * fit on screen with their margins, and no card may drop below MIN_CARD. The
 * row sits at the rug line when there is room for it, and rides up off that
 * line when there isn't — on a short viewport the clamp is what runs, which is
 * why the rug line is a preference here and not the anchor.
 */
export function layoutChoiceCards(
  img: Rect,
  screenW: number,
  screenH: number,
  ids: readonly string[],
): PlacedCard[] {
  const n = ids.length;
  if (n === 0) return [];
  const gap = Math.max(10, img.w * 0.012);
  // A band a little wider than the table, centred on it, but never so wide it
  // reaches the characters standing either side.
  const bandW = Math.min(img.w * 0.44, screenW - EDGE * 2);
  const cw = Math.max(MIN_CARD, (bandW - gap * (n - 1)) / n);
  const ch = Math.max(MIN_CARD, Math.min(cw * 0.72, screenH * 0.145));
  const total = cw * n + gap * (n - 1);

  let left = img.x + TABLE.cx * img.w - total / 2;
  // Keep the whole row on screen even when the framing puts the table near an
  // edge (ultrawide, or a very short landscape phone).
  left = Math.max(EDGE, Math.min(left, screenW - total - EDGE));

  // The foot of the viewport, with the tab's band reserved below the row.
  const floor = screenH - EDGE - TAB_H - STACK_GAP - ch;
  const belowRoom = img.y + img.h + STACK_GAP;
  // Prefer the surround band under the framed room; fall back to the rug.
  const top = cardPlacement(img, screenH, ch) === "surround" ? belowRoom : floor;

  return ids.map((id, i) => ({ id, x: left + i * (cw + gap), y: top, w: cw, h: ch }));
}

/** Whether the choices fit in the surround band beneath the framed room. */
export function cardPlacement(img: Rect, screenH: number, ch: number): CardPlacement {
  const below = screenH - (img.y + img.h);
  return below >= stackHeight(ch) ? "surround" : "inset";
}

/**
 * Where the prompt / outcome panel's BOTTOM edge goes, for a panel `panelH`
 * tall. Same reasoning as the cards: use the surround band above the framed
 * room when there is one, so the words sit clear of the room instead of over
 * the tree trunk; otherwise float just above the miniature world, close enough
 * that they read as belonging to the table rather than to the screen.
 */
export function promptBottom(
  img: Rect,
  screenH: number,
  panelH: number,
  worldTopY: number,
): number {
  const above = img.y;
  if (above >= panelH + EDGE * 2) return img.y - EDGE;
  void screenH;
  return Math.max(panelH + EDGE, worldTopY - img.h * 0.02);
}

/** The "put it down" tab, in the band reserved below the choice row. */
export function closeTabRect(screenW: number, screenH: number, img: Rect): Rect {
  const w = Math.max(132, Math.min(200, img.w * 0.13));
  return {
    x: Math.max(EDGE, Math.min(img.x + TABLE.cx * img.w - w / 2, screenW - w - EDGE)),
    y: screenH - EDGE - TAB_H,
    w,
    h: TAB_H,
  };
}

// ── The EC-1 beat ───────────────────────────────────────────────────

/**
 * ONE hard-coded beat from "The Missing Spot", used to prove the interaction.
 *
 * This is NOT the quest engine. The real thing is a seven-beat graph with
 * per-age-band prompts, choices and outcomes loaded from
 * content/quests/the-missing-spot.json, plus rewind and patches. None of that
 * is here. What this beat does carry is the shape the engine will keep: a
 * prompt, illustrated choices, and an outcome that visibly changes the
 * miniature scene and hands the child information rather than a verdict.
 *
 * Both choices are good choices. Neither resolves the moment, for the same
 * reason — the group is mid-round — and each teaches something different.
 * That is the mechanic the full quest is built on, in miniature.
 */
export type ChoiceId = "walk-over" | "wave";

export interface QuestChoice {
  id: ChoiceId;
  label: string;
  /** What the child is left knowing. Shown after the choice, as an
   *  observation — never as a score or a correction. */
  observed: string;
  olive: string;
}

export const EC1_PROMPT = "They're already playing. How do you get closer?";

export const EC1_CHOICES: readonly QuestChoice[] = [
  {
    id: "walk-over",
    label: "Walk over",
    observed: "You're close enough to see how the game works.",
    olive: "They're right in the middle of their game. That happens.",
  },
  {
    id: "wave",
    label: "Wave hello",
    observed: "Pip looked up. Pip knows you're there now.",
    olive: "They didn't say no. They didn't say yes either.",
  },
] as const;

// ── The miniature scene ─────────────────────────────────────────────

export type FriendPose = "edge" | "approaching" | "waving";
export type GroupAttention = "playing" | "one-noticing";

export interface DioramaScene {
  /** Where the child's Friend is standing in the miniature world. */
  friend: FriendPose;
  /** What the group is doing. */
  group: GroupAttention;
  /** Stones in the stack — the round visibly in progress. */
  stones: number;
  /** The choice that produced this scene, or null at the opening. */
  from: ChoiceId | null;
}

/** The opening tableau: the Friend at the edge, the round underway. */
export function openingScene(): DioramaScene {
  return { friend: "edge", group: "playing", stones: 2, from: null };
}

/**
 * Apply a choice to the miniature world.
 *
 * The scene change is the point: whichever card a child taps, the world on the
 * table must visibly move. Walking over moves the Friend across the clearing
 * and the round carries on past them; waving turns one of the group toward
 * them. Neither adds them to the game — that is beat three's job, and its
 * absence here is what makes the moment honest.
 */
export function applyChoice(scene: DioramaScene, id: ChoiceId): DioramaScene {
  if (id === "walk-over") {
    return { ...scene, friend: "approaching", group: "playing", stones: scene.stones + 1, from: id };
  }
  return { ...scene, friend: "waving", group: "one-noticing", from: id };
}

/** Look up a choice by id. */
export function choiceById(id: ChoiceId): QuestChoice {
  return EC1_CHOICES.find((c) => c.id === id) ?? EC1_CHOICES[0];
}

/** Point-in-rect, matching treehouseModel.hitRect's top-left convention. */
export function hitCard(c: Rect, sx: number, sy: number): boolean {
  return sx >= c.x && sx <= c.x + c.w && sy >= c.y && sy <= c.y + c.h;
}

export { coverRect };
