// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Quest Table — EC-1 contract.
 *
 * Pins the product decision that the Quest Table is a PHYSICAL OBJECT IN THE
 * ROOM, not another screen:
 *   - the room stays visible and un-scrimmed behind it;
 *   - the diorama is staged on the painted table, in image space;
 *   - Olive and the child's Friend stand on the room's floor, and both are on
 *     screen at phone, tablet and desktop framings;
 *   - the illustrated choices are child-sized and stay on screen;
 *   - a choice visibly changes the miniature world.
 *
 * The three existing activities (Decorate / Leaf Puzzle / Story Nook) are
 * treehouseRoom.test.ts's business and are untouched here.
 */

// ── minimal Pixi mock (jsdom has no WebGL) ──────────────────────────
vi.mock("pixi.js", () => {
  class Pt {
    x = 0;
    y = 0;
    set(x: number, y?: number) { this.x = x; this.y = y ?? x; }
  }
  class Node {
    children: Node[] = [];
    position = new Pt();
    scale = (() => { const p = new Pt(); p.set(1, 1); return p; })();
    anchor = new Pt();
    visible = true;
    alpha = 1;
    width = 0;
    height = 0;
    filters: unknown[] = [];
    tint = 0xffffff;
    style: Record<string, unknown> = {};
    text = "";
    constructor(arg?: unknown) {
      if (arg && typeof arg === "object" && "text" in (arg as object)) {
        const a = arg as { text?: unknown; style?: Record<string, unknown> };
        this.text = String(a.text ?? "");
        this.style = a.style ?? {};
      }
    }
    addChild(...cs: Node[]) { this.children.push(...cs); return cs[0]; }
    removeChildren() { const c = this.children; this.children = []; return c; }
    destroy() {}
    rect() { return this; }
    roundRect() { return this; }
    circle() { return this; }
    ellipse() { return this; }
    poly() { return this; }
    arc() { return this; }
    moveTo() { return this; }
    lineTo() { return this; }
    bezierCurveTo() { return this; }
    quadraticCurveTo() { return this; }
    fill() { return this; }
    stroke() { return this; }
    clear() { return this; }
  }
  class BlurFilter {}
  return { Container: Node, Graphics: Node, Sprite: Node, Text: Node, Texture: Node, BlurFilter };
});

const {
  EC1_CHOICES,
  FRIEND_ANCHOR,
  MIN_CARD,
  OLIVE_ANCHOR,
  QUEST_SPAN_X,
  TABLE,
  applyChoice,
  atImage,
  dioramaStage,
  layoutChoiceCards,
  openingScene,
  questRoomFit,
} = await import("../quest/questTableModel");
const { TreehouseRoom } = await import("../render/TreehouseRoom");

// The room and table keep private state; tests reach in deliberately.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Room = any;

/** The shipped painting, treehouse-hideaway.webp. */
const ART_W = 2000;
const ART_H = 1125;

/** The three framings EC-1 is reviewed at. */
const PHONE = { w: 390, h: 844 };
const TABLET = { w: 768, h: 1024 };
const DESKTOP = { w: 1440, h: 900 };
const VIEWPORTS = [
  ["phone portrait", PHONE],
  ["tablet portrait", TABLET],
  ["desktop", DESKTOP],
] as const;

/** A room with the painting in place, entered at `size`. */
function entered(size = DESKTOP, reducedMotion = false): Room {
  const room = new (TreehouseRoom as never as new (o: unknown) => unknown)({
    reducedMotion,
  }) as Room;
  room.setBackground({ width: ART_W, height: ART_H });
  room.enter("treehouse_hideaway", {} as never, null, size.w, size.h);
  return room;
}

/** Enter, then pick the table up. */
function opened(size = DESKTOP, reducedMotion = false): Room {
  const room = entered(size, reducedMotion);
  const r = room.tableRect;
  room.handleTap(r.x + r.w / 2, r.y + r.h / 2);
  return room;
}

beforeEach(() => {
  window.localStorage.clear();
});

// ── The table is a thing in the room ────────────────────────────────

