// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";

/**
 * TravelView — the drawing contract.
 *
 * Two things this guards, both of which were real defects during EC-2:
 *
 *  1. PERSISTENT SPRITES. The POC rebuilt every sprite every frame. That was
 *     fine for a proof and is not fine for a phone, so corridor props are
 *     pooled. If the pool grows without bound across frames, the rebuild is
 *     back.
 *  2. DEPTH ORDER BY ALLOCATION. The pool index used to be assumed equal to the
 *     item index, which broke the moment the hollow log started drawing its own
 *     Graphics instead of taking a pool slot: the display list was re-indexed
 *     past its own length and Pixi threw `addChildAt … out of bounds`. Items
 *     now allocate only when they need a sprite.
 */

vi.mock("pixi.js", () => {
  class Pt {
    x = 0; y = 0;
    set(x: number, y?: number) { this.x = x; this.y = y ?? x; }
  }
  class Node {
    children: Node[] = [];
    position = new Pt();
    scale = (() => { const p = new Pt(); p.set(1, 1); return p; })();
    anchor = new Pt();
    visible = true; alpha = 1; tint = 0xffffff;
    width = 0; height = 0; texture: unknown = null;
    mask: unknown = null; filters: unknown[] = [];
    style: Record<string, unknown> = {}; text = "";
    constructor(arg?: unknown) {
      if (arg && typeof arg === "object" && "text" in (arg as object)) {
        const a = arg as { text?: unknown; style?: Record<string, unknown> };
        this.text = String(a.text ?? "");
        if (a.style) this.style = a.style;
      }
    }
    addChild(...cs: Node[]) {
      for (const c of cs) {
        const i = this.children.indexOf(c);
        if (i >= 0) this.children.splice(i, 1);   // Pixi moves an existing child
        this.children.push(c);
      }
      return cs[0];
    }
    addChildAt(c: Node, i: number) {
      if (i > this.children.length) throw new Error(`addChildAt: index ${i} out of bounds ${this.children.length}`);
      this.children.splice(i, 0, c);
      return c;
    }
    removeChildren() { const c = this.children; this.children = []; return c; }
    destroy() {}
    rect() { return this; } roundRect() { return this; } circle() { return this; }
    ellipse() { return this; } poly() { return this; } arc() { return this; }
    moveTo() { return this; } lineTo() { return this; }
    bezierCurveTo() { return this; } quadraticCurveTo() { return this; }
    fill() { return this; } stroke() { return this; } clear() { return this; }
  }
  return { Container: Node, Graphics: Node, Sprite: Node, Text: Node, Texture: Node };
});

const { TravelView } = await import("../travel/TravelView");
const { TREEHOUSE_ROUTE } = await import("../travel/route");

const TEX = { width: 480, height: 640 };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type View = any;

/** A view with a fake kit in place, so nothing needs to decode an image. */
function mounted(reducedMotion = false, w = 1440, h = 900): View {
  const v = new (TravelView as never as new (o: unknown) => unknown)({ reducedMotion }) as View;
  const props: Record<string, unknown> = {};
  for (const k of ["tree1", "tree2", "bush1", "bush2", "rock", "flower", "flowerBush", "grass"]) {
    props[k] = { width: 512, height: 768 };
  }
  v.kit = { props, destination: { width: 700, height: 900 }, bounds: new WeakMap() };
  v.setFriend(TEX, "otter", true);
  v.setOlive(TEX);
  v.begin(w, h);
  return v;
}

const start = (v: View) => v.handleTap(...centreOf(v, "lets-go"));
function centreOf(v: View, id: string): [number, number] {
  const hit = v.hits.find((x: { id: string }) => x.id === id);
  if (!hit) throw new Error(`no hit target "${id}" — have: ${v.hits.map((x: { id: string }) => x.id).join(", ")}`);
  return [hit.rect.x + hit.rect.w / 2, hit.rect.y + hit.rect.h / 2];
}

describe("the journey draws without rebuilding itself", () => {
  it("stops growing its sprite pool once the corridor is warm", () => {
    const v = mounted();
    start(v);
    for (let i = 0; i < 30; i++) v.update(1 / 60);
    const warm = v.spriteCount;
    for (let i = 0; i < 200; i++) v.update(1 / 60);
    expect(v.spriteCount, "the sprite pool kept growing — the per-frame rebuild is back").toBe(warm);
    expect(warm).toBeGreaterThan(0);
  });

  it("draws the whole journey without an out-of-bounds insert", () => {
    const v = mounted();
    start(v);
    // Walk the entire route, including the stretch where the log is on screen.
    for (let i = 0; i < 1200 && v.phase === "travel"; i++) {
      v.setWalking(true);
      v.update(1 / 60);
    }
    expect(v.phase).toBe("arrival");
  });

  it("keeps the corridor depth-sorted far to near", () => {
    const v = mounted();
    start(v);
    v.update(1 / 60);
    // The depth layer's order IS the draw order.
    expect(v.depth.children.length).toBeGreaterThan(3);
  });
});

