// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Treehouse Hideaway — single-screen room contract.
 *
 * Pins the product decision that this interior is ONE STATIONARY ROOM:
 *   - no horizontal scrolling / camera of any kind;
 *   - three primary interactions (Decorate, Leaf Puzzle, Story Nook) that
 *     each actually do something;
 *   - an obvious Back to Island;
 *   - child-sized tap targets that stay on screen at phone and desktop
 *     aspect ratios.
 * The other eight interiors are ZoneView's business and are untouched here.
 */

// ── minimal Pixi mock (jsdom has no WebGL) ──────────────────────────
vi.mock("pixi.js", () => {
  class Pt {
    x = 0;
    y = 0;
    set(x: number, y?: number) {
      this.x = x;
      this.y = y ?? x;
    }
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
    // Graphics: every painter is chainable and does nothing.
    rect() { return this; }
    roundRect() { return this; }
    circle() { return this; }
    ellipse() { return this; }
    poly() { return this; }
    moveTo() { return this; }
    lineTo() { return this; }
    bezierCurveTo() { return this; }
    fill() { return this; }
    stroke() { return this; }
    clear() { return this; }
  }
  return { Container: Node, Graphics: Node, Sprite: Node, Text: Node, Texture: Node };
});

const {
  DECOR_ITEMS,
  HOTSPOTS,
  LEAF_SIZES,
  MIN_TAP,
  backButtonRect,
  coverRect,
  layoutHotspots,
  loadDecor,
  newPuzzle,
  saveDecor,
  storyPages,
  tapLeaf,
  toggleDecor,
} = await import("../render/treehouseModel");
const { TreehouseRoom } = await import("../render/TreehouseRoom");
const { getZoneDialogue } = await import("../content/loader");

// The room keeps private state; tests reach in deliberately.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Room = any;
const mk = (reducedMotion = false): Room =>
  new (TreehouseRoom as never as new (o: unknown) => unknown)({ reducedMotion }) as Room;

const PHONE = { w: 390, h: 844 };
const DESKTOP = { w: 1440, h: 900 };

/** Open the room at a size and return it. */
function entered(size = DESKTOP, reducedMotion = false): Room {
  const room = mk(reducedMotion);
  room.enter("treehouse_hideaway", {} as never, null, size.w, size.h);
  return room;
}

const tapSpot = (room: Room, id: string): string => {
  const s = room.spots.find((x: { id: string }) => x.id === id);
  expect(s, `hotspot ${id} is placed`).toBeTruthy();
  return room.handleTap(s.x, s.y);
};

const tapPanel = (room: Room, hitId: string): string => {
  const hit = room.panelHits.find((p: { id: string }) => p.id === hitId);
  expect(hit, `panel hit ${hitId} exists`).toBeTruthy();
  return room.handleTap(hit.rect.x + hit.rect.w / 2, hit.rect.y + hit.rect.h / 2);
};

beforeEach(() => {
  window.localStorage.clear();
});

// ── Geometry / layout ───────────────────────────────────────────────