describe("the Quest Table is an object in the room", () => {
  it("is opened by tapping the painted table, not a button", () => {
    const room = entered();
    expect(room.questTableOpen).toBe(false);
    // The tap target sits on the table's painted top surface.
    const cx = room.img.x + TABLE.cx * room.img.w;
    const cy = room.img.y + TABLE.cy * room.img.h;
    expect(room.handleTap(cx, cy)).toBe("activity");
    expect(room.questTableOpen).toBe(true);
  });

  it.each(VIEWPORTS)("keeps the table tap target child-sized at %s", (_label, size) => {
    const room = entered(size);
    expect(room.tableRect.w).toBeGreaterThanOrEqual(56);
    expect(room.tableRect.h).toBeGreaterThanOrEqual(56);
  });

  /**
   * THE LOAD-BEARING ASSERTION. The brief's failure mode is "I opened another
   * screen". A scrim over the room is how that happens, and `panelLayer` is
   * the thing in this file that draws one — so the Quest Table must never
   * bring it up.
   */
  it.each(VIEWPORTS)("never dims or replaces the room at %s", (_label, size) => {
    const room = opened(size);
    expect(room.questTableOpen).toBe(true);
    expect(room.bgLayer.visible).toBe(true);
    expect(room.bgLayer.children.length).toBeGreaterThan(0);
    // The scrimmed activity card belongs to the other three activities.
    expect(room.panelLayer.visible).toBe(false);
    expect(room.open).toBe(null);
  });

  it("puts the other three activities away while the table is in use", () => {
    const room = opened();
    expect(room.spots).toEqual([]);
    const reopened = entered();
    expect(reopened.spots.length).toBe(3);
  });

  it("leaves Back to Island reachable with the table open", () => {
    const room = opened();
    const b = room.backRect;
    expect(room.handleTap(b.x + b.w / 2, b.y + b.h / 2)).toBe("exit");
  });

  it("does not put the table down when a tap lands on nothing", () => {
    const room = opened();
    // A finger resting on the room's ceiling, far from every affordance.
    expect(room.handleTap(room.w * 0.5, 4)).toBe("move");
    expect(room.questTableOpen).toBe(true);
  });

  it("puts the table down from its own affordance, and restores the room", () => {
    const room = opened();
    const c = room.quest.closeRect;
    room.handleTap(c.x + c.w / 2, c.y + c.h / 2);
    expect(room.questTableOpen).toBe(false);
    expect(room.spots.length).toBe(3);
  });
});

// ── Framing: everyone stays on screen ───────────────────────────────

describe("framing keeps Olive, the table and the Friend on screen", () => {
  it.each(VIEWPORTS)("shows the whole quest span at %s", (_label, size) => {
    const room = opened(size);
    const { img } = room;
    const left = img.x + QUEST_SPAN_X.from * img.w;
    const right = img.x + QUEST_SPAN_X.to * img.w;
    expect(left).toBeGreaterThanOrEqual(-1);
    expect(right).toBeLessThanOrEqual(size.w + 1);
  });

  it.each(VIEWPORTS)("puts both characters inside the viewport at %s", (_label, size) => {
    const room = opened(size);
    for (const a of [OLIVE_ANCHOR, FRIEND_ANCHOR]) {
      const p = atImage(room.img, a.ax, a.ay);
      expect(p.x).toBeGreaterThan(0);
      expect(p.x).toBeLessThan(size.w);
      expect(p.y).toBeGreaterThan(0);
      expect(p.y).toBeLessThan(size.h);
    }
  });

  /**
   * The regression this guards: plain cover-fit at phone portrait shows only
   * the middle ~26% of the painting's width. The table survives that crop and
   * both characters do not — so the composition would fail silently on the
   * device most likely to be used.
   */
  it("pulls the framing back on a phone rather than cropping the cast", () => {
    const closed = entered(PHONE);
    const open = opened(PHONE);
    // Pulling back means drawing the painting SMALLER, so more of it fits
    // across the screen — cover-fit blows it up to 1500px wide on a 390px
    // phone and keeps only the middle quarter.
    expect(open.img.w).toBeLessThan(closed.img.w * 0.7);
    expect(open.img.w * (QUEST_SPAN_X.to - QUEST_SPAN_X.from)).toBeLessThanOrEqual(PHONE.w + 0.5);
    // Desktop already fits, so it must not move at all.
    expect(opened(DESKTOP).img.w).toBeCloseTo(entered(DESKTOP).img.w, 5);
  });

  it("returns the room's own framing once the table is put down", () => {
    const room = opened(PHONE);
    const openW = room.img.w;
    const c = room.quest.closeRect;
    room.handleTap(c.x + c.w / 2, c.y + c.h / 2);
    expect(room.img.w).toBeGreaterThan(openW);
    expect(room.img.w).toBeCloseTo(entered(PHONE).img.w, 5);
  });

  it("leaves a non-cropping framing alone", () => {
    const base = questRoomFit(ART_W, ART_H, DESKTOP.w, DESKTOP.h);
    expect(base.w).toBeGreaterThanOrEqual(DESKTOP.w);
  });

  it("survives a texture that never decoded", () => {
    const fit = questRoomFit(0, 0, PHONE.w, PHONE.h);
    expect(Number.isFinite(fit.w)).toBe(true);
    expect(Number.isFinite(fit.h)).toBe(true);
  });
});

