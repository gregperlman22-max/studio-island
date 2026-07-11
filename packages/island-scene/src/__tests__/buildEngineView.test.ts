// @vitest-environment jsdom
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { BuildEvent, BuildRegion, BuildState, Placement } from "../build-engine/types";

/**
 * Session 5 — the engine view's targeted-update contract, mirroring the X6
 * renderer proof: state changes flow through planPlacementUpdate into
 * per-placement display bundles; PLACING ONE ITEM NEVER TRIGGERS A FULL
 * REBUILD (stats.fullRebuilds only moves on reset/load).
 */

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
    parent: Node | null = null;
    position = new Pt();
    anchor = new Pt();
    scale = new Pt();
    visible = true;
    alpha = 1;
    zIndex = 0;
    eventMode = "";
    sortableChildren = false;
    destroyed = false;
    addChild(...cs: Node[]) {
      for (const c of cs) {
        c.parent = this;
        this.children.push(c);
      }
      return cs[0];
    }
    removeChild(c: Node) {
      this.children = this.children.filter((x) => x !== c);
      return c;
    }
    removeChildren() {
      const out = this.children;
      this.children = [];
      return out;
    }
    destroy() {
      this.destroyed = true;
      this.parent?.removeChild(this);
    }
  }
  const graphics = () => {
    const node = new Node();
    const proxy: unknown = new Proxy(node, {
      get(t, p, r) {
        if (p in t) return Reflect.get(t, p, r);
        return () => proxy;
      },
    });
    return proxy;
  };
  class Graphics {
    constructor() {
      return graphics() as Graphics;
    }
  }
  class Text extends Node {
    text = "";
    constructor(opts?: { text?: unknown }) {
      super();
      this.text = String(opts?.text ?? "");
    }
  }
  class Container extends Node {}
  return { Container, Graphics, Text };
});

const { BuildEngineView } = await import("../build-engine/BuildEngineView");
const { applyBuildEvent } = await import("../build-engine/engine");
const { tileCenter } = await import("../render/iso");

const region: BuildRegion = { buildable: (x, y) => x >= 0 && y >= 0 && x < 12 && y < 12 };
const cells = Array.from({ length: 12 * 12 }, (_, i) => ({ x: i % 12, y: Math.floor(i / 12) }));

const place = (id: string, itemId: string, x: number, y: number, rotation: 0 | 1 | 2 | 3 = 0): Placement => ({
  id, itemId, cell: { x, y }, rotation,
});
const state = (...placements: Placement[]): BuildState => ({ version: 1, placements });

function makeView(events: BuildEvent[] = []) {
  return new BuildEngineView({
    region,
    buildableCells: cells,
    onEvent: (e) => events.push(e),
    reducedMotion: true,
  });
}

beforeAll(() => {
  vi.spyOn(console, "info").mockImplementation(() => {});
});

describe("BuildEngineView — targeted updates, state-in/events-out", () => {
  it("placing one item builds exactly one bundle and NEVER full-rebuilds", () => {
    const view = makeView();
    let s = state();
    view.setState(s);
    expect(view.stats).toEqual({ fullRebuilds: 0, bundlesBuilt: 0, bundlesRemoved: 0 });
    // Simulate the host loop: event → reducer → state back in.
    s = applyBuildEvent(s, { type: "place", placement: place("a", "nature.rock", 2, 2) }, region);
    view.setState(s);
    expect(view.stats).toEqual({ fullRebuilds: 0, bundlesBuilt: 1, bundlesRemoved: 0 });
    s = applyBuildEvent(s, { type: "place", placement: place("b", "figures.dragon", 5, 5) }, region);
    view.setState(s);
    expect(view.stats).toEqual({ fullRebuilds: 0, bundlesBuilt: 2, bundlesRemoved: 0 });
  });

  it("a same-content state (echo) is a strict display no-op", () => {
    const view = makeView();
    const s = state(place("a", "nature.rock", 2, 2), place("b", "comfort.bench", 4, 4));
    view.setState(s);
    const before = { ...view.stats };
    view.setState(JSON.parse(JSON.stringify(s)));
    view.setState(JSON.parse(JSON.stringify(s)));
    expect(view.stats).toEqual(before);
  });

  it("rotate/remove update exactly the affected bundle", () => {
    const view = makeView();
    let s = state(place("a", "comfort.bench", 2, 2), place("b", "nature.rock", 6, 6));
    view.setState(s);
    const before = { ...view.stats };
    s = applyBuildEvent(s, { type: "rotate", id: "a", rotation: 1 }, region);
    view.setState(s);
    expect(view.stats.bundlesBuilt).toBe(before.bundlesBuilt + 1); // re-created in place
    expect(view.stats.bundlesRemoved).toBe(before.bundlesRemoved + 1);
    s = applyBuildEvent(s, { type: "remove", id: "b" }, region);
    view.setState(s);
    expect(view.stats.bundlesRemoved).toBe(before.bundlesRemoved + 2);
    expect(view.stats.fullRebuilds).toBe(0);
  });

  it("the view is transport-agnostic: a 'remote' state lands identically", () => {
    // No taps involved — states arrive from outside (as a sync channel would).
    const view = makeView();
    view.setState(state(place("r1", "structures.tent", 1, 1)));
    view.setState(state(place("r1", "structures.tent", 1, 1), place("r2", "figures.knight", 4, 4)));
    expect(view.stats).toEqual({ fullRebuilds: 0, bundlesBuilt: 2, bundlesRemoved: 0 });
  });

  it("taps emit events but never mutate the view's own state", () => {
    const events: BuildEvent[] = [];
    const view = makeView(events);
    const s = state(place("a", "nature.rock", 3, 3));
    view.setState(s);
    // Tap the rock (world coords of its cell center) — selects it.
    const c = tileCenter(3, 3);
    expect(view.handleTap(c.x, c.y)).toBe(true);
    expect(view.selected).toBe("a");
    expect(view.getState()).toBe(s); // state untouched by input
    expect(events).toEqual([]); // selection alone emits nothing
  });

  it("reset (load-save path) is the ONLY full rebuild", () => {
    const view = makeView();
    view.setState(state(place("a", "nature.rock", 2, 2)));
    view.reset(state(place("b", "comfort.swing", 5, 5)));
    expect(view.stats.fullRebuilds).toBe(1);
    expect(view.getState().placements.map((p) => p.id)).toEqual(["b"]);
  });
});