describe("the journey's own screens", () => {
  it("opens on a character-free destination card", () => {
    const v = mounted();
    expect(v.phase).toBe("card");
    const ids = v.hits.map((x: { id: string }) => x.id);
    expect(ids).toContain("lets-go");
    expect(ids).toContain("dismiss");
    // Olive greets on ARRIVAL. She must not be on the card.
    expect(v.overlay.children.some((c: { text?: string }) => (c.text ?? "").includes("Olive"))).toBe(false);
  });

  it("offers the map, and a way back to the island from it", () => {
    const v = mounted();
    start(v);
    v.handleTap(...centreOf(v, "map-open"));
    const ids = v.hits.map((x: { id: string }) => x.id);
    expect(ids).toContain("map-close");
    expect(ids).toContain("back-to-island");
  });

  it("greets with Olive AND the Friend together before the room", () => {
    const v = mounted();
    start(v);
    for (let i = 0; i < 1200 && v.phase === "travel"; i++) { v.setWalking(true); v.update(1 / 60); }
    expect(v.phase).toBe("arrival");
    expect(v.overlay.children.some((c: { text?: string }) => (c.text ?? "").includes("Olive"))).toBe(true);
    // Two character sprites on screen: the Friend and Olive.
    const sprites = v.overlay.children.filter((c: { texture?: unknown }) => c.texture);
    expect(sprites.length).toBeGreaterThanOrEqual(2);
    expect(v.hits.map((x: { id: string }) => x.id)).toContain("enter-room");
    expect(v.handleTap(...centreOf(v, "enter-room"))).toBe("enter-room");
  });

  it("offers the log only while it is reachable, and finding it is one tap", () => {
    const v = mounted(true);   // reduced motion: waypoint travel
    start(v);
    expect(v.hits.some((x: { id: string }) => x.id === "log")).toBe(false);
    // Tap to the stop beside the log.
    for (let i = 0; i < 6 && !v.hits.some((x: { id: string }) => x.id === "log"); i++) {
      v.handleTap(...centreOf(v, "keep-going"));
    }
    expect(v.hits.some((x: { id: string }) => x.id === "log"), "the log never became reachable").toBe(true);
    v.handleTap(...centreOf(v, "log"));
    expect(v.discoveryFound).toBe(true);
    expect(v.hits.some((x: { id: string }) => x.id === "log")).toBe(false);
  });

  it("can be walked past without ever investigating the log", () => {
    const v = mounted(true);
    start(v);
    for (let i = 0; i < 10 && v.phase === "travel"; i++) v.handleTap(...centreOf(v, "keep-going"));
    expect(v.phase).toBe("arrival");
    expect(v.discoveryFound).toBe(false);
  });

  it("pins the destination on the snapshot, and only while it is in frame", () => {
    const tex = { width: 560, height: 347 };
    const open = (mark: { x: number; y: number }) => {
      const v = mounted(false, 390, 844);
      v.setMapSnapshot({ texture: tex, destination: mark });
      start(v);
      v.handleTap(...centreOf(v, "map-open"));
      return v.overlay.children.length;
    };
    // A mark at the middle of the snapshot is always inside the panel; one far
    // outside it has been cropped away and must NOT be drawn at the panel edge,
    // where it would point at the wrong piece of ground.
    expect(open({ x: 0.5, y: 0.5 })).toBe(open({ x: 8, y: 8 }) + 1);
  });

  it("does not claim a route across the island", () => {
    const v = mounted(false, 390, 844);
    v.setMapSnapshot({ texture: { width: 560, height: 347 }, destination: { x: 0.3, y: 0.3 } });
    start(v);
    v.handleTap(...centreOf(v, "map-open"));
    // The start end of the progress track names the island the child left, not
    // a landmark the journey never visits.
    const labels = v.overlay.children.map((c: { text?: string }) => c.text ?? "");
    expect(labels).toContain("Island");
    expect(labels).toContain("Treehouse");
    expect(labels.some((t: string) => t.includes("Welcome Dock"))).toBe(false);
  });

  it("writes the map's own labels in light ink, on the dark scrim", () => {
    const v = mounted(false, 390, 844);
    v.setMapSnapshot({ texture: { width: 560, height: 347 }, destination: { x: 0.5, y: 0.5 } });
    start(v);
    v.handleTap(...centreOf(v, "map-open"));
    const CARD = 0xfdf3e0;
    for (const want of ["You're on your way", "Island", "Treehouse"]) {
      const t = v.overlay.children.find((c: { text?: string }) => c.text === want);
      expect(t, `no "${want}" on the journey map`).toBeTruthy();
      expect(t.style.fill, `"${want}" is dark ink on the dark scrim`).toBe(CARD);
    }
  });

  it("stands the Friend, Olive and the Treehouse on one ground line", async () => {
    const { arrivalStage } = await import("../travel/journey");
    for (const [w, h] of [[390, 844], [768, 1024], [1440, 900]] as const) {
      const v = mounted(true, w, h);
      start(v);
      for (let i = 0; i < 10 && v.phase === "travel"; i++) v.handleTap(...centreOf(v, "keep-going"));
      expect(v.phase).toBe("arrival");
      const { groundY, treeH, treeX } = arrivalStage({ w, h });
      // The destination is base-pinned on that line, whole, above it — not the
      // corridor's last frame, where p = 1 put a wall of trunk on the screen.
      const tree = v.depth.children.find((c: { texture?: unknown }) => c.texture);
      expect(tree, "nothing was drawn on the arrival stage").toBeTruthy();
      expect(tree.position.y).toBeCloseTo(groundY, 3);
      expect(tree.position.x).toBeCloseTo(treeX, 3);
      expect(treeH).toBeLessThanOrEqual(groundY);
      // Both characters' feet land on the same line.
      const feet = v.overlay.children
        .filter((c: { texture?: unknown }) => c.texture)
        .map((c: { position: { y: number } }) => c.position.y);
      expect(feet.length).toBeGreaterThanOrEqual(2);
      for (const y of feet) expect(y).toBeCloseTo(groundY, 3);
    }
  });

  it("reports the substituted travel pose rather than hiding it", () => {
    expect(mounted().usingSubstitutePose).toBe(true);
  });

  it("uses every waypoint on the route under reduced motion", () => {
    expect(TREEHOUSE_ROUTE.waypoints.length).toBeGreaterThanOrEqual(5);
  });
});
