// @vitest-environment jsdom
import { beforeAll, describe, expect, it, vi } from "vitest";
import { sampleLayout, sampleZones } from "../defaultLayout";
import { sproutPack } from "../theme-packs";
import type { AvatarInstance, ZoneInstance } from "../types";

/**
 * X6/F6 — the no-full-rebuild contract, renderer half. Pixi is replaced by a
 * lightweight display-object mock (jsdom has no WebGL), so a REAL SceneRenderer
 * initializes and its `stats` counters observe exactly which display work each
 * prop setter performs:
 *   - same-content zones/avatars arrays → every counter untouched;
 *   - a cosmetic zone change → exactly one zone bundle rebuilt;
 *   - a geometry change → +grid +scatter, still no full rebuild;
 *   - only setLayout (a genuinely new world) triggers rebuild().
 */

// ── Pixi mock ────────────────────────────────────────────────────────
vi.mock("pixi.js", () => {
  const texture = () => ({ width: 100, height: 100 });
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
    scale = (() => {
      const p = new Pt();
      p.x = 1;
      p.y = 1;
      return p;
    })();
    pivot = new Pt();
    anchor = new Pt();
    visible = true;
    alpha = 1;
    zIndex = 0;
    rotation = 0;
    angle = 0;
    eventMode = "";
    cursor = "";
    sortableChildren = false;
    mask: unknown = null;
    hitArea: unknown = null;
    tint = 0xffffff;
    texture: unknown = texture();
    width = 100;
    height = 100;
    destroyed = false;
    addChild(...cs: Node[]) {
      for (const c of cs) {
        c.parent = this;
        this.children.push(c);
      }
      return cs[0];
    }
    addChildAt(c: Node, _i: number) {
      return this.addChild(c);
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
    setChildIndex() {}
    destroy() {
      this.destroyed = true;
      this.parent?.removeChild(this);
    }
    on() {
      return this;
    }
    off() {
      return this;
    }
    once() {
      return this;
    }
    getBounds() {
      return { minX: 0, minY: 0, maxX: 100, maxY: 100, width: 100, height: 100 };
    }
    toLocal(p: unknown) {
      return p;
    }
  }
  /** Graphics: real Node core + chainable no-op for any draw method. */
  const graphics = () => {
    const node = new Node();
    const proxy: unknown = new Proxy(node, {
      get(t, p, r) {
        if (p in t) return Reflect.get(t, p, r);
        return () => proxy; // rect().fill().stroke()… all chain
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
    style: unknown;
    constructor(opts?: { text?: unknown; style?: unknown }) {
      super();
      this.text = String(opts?.text ?? "");
      this.style = opts?.style;
      this.width = Math.max(10, this.text.length * 8);
      this.height = 20;
    }
  }
  class Sprite extends Node {
    constructor(tex?: unknown) {
      super();
      if (tex) this.texture = tex;
    }
  }
  class Container extends Node {}
  class Rectangle {
    constructor(
      public x = 0,
      public y = 0,
      public width = 0,
      public height = 0,
    ) {}
  }
  class Texture {
    static WHITE = texture();
    static from = () => texture();
  }
  class Application {
    canvas = document.createElement("canvas");
    stage = new Container();
    renderer = { background: { color: 0 }, generateTexture: () => texture() };
    screen = { width: 800, height: 600 };
    ticker = { add: () => {}, remove: () => {} };
    async init(_opts: unknown) {}
    render() {}
    resize() {}
    destroy() {}
  }
  const Assets = { load: async () => texture() };
  return { Application, Assets, Container, Graphics, Rectangle, Sprite, Text, Texture };
});

// jsdom can't decode images / generate textures — stub the knockout loader and
// the programmatic texture provider (neither affects update routing).
vi.mock("../render/avatarTexture", () => ({
  loadAvatarTexture: async () => ({ width: 100, height: 100 }),
}));
vi.mock("../render/TextureProvider", () => ({
  ProgrammaticTextureProvider: class {
    refresh() {}
    getDecoration() {
      return { width: 32, height: 32 };
    }
    destroy() {}
  },
}));

const { SceneRenderer } = await import("../render/SceneRenderer");

const cloneZones = (): ZoneInstance[] => JSON.parse(JSON.stringify(sampleZones));
const avatar = (over: Partial<AvatarInstance> = {}): AvatarInstance => ({
  id: "local",
  isLocal: true,
  position: { ...sampleLayout.spawnPoint },
  config: { species: "bunny", bodyColor: "#f3c1d6", accessoryKey: "none", displayColor: "#c47b9a" },
  ...over,
});

async function makeRenderer() {
  const renderer = new SceneRenderer({
    container: document.createElement("div"),
    reducedMotion: true, // skips avatar select + boat cinematic
    hideTextLabels: false,
    audioEnabled: false,
  });
  await renderer.init(sproutPack, sampleLayout, cloneZones(), [avatar()], null);
  return renderer;
}

beforeAll(() => {
  vi.spyOn(console, "info").mockImplementation(() => {}); // dev diagnostics off
});

describe("X6/F6 — prop changes do targeted updates, never a full rebuild", () => {
  it("init performs exactly one full build (9 zone bundles, 1 grid, 1 scatter)", async () => {
    const r = await makeRenderer();
    expect(r.stats).toEqual({
      fullRebuilds: 1,
      zoneBundlesBuilt: 9,
      gridBuilds: 1,
      scatterLayouts: 1,
    });
  });

  it("setZones with a same-content array does ZERO display work", async () => {
    const r = await makeRenderer();
    const before = { ...r.stats };
    r.setZones(cloneZones());
    r.setZones(cloneZones());
    expect(r.stats).toEqual(before);
  });

  it("setAvatars never rebuilds static display objects", async () => {
    const r = await makeRenderer();
    const before = { ...r.stats };
    // Same content, new identity (the React memo-bust case)…
    r.setAvatars([avatar()]);
    // …a genuine config change (avatar view rebuilds internally, targeted)…
    r.setAvatars([avatar({ config: { species: "fox", bodyColor: "#fff", accessoryKey: "hat", displayColor: "#000" } })]);
    // …and a position change (drives a walk, not a rebuild).
    r.setAvatars([avatar({ position: { x: 30, y: 30 } })]);
    expect(r.stats).toEqual(before);
  });

  it("a cosmetic zone change rebuilds exactly one bundle (no grid/scatter)", async () => {
    const r = await makeRenderer();
    const before = { ...r.stats };
    const next = cloneZones();
    next.find((z) => z.key === "lighthouse_point")!.unlocked = false;
    r.setZones(next);
    expect(r.stats).toEqual({
      ...before,
      zoneBundlesBuilt: before.zoneBundlesBuilt + 1,
    });
  });

  it("a moved zone re-derives grid + scatter, still no full rebuild", async () => {
    const r = await makeRenderer();
    const before = { ...r.stats };
    const next = cloneZones();
    const moved = next.find((z) => z.key === "campfire_circle")!;
    moved.gridPosition = { x: moved.gridPosition.x + 1, y: moved.gridPosition.y };
    r.setZones(next);
    expect(r.stats).toEqual({
      fullRebuilds: before.fullRebuilds, // unchanged
      zoneBundlesBuilt: before.zoneBundlesBuilt + 1,
      gridBuilds: before.gridBuilds + 1,
      scatterLayouts: before.scatterLayouts + 1,
    });
  });

  it("a removed zone tears down without building or full-rebuilding", async () => {
    const r = await makeRenderer();
    const before = { ...r.stats };
    r.setZones(cloneZones().filter((z) => z.key !== "lazy_lagoon"));
    expect(r.stats.fullRebuilds).toBe(before.fullRebuilds);
    expect(r.stats.zoneBundlesBuilt).toBe(before.zoneBundlesBuilt); // destroy only
    expect(r.stats.gridBuilds).toBe(before.gridBuilds + 1);
  });

  it("setTheme repaints zone scenes but never grid/scatter/full rebuild", async () => {
    const r = await makeRenderer();
    const before = { ...r.stats };
    r.setTheme(sproutPack);
    expect(r.stats).toEqual({
      ...before,
      zoneBundlesBuilt: before.zoneBundlesBuilt + 9,
    });
  });

  it("only setLayout (same ref = no-op; new object = new world) full-rebuilds", async () => {
    const r = await makeRenderer();
    const before = { ...r.stats };
    r.setLayout(sampleLayout); // same reference — no-op
    expect(r.stats).toEqual(before);
    r.setLayout({ ...sampleLayout });
    expect(r.stats.fullRebuilds).toBe(before.fullRebuilds + 1);
  });
});
