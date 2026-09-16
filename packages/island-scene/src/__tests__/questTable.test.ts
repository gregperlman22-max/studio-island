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
  EC1_PROMPT,
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
  trayRect,
} = await import("../quest/questTableModel");
const { HOTSPOTS } = await import("../render/treehouseModel");
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

  it.each(VIEWPORTS)("puts Olive inside the viewport, beside the table, at %s", (_label, size) => {
    const room = opened(size);
    const p = atImage(room.img, OLIVE_ANCHOR.ax, OLIVE_ANCHOR.ay);
    expect(p.x).toBeGreaterThan(0);
    expect(p.x).toBeLessThan(size.w);
    expect(p.y).toBeGreaterThan(0);
    expect(p.y).toBeLessThan(size.h);
    // Beside the table, not on it.
    expect(OLIVE_ANCHOR.ax).toBeLessThan(TABLE.cx - TABLE.halfW);
  });

  /**
   * The phone composition is the one EC-1 was sent back over: a small framed
   * room between large blurred bands, a ~200px table and a ~45px Friend. These
   * numbers are the floor that failure established.
   */
  it.each(VIEWPORTS)("gives %s a substantial table and a readable Friend", (_label, size) => {
    const room = opened(size);
    const tableW = TABLE.halfW * 2 * room.img.w;
    expect(tableW, "painted table width").toBeGreaterThan(240);
    const st = dioramaStage(room.img);
    // The miniature Friend is drawn at stage.height * 0.62 (QuestTable).
    expect(st.height * 0.62, "miniature Friend height").toBeGreaterThan(60);
    // The room has to be recognisable around it, not a letterbox sliver.
    expect(room.img.h / size.h, "share of screen height the room uses").toBeGreaterThan(0.55);
  });

  /**
   * The tablet regression: `roomFit` gives 768x1024 a strip using ~42% of the
   * screen height, with the rest as blurred surround. That was fine for the
   * closed room and much too small once the table is the subject.
   */
  it("uses the tablet's height instead of letterboxing the table", () => {
    const closed = entered(TABLET);
    const open = opened(TABLET);
    expect(open.img.h).toBeGreaterThan(closed.img.h * 1.8);
    expect(open.img.h).toBeGreaterThanOrEqual(TABLET.h - 1);
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
  it.each(VIEWPORTS)("sit on the table's tray at %s", (_label, size) => {
    const room = opened(size);
    const tray = trayRect(room.img, size.w, size.h);
    const t = { cx: room.img.x + TABLE.cx * room.img.w, cy: room.img.y + TABLE.cy * room.img.h };
    // The tray hangs off the table's near rim: centred on it, and starting
    // below the table top rather than over it.
    expect(tray.x + tray.w / 2).toBeCloseTo(t.cx, 4);
    expect(tray.y).toBeGreaterThan(t.cy);
    for (const c of room.quest.cards) {
      expect(c.x, `${c.id} left of tray`).toBeGreaterThanOrEqual(tray.x - 0.5);
      expect(c.x + c.w, `${c.id} right of tray`).toBeLessThanOrEqual(tray.x + tray.w + 0.5);
      expect(c.y, `${c.id} above tray`).toBeGreaterThanOrEqual(tray.y - 0.5);
      expect(c.y + c.h, `${c.id} below tray`).toBeLessThanOrEqual(tray.y + tray.h + 0.5);
    }
  });

  it.each(VIEWPORTS)("never cover the table top or the miniature world at %s", (_label, size) => {
    const room = opened(size);
    const st = dioramaStage(room.img);
    for (const c of room.quest.cards) {
      // Everything on the table — the ground plate and the world standing on
      // it — is above the tray line.
      expect(c.y, `${c.id} covers the table top`).toBeGreaterThan(st.cy + st.ry * 0.9);
    }
  });

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

  it("keeps child-sized targets even when the framing is extreme", () => {
    // A short ultrawide strip, where the tray has very little height to give.
    const cards = layoutChoiceCards({ x: -900, y: -40, w: 3000, h: 1687 }, 900, 320, ["a", "b", "c"]);
    expect(cards.length).toBe(3);
    for (const c of cards) {
      expect(c.w).toBeGreaterThanOrEqual(MIN_CARD);
      expect(c.h).toBeGreaterThanOrEqual(MIN_CARD);
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

  /**
   * "Walk over" must STOP SHORT. Landing among the group reads as "I joined
   * in" — which is not what happened — and physically covers both the nearest
   * player and the stone stack that shows the round carrying on.
   */
  it("stops the Friend short of the group, clear of them and of the stones", () => {
    const room = opened(DESKTOP);
    const card = room.quest.cards.find((c: { id: string }) => c.id === "walk-over");
    room.handleTap(card.x + card.w / 2, card.y + card.h / 2);
    const st = dioramaStage(room.img);
    const world = room.quest.lastWorld;
    expect(world.friend.x).toBeLessThan(st.rx * 0.92); // moved in from the edge
    for (const g of world.group) {
      const gap = Math.abs(world.friend.x - g.x);
      const half = (world.friend.w + g.w) / 2;
      expect(gap, `overlaps a group member at dx ${g.x.toFixed(0)}`).toBeGreaterThan(half);
    }
    const stackGap = Math.abs(world.friend.x - world.stack.x);
    expect(stackGap, "obscures the stone stack").toBeGreaterThan(world.friend.w / 2 + world.stack.w / 2);
  });

  /**
   * A near-symmetric front-facing sprite, mirrored, is not evidence of
   * attention. The response has to be a movement plus a mark.
   */
  it("makes the responding animal visibly change when the child waves", () => {
    const calm = opened(DESKTOP);
    const calmWorld = calm.quest.lastWorld;
    const room = opened(DESKTOP);
    const card = room.quest.cards.find((c: { id: string }) => c.id === "wave");
    room.handleTap(card.x + card.w / 2, card.y + card.h / 2);
    const world = room.quest.lastWorld;
    const before = calmWorld.group[calmWorld.noticer];
    const after = world.group[world.noticer];
    expect(world.noticer).toBeGreaterThanOrEqual(0);
    // Steps out toward the Friend, and stands taller — both, not just a flip.
    expect(after.x).toBeGreaterThan(before.x);
    expect(after.w).toBeGreaterThan(before.w);
    expect(world.noticeMark, "no notice mark drawn").toBe(true);
    expect(calmWorld.noticeMark).toBe(false);
  });

  it("names nobody in the beat's copy", () => {
    const words = [EC1_PROMPT, ...EC1_CHOICES.flatMap((c) => [c.label, c.observed, c.olive])]
      .join(" ");
    // No supporting character has been approved; temporary copy must not
    // invent one.
    expect(words).not.toMatch(/\bPip\b/);
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

// ── Discoverability + tap routing ───────────────────────────────────

/**
 * The EC-1 defect this suite exists to prevent recurring: the Quest Table's
 * invitation marker sat at the painted table's centre, and the "Leaf Puzzle"
 * pill was anchored to the same spot. On desktop the pill covered the marker;
 * on a phone, where the pills stack, the marker was invisible.
 *
 * Two things had to be true and were not: the pills must not be laid on top of
 * the table's tap target, AND a tap that lands on a visible pill must open that
 * pill's activity even if the table's (larger, invisible) rect also contains it.
 * These tests check the ACTUAL overlapping areas, not just target sizes.
 */
describe("the closed room's controls do not fight each other", () => {
  const rects = (room: Room) => ({
    table: room.tableRect,
    pills: room.spots.map((s: { id: string; x: number; y: number; w: number; h: number }) => ({
      id: s.id,
      x: s.x - s.w / 2,
      y: s.y - s.h / 2,
      w: s.w,
      h: s.h,
    })),
  });
  const overlap = (a: { x: number; y: number; w: number; h: number }, b: typeof a) =>
    a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

  it.each(VIEWPORTS)("keeps all three pills clear of the table at %s", (_label, size) => {
    const { table, pills } = rects(entered(size));
    expect(pills.length).toBe(3);
    for (const p of pills) {
      expect(overlap(p, table), `${p.id} covers the Quest Table`).toBe(false);
    }
  });

  it.each(VIEWPORTS)("opens each control's OWN activity at %s", (_label, size) => {
    // Every visible pill, tapped at its centre, opens its own panel.
    for (const id of ["decorate", "puzzle", "story"]) {
      const room = entered(size);
      const spot = room.spots.find((s: { id: string }) => s.id === id);
      expect(spot, `${id} is placed at ${size.w}x${size.h}`).toBeTruthy();
      expect(room.handleTap(spot.x, spot.y)).toBe("activity");
      expect(room.open, `tapping ${id} opened the wrong thing`).toBe(id);
      expect(room.questTableOpen, `tapping ${id} opened the Quest Table`).toBe(false);
    }
    // And the table still opens from its own marker.
    const room = entered(size);
    expect(room.handleTap(room.tableRect.x + room.tableRect.w / 2, room.tableRect.y + room.tableRect.h / 2))
      .toBe("activity");
    expect(room.questTableOpen).toBe(true);
    expect(room.open).toBe(null);
  });

  it.each(VIEWPORTS)("gives a pill drawn over the table priority at %s", (_label, size) => {
    // Belt-and-braces: even if a future layout change puts a pill back on the
    // table, the VISIBLE control must still win the tap.
    const room = entered(size);
    const spot = room.spots[0];
    room.tableRect = { x: 0, y: 0, w: size.w, h: size.h }; // table swallows the screen
    expect(room.handleTap(spot.x, spot.y)).toBe("activity");
    expect(room.open).toBe(spot.id);
    expect(room.questTableOpen).toBe(false);
  });

  it("no longer anchors an activity to the painted table", () => {
    const puzzle = HOTSPOTS.find((h: { id: string }) => h.id === "puzzle");
    expect(puzzle).toBeTruthy();
    if (!puzzle) return;
    const onTable =
      puzzle.ax > TABLE.cx - TABLE.halfW && puzzle.ax < TABLE.cx + TABLE.halfW &&
      puzzle.ay > TABLE.cy - 0.09 && puzzle.ay < TABLE.cy + 0.09;
    expect(onTable, "Leaf Puzzle is anchored on the Quest Table").toBe(false);
  });
});

// ── Stale Friend art in the Treehouse ───────────────────────────────

/**
 * Same defect as ZoneView's, in the room that actually shows the Friend inside
 * the story. `TreehouseRoom.enter` and `restyle` both used to guard on a truthy
 * texture, so a child who switched friends mid-session could open the Quest
 * Table and find the PREVIOUS friend standing in their miniature world.
 *
 * Every case here is on ONE instance, and includes leaving the room and coming
 * back — a fresh page load with a different ?avatar= would pass regardless,
 * because the bug needs a prior render to leave behind.
 */
describe("a change of Friend reaches the Quest Table", () => {
  const TEX_A = { width: 480, height: 640, id: "A" };
  const TEX_B = { width: 480, height: 640, id: "B" };

  const withFriend = (tex?: unknown): Room => {
    const room = new (TreehouseRoom as never as new (o: unknown) => unknown)({
      reducedMotion: false,
    }) as Room;
    room.setBackground({ width: ART_W, height: ART_H });
    room.enter("treehouse_hideaway", {} as never, null, DESKTOP.w, DESKTOP.h, tex);
    return room;
  };
  const friendTex = (room: Room) => room.quest.tex.friend;

  it("carries the chosen Friend in on entry", () => {
    expect(friendTex(withFriend(TEX_A))).toBe(TEX_A);
  });

  it("swaps to a replacement whose art is cached", () => {
    const room = withFriend(TEX_A);
    room.restyle({} as never, null, TEX_B);
    expect(friendTex(room)).toBe(TEX_B);
  });

  it("clears stale art when the replacement is unavailable", () => {
    const room = withFriend(TEX_A);
    room.restyle({} as never, null, undefined);
    expect(friendTex(room), "previous friend survived the switch").toBeUndefined();
  });

  it("accepts the replacement's art when it loads late", () => {
    const room = withFriend(TEX_A);
    room.restyle({} as never, null, undefined);
    room.restyle({} as never, null, TEX_B);
    expect(friendTex(room)).toBe(TEX_B);
  });

  it("does not bring the previous Friend back on re-entry", () => {
    const room = withFriend(TEX_A);
    room.hide();
    // Back to the island and in again, with the new friend's art still missing.
    room.enter("treehouse_hideaway", {} as never, null, DESKTOP.w, DESKTOP.h, undefined);
    expect(friendTex(room), "re-entry resurrected the previous friend").toBeUndefined();
    const r = room.tableRect;
    room.handleTap(r.x + r.w / 2, r.y + r.h / 2);
    expect(room.questTableOpen).toBe(true);
  });

  it("still opens the table, with a fallback, when no art is available at all", () => {
    const room = withFriend(undefined);
    const r = room.tableRect;
    expect(room.handleTap(r.x + r.w / 2, r.y + r.h / 2)).toBe("activity");
    expect(room.questTableOpen).toBe(true);
    expect(room.quest.cards.length).toBe(EC1_CHOICES.length);
  });
});
