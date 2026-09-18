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
 * Where Olive stands, as image fractions of her FEET.
 *
 * Just left of the painted table, on open floorboards, turned toward it —
 * close enough that a phone framing can hold her and the table together.
 *
 * THE CHILD'S FRIEND IS NOT HERE. An earlier pass stood a room-scale Friend on
 * the floor opposite Olive, which put the same character on screen twice and
 * made the one that matters — the Friend IN the story, on the table — the
 * smaller and less prominent of the two. The Friend now appears only in the
 * miniature world. That is the character the child is playing.
 */
export const OLIVE_ANCHOR = { ax: 0.34, ay: 0.87 } as const;

/**
 * The band of the painting that MUST be on screen while the table is open:
 * Olive and the whole table, with a little room either side.
 *
 * This is the number that decides how big the table is on a phone, so it is
 * kept as TIGHT as the composition allows. An earlier pass used 0.27-0.79 —
 * wide enough to also hold a second, room-scale Friend on the right — and the
 * cost was a small room floating between two large blurred bands, with a table
 * only ~200px wide and a miniature Friend ~45px tall. Dropping the duplicate
 * Friend let the span shrink to Olive-plus-table, which is what buys the table
 * its size back.
 */
export const QUEST_SPAN_X = { from: 0.285, to: 0.7 } as const;

/** Olive's height, as a fraction of the painting's height. Deliberately modest:
 *  she is a guide standing in her own room, not a looming adult, and the table
 *  is the subject. */
export const OLIVE_H = 0.3;

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
  if (!(texW > 0) || !(texH > 0) || !(screenW > 0) || !(screenH > 0)) return base;

  const span = QUEST_SPAN_X.to - QUEST_SPAN_X.from;
  // Two competing pulls, resolved in one line:
  //
  //   as BIG as the screen's height allows   -> screenH * (texW / texH)
  //   never so big the span gets cropped     -> screenW / span
  //
  // The smaller wins. On a phone the span binds (the screen is far taller than
  // the painting's aspect), so the room pulls back and leaves a surround band.
  // On a tablet the HEIGHT binds — and this is the case an earlier pass got
  // wrong by only ever capping: `roomFit` gave the tablet a letterboxed strip
  // using ~42% of the screen, with a table barely 200px wide, while 58% of the
  // screen sat as blurred surround. On desktop both are generous and this
  // lands on the room's own cover fit, unchanged.
  const w = Math.min(screenW / span, screenH * (texW / texH));
  const h = (texH / texW) * w;
  // Centre the REQUIRED SPAN, not the painting. The span sits left of the
  // painting's centre, so centring the painting would push the table's far
  // edge off to the right — the exact crop this function exists to prevent.
  const spanCentre = (QUEST_SPAN_X.from + QUEST_SPAN_X.to) / 2;
  return {
    x: screenW / 2 - spanCentre * w,
    y: (screenH - h) / 2,
    w,
    h,
    mode: h >= screenH - 0.5 ? "cover" : "portrait",
  };
}

/** Resolve an image-fraction anchor to a screen point. */
export function atImage(img: Rect, ax: number, ay: number): { x: number; y: number } {
  return { x: img.x + ax * img.w, y: img.y + ay * img.h };
}

// ── The diorama stage ───────────────────────────────────────────────

/** The painted table's top surface on screen, in px. The Quest Table's own
 *  furniture (the diorama, the tray) is measured from this, so everything
 *  stays in proportion to the table at every framing. */
export function tableTop(img: Rect): { cx: number; cy: number; halfW: number; ry: number } {
  return {
    cx: img.x + TABLE.cx * img.w,
    cy: img.y + TABLE.cy * img.h,
    halfW: TABLE.halfW * img.w,
    ry: Math.max(6, TABLE.topRy * img.h * 0.9),
  };
}

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
  const t = tableTop(img);
  const rx = t.halfW * 0.86;
  return { cx: t.cx, cy: t.cy, rx, ry: t.ry, depth: t.ry * 2.6, height: rx * 0.95 };
}

// ── Choice cards ────────────────────────────────────────────────────

export interface PlacedCard extends Rect {
  id: string;
}

/** Smallest comfortable child tap target — matches treehouseModel.MIN_TAP. */
export const MIN_CARD = 56;

/** Height of the "put it down" tab, and the margin around the screen edge. */
export const TAB_H = 56;
const EDGE = 14;

/**
 * The wooden tray that hangs off the table's near rim and holds the choices.
 *
 * The choices used to be laid on the rug in front of the table (desktop) or in
 * the blurred surround band below the framed room (phone / tablet). Neither
 * read as part of the table: the rug version covered the table's front edge and
 * the characters' feet, and the surround version read as a bottom sheet that
 * happened to be under a window.
 *
 * A tray fixes both by being a piece of the furniture. It is measured from the
 * TABLE — not the viewport — so it scales with it, it hangs from the near rim
 * so it never covers the table top or the miniature world, and it is drawn in
 * the same layer as the diorama so it moves with the object rather than with
 * the screen.
 */