// ── The diorama sits on the table ───────────────────────────────────

describe("the diorama is staged on the painted table", () => {
  it.each(VIEWPORTS)("centres the stage on the table top at %s", (_label, size) => {
    const room = opened(size);
    const st = dioramaStage(room.img);
    expect(st.cx).toBeCloseTo(room.img.x + TABLE.cx * room.img.w, 5);
    expect(st.cy).toBeCloseTo(room.img.y + TABLE.cy * room.img.h, 5);
  });

  it("scales the miniature world off the painting, not the viewport", () => {
    // Same painting width → same diorama, whatever the screen is doing.
    const a = dioramaStage({ x: 0, y: 0, w: 1000, h: 562 });
    const b = dioramaStage({ x: 400, y: 90, w: 1000, h: 562 });
    expect(a.rx).toBeCloseTo(b.rx, 6);
    expect(a.height).toBeCloseTo(b.height, 6);
    // A bigger painting → a bigger table → a bigger world on it.
    expect(dioramaStage({ x: 0, y: 0, w: 2000, h: 1125 }).rx).toBeGreaterThan(a.rx);
  });

  it("never stages a zero-height world", () => {
    const st = dioramaStage({ x: 0, y: 0, w: 320, h: 180 });
    expect(st.rx).toBeGreaterThan(0);
    expect(st.ry).toBeGreaterThan(0);
    expect(st.height).toBeGreaterThan(0);
  });
});

// ── Choices ─────────────────────────────────────────────────────────

describe("the illustrated choices", () => {
  it.each(VIEWPORTS)("are child-sized and fully on screen at %s", (_label, size) => {
    const room = opened(size);
    const cards = room.quest.cards;
    expect(cards.length).toBe(EC1_CHOICES.length);
    for (const c of cards) {
      expect(c.w).toBeGreaterThanOrEqual(MIN_CARD);
      expect(c.h).toBeGreaterThanOrEqual(MIN_CARD);
      expect(c.x).toBeGreaterThanOrEqual(0);
      expect(c.y).toBeGreaterThanOrEqual(0);
      expect(c.x + c.w).toBeLessThanOrEqual(size.w);
      expect(c.y + c.h).toBeLessThanOrEqual(size.h);
    }
  });

  it.each(VIEWPORTS)("never overlap each other at %s", (_label, size) => {
    const cards = opened(size).quest.cards;
    for (let i = 0; i < cards.length; i++) {
      for (let j = i + 1; j < cards.length; j++) {
        const a = cards[i];
        const b = cards[j];
        const apart = a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y;
        expect(apart, `cards ${a.id} / ${b.id} overlap`).toBe(true);
      }
    }
  });

  it("stays on screen even when the framing is extreme", () => {
    // An ultrawide strip, where the painting runs well past both edges.
    const img = { x: -900, y: -40, w: 3000, h: 1687 };
    const cards = layoutChoiceCards(img, 900, 320, ["a", "b", "c"]);
    for (const c of cards) {
      expect(c.x).toBeGreaterThanOrEqual(0);
      expect(c.x + c.w).toBeLessThanOrEqual(900);
      expect(c.y + c.h).toBeLessThanOrEqual(320);
    }
  });

  it("handles a beat with no choices", () => {
    expect(layoutChoiceCards({ x: 0, y: 0, w: 800, h: 450 }, 800, 600, [])).toEqual([]);
  });
});