describe("tap-to-place (the touch-primary flow)", () => {
  it("cellAt resolves buildable cells and rejects off-region points", () => {
    const view = makeView();
    const inCell = tileCenter(3, 3);
    expect(view.cellAt(inCell.x, inCell.y)).toEqual({ x: 3, y: 3 });
    const outCell = tileCenter(20, 20); // outside the 12×12 test region
    expect(view.cellAt(outCell.x, outCell.y)).toBeNull();
  });

  it("armed-item taps place repeatedly through the host loop, never full-rebuilding", () => {
    const view = makeView();
    let s = state();
    view.setState(s);
    // Simulate the renderer+host: an unconsumed tap resolves a cell, the host
    // places the armed item there; armed persists for repeat stamping.
    const tapPlace = (gx: number, gy: number, id: string) => {
      const c = tileCenter(gx, gy);
      expect(view.handleTap(c.x, c.y)).toBe(false); // nothing consumed the tap
      const cell = view.cellAt(c.x, c.y);
      expect(cell).toEqual({ x: gx, y: gy });
      s = applyBuildEvent(s, { type: "place", placement: place(id, "nature.tree-oak", cell!.x, cell!.y) }, region);
      view.setState(s);
    };
    tapPlace(2, 2, "t1");
    tapPlace(4, 4, "t2");
    tapPlace(6, 6, "t3");
    expect(view.stats).toEqual({ fullRebuilds: 0, bundlesBuilt: 3, bundlesRemoved: 0 });
    expect(s.placements).toHaveLength(3);
  });

  it("the real island layout rejects dock cells and accepts the meadow", async () => {
    const { buildRegion, DOCK_CELLS } = await import("../build-island/layout");
    for (const c of DOCK_CELLS) expect(buildRegion.buildable(c.x, c.y), `dock ${c.x},${c.y}`).toBe(false);
    expect(buildRegion.buildable(12, 9)).toBe(true); // open meadow, mid-island
    expect(buildRegion.buildable(0, 0)).toBe(false); // ocean corner
  });

  it("save slots round-trip a tap-placed build across all three slots", async () => {
    const { saveToSlot, loadFromSlot, clearSlot } = await import("../build-engine/saves");
    localStorage.clear();
    let s = state();
    for (const [i, [x, y]] of [[2, 2], [4, 4], [6, 6]].entries()) {
      s = applyBuildEvent(s, { type: "place", placement: place(`p${i}`, "comfort.bench", x, y) }, region);
    }
    for (const slot of [1, 2, 3] as const) {
      expect(saveToSlot(slot, s)).toBe(true);
      expect(loadFromSlot(slot)).toEqual(s);
    }
    // Mutate after saving — slots keep the saved snapshot.
    const s2 = applyBuildEvent(s, { type: "remove", id: "p0" }, region);
    expect(loadFromSlot(2)).toEqual(s);
    expect(s2.placements).toHaveLength(2);
    for (const slot of [1, 2, 3] as const) clearSlot(slot);
  });
});