export interface Tray extends Rect {
  /** Inner area the cards actually sit in. */
  pad: number;
}

/** Tray width as a multiple of the painted table's width. A little wider than
 *  the table, so two illustrated cards fit without shrinking to thumbnails. */
const TRAY_SPAN = 1.35;

export function trayRect(img: Rect, screenW: number, screenH: number): Tray {
  const t = tableTop(img);
  const pad = Math.max(8, t.halfW * 0.06);
  // The tray stays CENTRED ON THE TABLE — that is what makes it read as part
  // of the furniture rather than a bar near it — so its width is capped by
  // whichever side has less room. The open framing centres the required span,
  // not the table, so on a phone the table sits right of screen centre and an
  // uncapped tray would run off the right edge.
  const room = Math.min(t.cx - EDGE, screenW - EDGE - t.cx) * 2;
  const w = Math.min(t.halfW * 2 * TRAY_SPAN, screenW - EDGE * 2, Math.max(MIN_CARD * 2, room));
  // Hang it off the near rim: just below the table top's front edge.
  const y = t.cy + t.ry * 1.1;
  // Cards are sized from the tray, then the tray is closed around them — but
  // never so tall that it runs into the "put it down" tab at the screen foot.
  const maxH = Math.max(MIN_CARD + pad * 2, screenH - TAB_H - EDGE * 2 - y);
  const inner = w - pad * 2;
  const cw = (inner - CARD_GAP) / 2;
  const h = Math.min(Math.max(MIN_CARD + pad * 2, cw * 0.72 + pad * 2), maxH);
  return { x: t.cx - w / 2, y, w, h, pad };
}

const CARD_GAP = 10;

/**
 * Lay the illustrated choices out ON the tray.
 *
 * Every card is inside the tray's inner area, so a child sees two objects
 * sitting on a piece of the table rather than two buttons near it. Cards never
 * drop below MIN_CARD; if the tray cannot hold `n` of them at that size the row
 * is still returned at MIN_CARD and the tray simply overflows, because a tap
 * target that is too small is a worse failure than a tray that looks tight.
 */
export function layoutChoiceCards(
  img: Rect,
  screenW: number,
  screenH: number,
  ids: readonly string[],
): PlacedCard[] {
  const n = ids.length;
  if (n === 0) return [];
  const tray = trayRect(img, screenW, screenH);
  const inner = tray.w - tray.pad * 2;
  const cw = Math.max(MIN_CARD, (inner - CARD_GAP * (n - 1)) / n);
  const ch = Math.max(MIN_CARD, tray.h - tray.pad * 2);
  const total = cw * n + CARD_GAP * (n - 1);
  const left = tray.x + (tray.w - total) / 2;
  return ids.map((id, i) => ({
    id,
    x: left + i * (cw + CARD_GAP),
    y: tray.y + (tray.h - ch) / 2,
    w: cw,
    h: ch,
  }));
}

/** The "put it down" tab, at the foot of the screen, clear of the tray. */
export function closeTabRect(screenW: number, screenH: number, img: Rect): Rect {
  const t = tableTop(img);
  const w = Math.max(132, Math.min(200, t.halfW * 0.9));
  return {
    x: Math.max(EDGE, Math.min(t.cx - w / 2, screenW - w - EDGE)),
    y: screenH - EDGE - TAB_H,
    w,
    h: TAB_H,
  };
}

/**
 * Where the prompt / outcome panel's BOTTOM edge goes, for a panel `panelH`
 * tall: in the surround band above the framed room when there is one, so the
 * words sit clear of the room instead of over the tree trunk; otherwise just
 * above the miniature world, close enough to read as belonging to the table.
 */
export function promptBottom(
  img: Rect,
  screenH: number,
  panelH: number,
  worldTopY: number,
): number {
  void screenH;
  // The surround band above the room is only usable if the panel ALSO clears
  // the room's own chrome — "Back to Island" top-left and the host's Exit
  // top-right both live up there, and on a phone the band is just deep enough
  // to tempt the panel into them.
  if (img.y >= panelH + EDGE + TOP_CHROME) return img.y - EDGE;
  return Math.max(panelH + EDGE + TOP_CHROME, worldTopY - img.h * 0.02);
}

/** Vertical strip at the top of the screen owned by the room's own controls. */
const TOP_CHROME = 88;

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

/**
 * Olive's pose for a state of the beat. Discrete gestures, chosen by what she
 * is doing — never tweened.
 *   choosing → "listening": the question is open and she is waiting on the
 *              child, head tilted, beak closed.
 *   chosen   → "encouraging": she has something to say about what happened.
 */
export type OlivePoseKey = "neutral" | "encouraging" | "listening";
export function olivePoseFor(chosen: ChoiceId | null): OlivePoseKey {
  return chosen ? "encouraging" : "listening";
}

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
    observed: "One of them looks up. Now someone knows you're there.",
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