describe("room geometry", () => {
  it("cover-fits the painting so it always fills the viewport", () => {
    const r = coverRect(2048, 1152, 390, 844); // tall phone, wide art
    expect(r.w).toBeGreaterThanOrEqual(390);
    expect(r.h).toBeGreaterThanOrEqual(844);
    // aspect preserved
    expect(r.w / r.h).toBeCloseTo(2048 / 1152, 5);
    // centred
    expect(r.x + r.w / 2).toBeCloseTo(195, 5);
  });

  it("falls back to the viewport for a texture that never decoded", () => {
    expect(coverRect(0, 0, 800, 600)).toEqual({ x: 0, y: 0, w: 800, h: 600 });
  });

  it("places all three actions on desktop, anchored to the art", () => {
    const img = coverRect(2048, 1152, DESKTOP.w, DESKTOP.h);
    const { mode, spots } = layoutHotspots(img, DESKTOP.w, DESKTOP.h);
    expect(mode).toBe("anchored");
    expect(spots.map((s) => s.id)).toEqual(HOTSPOTS.map((h) => h.id));
  });

  it("stacks the actions on a phone instead of squeezing three abreast", () => {
    const img = coverRect(2048, 1152, PHONE.w, PHONE.h);
    const { mode, spots } = layoutHotspots(img, PHONE.w, PHONE.h);
    expect(mode).toBe("stack");
    // distinct rows, same column
    expect(new Set(spots.map((s) => s.y)).size).toBe(3);
    expect(new Set(spots.map((s) => s.x)).size).toBe(1);
  });

  it("keeps every target child-sized and fully on screen at any aspect", () => {
    const sizes = [
      PHONE, DESKTOP,
      { w: 320, h: 568 },   // smallest phone we care about
      { w: 844, h: 390 },   // phone, landscape
      { w: 1024, h: 1366 }, // tablet, portrait
      { w: 2560, h: 1080 }, // ultrawide
    ];
    for (const { w, h } of sizes) {
      const img = coverRect(2048, 1152, w, h);
      const { spots } = layoutHotspots(img, w, h);
      for (const s of spots) {
        expect(s.h, `${w}x${h} ${s.id} height`).toBeGreaterThanOrEqual(MIN_TAP);
        expect(s.x - s.w / 2, `${w}x${h} ${s.id} left`).toBeGreaterThanOrEqual(0);
        expect(s.x + s.w / 2, `${w}x${h} ${s.id} right`).toBeLessThanOrEqual(w);
        expect(s.y - s.h / 2, `${w}x${h} ${s.id} top`).toBeGreaterThanOrEqual(0);
        expect(s.y + s.h / 2, `${w}x${h} ${s.id} bottom`).toBeLessThanOrEqual(h);
      }
      // never overlapping each other
      for (let i = 0; i < spots.length; i++) {
        for (let j = i + 1; j < spots.length; j++) {
          const a = spots[i], b = spots[j];
          const apart =
            Math.abs(a.x - b.x) >= (a.w + b.w) / 2 ||
            Math.abs(a.y - b.y) >= (a.h + b.h) / 2;
          expect(apart, `${w}x${h}: ${a.id} vs ${b.id}`).toBe(true);
        }
      }
      const back = backButtonRect(w, h);
      expect(back.h).toBeGreaterThanOrEqual(MIN_TAP);
      expect(back.x + back.w).toBeLessThanOrEqual(w);
    }
  });
});

// ── The room does not scroll ────────────────────────────────────────

describe("one stationary room", () => {
  it("exposes no camera / world-width / walk state at all", () => {
    const room = entered();
    for (const banned of ["camX", "worldWidth", "targetX", "charX", "env", "spawnX"]) {
      expect(room[banned], banned).toBeUndefined();
    }
  });

  it("never moves a hotspot in response to taps or time", () => {
    const room = entered();
    const before = room.spots.map((s: { x: number; y: number }) => [s.x, s.y]);
    // walk-style taps all over the room, then a few seconds of ticks
    for (const x of [10, 200, 700, 1300, 1439]) room.handleTap(x, 700);
    for (let i = 0; i < 120; i++) room.update(1 / 60);
    const after = room.spots.map((s: { x: number; y: number }) => [s.x, s.y]);
    expect(after).toEqual(before);
    // and the painting itself never shifts
    expect(room.bgLayer.position.x).toBe(0);
    expect(room.container.position.x).toBe(0);
  });

  it("tapping empty room floor does nothing but acknowledge the tap", () => {
    const room = entered();
    expect(room.handleTap(DESKTOP.w / 2, DESKTOP.h * 0.45)).toBe("move");
    expect(room.open).toBeNull();
  });
});

// ── Back to Island ──────────────────────────────────────────────────