// ── A choice changes the world ──────────────────────────────────────

describe("a choice visibly changes the miniature world", () => {
  it("moves the Friend across the clearing when they walk over", () => {
    const before = openingScene();
    const after = applyChoice(before, "walk-over");
    expect(before.friend).toBe("edge");
    expect(after.friend).toBe("approaching");
    // The round carries on without them — the whole point of the beat.
    expect(after.stones).toBe(before.stones + 1);
    expect(after.group).toBe("playing");
  });

  it("turns one of the group toward the Friend when they wave", () => {
    const after = applyChoice(openingScene(), "wave");
    expect(after.friend).toBe("waving");
    expect(after.group).toBe("one-noticing");
  });

  it("produces a different world for each choice", () => {
    const a = applyChoice(openingScene(), "walk-over");
    const b = applyChoice(openingScene(), "wave");
    expect(a).not.toEqual(b);
    expect(a.friend).not.toBe(b.friend);
  });

  /**
   * The mechanic the whole quest is built on: the first attempt is imperfect
   * because of something the child could not have known (the group is
   * mid-round), NOT because their choice was wrong. So no choice resolves the
   * moment, and every choice hands back something the child now knows.
   */
  it("resolves the moment for neither choice, and rewards both", () => {
    for (const choice of EC1_CHOICES) {
      const after = applyChoice(openingScene(), choice.id);
      expect(after.group, `${choice.id} must not let the child in yet`).not.toBe("joined");
      expect(choice.observed.length).toBeGreaterThan(0);
      expect(choice.olive.length).toBeGreaterThan(0);
    }
    // No scoring vocabulary anywhere in the beat.
    const words = EC1_CHOICES.flatMap((c) => [c.label, c.observed, c.olive]).join(" ").toLowerCase();
    for (const banned of ["wrong", "correct", "try again", "oops", "point", "score"]) {
      expect(words, `"${banned}" has no place in this beat`).not.toContain(banned);
    }
  });

  it("records the choice and spends the cards", () => {
    const room = opened();
    const card = room.quest.cards[0];
    expect(room.handleTap(card.x + card.w / 2, card.y + card.h / 2)).toBe("activity");
    expect(room.quest.choice).toBe(card.id);
    expect(room.quest.cards).toEqual([]);
    // The room is still the room.
    expect(room.questTableOpen).toBe(true);
    expect(room.panelLayer.visible).toBe(false);
  });

  it("is reachable under reduced motion, with the world already risen", () => {
    const room = opened(PHONE, true);
    expect(room.quest.rise).toBe(1);
    const card = room.quest.cards[0];
    room.handleTap(card.x + card.w / 2, card.y + card.h / 2);
    expect(room.quest.choice).toBe(card.id);
    expect(room.quest.rise).toBe(1);
  });

  it("opens fresh the next time the child comes back", () => {
    const room = opened();
    const card = room.quest.cards[0];
    room.handleTap(card.x + card.w / 2, card.y + card.h / 2);
    const c = room.quest.closeRect;
    room.handleTap(c.x + c.w / 2, c.y + c.h / 2);
    const r = room.tableRect;
    room.handleTap(r.x + r.w / 2, r.y + r.h / 2);
    expect(room.quest.choice).toBe(null);
    expect(room.quest.cards.length).toBe(EC1_CHOICES.length);
  });
});