describe("back to island", () => {
  it("reports exit when the Back pill is tapped", () => {
    const room = entered();
    const b = room.backRect;
    expect(room.handleTap(b.x + b.w / 2, b.y + b.h / 2)).toBe("exit");
  });

  it("does not exit while an activity card is open (the card takes the tap)", () => {
    const room = entered();
    tapSpot(room, "story");
    const b = room.backRect;
    expect(room.handleTap(b.x + b.w / 2, b.y + b.h / 2)).toBe("move");
  });
});

// ── 1. Decorate ─────────────────────────────────────────────────────

describe("decorate", () => {
  it("toggles a decoration on, persists it, and shows a saved confirmation", () => {
    const room = entered();
    expect(tapSpot(room, "decorate")).toBe("activity");
    expect(room.open).toBe("decorate");

    tapPanel(room, `decor:${DECOR_ITEMS[0].id}`);
    expect(room.decor).toContain(DECOR_ITEMS[0].id);
    expect(room.savedToast).toBeGreaterThan(0);
    expect(loadDecor()).toEqual([DECOR_ITEMS[0].id]);
  });

  it("toggles back off", () => {
    const room = entered();
    tapSpot(room, "decorate");
    tapPanel(room, `decor:${DECOR_ITEMS[1].id}`);
    tapPanel(room, `decor:${DECOR_ITEMS[1].id}`);
    expect(room.decor).not.toContain(DECOR_ITEMS[1].id);
    expect(loadDecor()).toEqual([]);
  });

  it("restores saved decorations on the next visit and draws them in the room", () => {
    saveDecor(["lantern", "cushion"]);
    const room = entered();
    expect(room.decor.sort()).toEqual(["cushion", "lantern"]);
    expect(room.decorLayer.children).toHaveLength(2);
  });

  it("survives storage being unavailable", () => {
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    const room = entered();
    tapSpot(room, "decorate");
    expect(() => tapPanel(room, `decor:${DECOR_ITEMS[0].id}`)).not.toThrow();
    // the decoration still appears this session; we just don't promise a save
    expect(room.decor).toContain(DECOR_ITEMS[0].id);
    expect(room.savedToast).toBe(0);
    spy.mockRestore();
  });

  it("toggleDecor / loadDecor ignore junk in storage", () => {
    window.localStorage.setItem("engage-island.treehouse.decor", '["lantern","bogus",7]');
    expect(loadDecor()).toEqual(["lantern"]);
    window.localStorage.setItem("engage-island.treehouse.decor", "not json");
    expect(loadDecor()).toEqual([]);
    expect(toggleDecor(["plant"], "plant")).toEqual([]);
  });
});

// ── 2. Leaf Puzzle ──────────────────────────────────────────────────

describe("leaf puzzle", () => {
  it("never deals an already-solved board", () => {
    for (let seed = 0; seed < 200; seed++) {
      const p = newPuzzle(seed);
      expect(p.leaves.map((l) => l.rank)).not.toEqual([0, 1, 2, 3]);
      expect(p.leaves.map((l) => l.slot).sort()).toEqual([0, 1, 2, 3]);
      expect([...p.leaves.map((l) => l.rank)].sort()).toEqual([0, 1, 2, 3]);
    }
  });

  it("completes when leaves are tapped smallest to largest", () => {
    const room = entered();
    expect(tapSpot(room, "puzzle")).toBe("activity");
    for (let rank = 0; rank < LEAF_SIZES.length; rank++) {
      expect(room.puzzle.done).toBe(false);
      tapPanel(room, `leaf:${rank}`);
      expect(room.puzzle.progress).toBe(rank + 1);
    }
    expect(room.puzzle.done).toBe(true);
  });

  it("a wrong leaf nudges but never costs progress", () => {
    const room = entered();
    tapSpot(room, "puzzle");
    tapPanel(room, "leaf:0");
    expect(room.puzzle.progress).toBe(1);
    tapPanel(room, "leaf:3"); // out of order
    expect(room.puzzle.progress).toBe(1);
    expect(room.puzzle.wrongRank).toBe(3);
    expect(room.shake).toBeGreaterThan(0);
    tapPanel(room, "leaf:1"); // the right one still works
    expect(room.puzzle.progress).toBe(2);
  });

  it("reopening a finished puzzle deals a fresh one", () => {
    const room = entered();
    tapSpot(room, "puzzle");
    for (let r = 0; r < LEAF_SIZES.length; r++) tapPanel(room, `leaf:${r}`);
    expect(room.puzzle.done).toBe(true);
    room.closePanel();
    tapSpot(room, "puzzle");
    expect(room.puzzle.done).toBe(false);
    expect(room.puzzle.progress).toBe(0);
  });

  it("tapLeaf is a no-op once solved", () => {
    let p = newPuzzle(5);
    for (let r = 0; r < LEAF_SIZES.length; r++) p = tapLeaf(p, r);
    expect(tapLeaf(p, 0)).toBe(p);
  });
});

// ── 3. Story Nook ───────────────────────────────────────────────────

describe("story nook", () => {
  it("reads its pages from the zone's authored content", () => {
    const pages = storyPages(getZoneDialogue("treehouse_hideaway"));
    expect(pages.length).toBeGreaterThanOrEqual(3);
    // greeting is NOT a story page
    expect(pages.join(" ")).not.toContain("Whooo's there?");
  });

  it("falls back to a built-in story when nothing is authored", () => {
    expect(storyPages([])).toHaveLength(3);
  });

  it("pages forward and closes on The End", () => {
    const room = entered();
    expect(tapSpot(room, "story")).toBe("activity");
    expect(room.storyPage).toBe(0);
    const last = room.pages.length - 1;
    for (let i = 0; i < last; i++) tapPanel(room, "story:next");
    expect(room.storyPage).toBe(last);
    tapPanel(room, "story:done");
    expect(room.open).toBeNull();
  });

  it("restarts at page one each time it is opened", () => {
    const room = entered();
    tapSpot(room, "story");
    tapPanel(room, "story:next");
    expect(room.storyPage).toBe(1);
    room.closePanel();
    tapSpot(room, "story");
    expect(room.storyPage).toBe(0);
  });
});

// ── Card behaviour shared by all three ──────────────────────────────

describe("activity cards", () => {
  it("close on the ✕ and on a scrim tap", () => {
    const room = entered();
    tapSpot(room, "decorate");
    const c = room.closeRect;
    room.handleTap(c.x + c.w / 2, c.y + c.h / 2);
    expect(room.open).toBeNull();

    tapSpot(room, "decorate");
    room.handleTap(4, 4); // far corner = scrim
    expect(room.open).toBeNull();
  });

  it("re-lays out on resize without losing the open activity or its state", () => {
    const room = entered(DESKTOP);
    tapSpot(room, "puzzle");
    tapPanel(room, "leaf:0");
    room.resize(PHONE.w, PHONE.h);
    expect(room.open).toBe("puzzle");
    expect(room.puzzle.progress).toBe(1);
    // hotspots re-placed for the new shape, still on screen
    for (const s of room.spots) {
      expect(s.x + s.w / 2).toBeLessThanOrEqual(PHONE.w);
      expect(s.y + s.h / 2).toBeLessThanOrEqual(PHONE.h);
    }
  });

  it("hide() closes any open card so the room reopens clean", () => {
    const room = entered();
    tapSpot(room, "story");
    room.hide();
    expect(room.active).toBe(false);
    expect(room.open).toBeNull();
  });

  it("works end to end under reduced motion (no ripples, no wobble)", () => {
    const room = entered(DESKTOP, true);
    room.handleTap(DESKTOP.w / 2, DESKTOP.h / 2);
    expect(room.ripples).toHaveLength(0);
    expect(tapSpot(room, "puzzle")).toBe("activity");
    for (let r = 0; r < LEAF_SIZES.length; r++) tapPanel(room, `leaf:${r}`);
    expect(room.puzzle.done).toBe(true);
  });
});
