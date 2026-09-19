// @vitest-environment jsdom
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { sampleLayout, sampleZones } from "../defaultLayout";
import { sproutPack } from "../theme-packs";
import type { AvatarInstance, ZoneInstance } from "../types";
import { footprintCenter } from "../render/iso";

/**
 * Landmark loading when the Treehouse pair is INCOMPLETE — review correction 1.
 *
 * treehouse.webp is the master with the front pieces cut out. It must never be
 * drawn on its own: if either half of the pair fails, the complete master
 * (treehouse-full.webp) stands in alone; if that fails too, nothing is set and
 * the zone draws its code-drawn structure. Depth metadata follows the art that
 * actually loaded. Proven on a real SceneRenderer with the renderer's Pixi
 * mock, Assets.load made to reject chosen URLs.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
vi.mock("pixi.js", () => {
  const texture = () => ({ width: 100, height: 100 });
  class Pt { x = 0; y = 0; set(x: number, y?: number) { this.x = x; this.y = y ?? x; } }
  class Node {
    children: Node[] = []; parent: Node | null = null;
    position = new Pt(); scale = (() => { const p = new Pt(); p.set(1, 1); return p; })();
    pivot = new Pt(); anchor = new Pt();
    visible = true; alpha = 1; zIndex = 0; rotation = 0; angle = 0;
    eventMode = ""; cursor = ""; sortableChildren = false;
    mask: unknown = null; hitArea: unknown = null; tint = 0xffffff;
    texture: unknown = texture(); width = 100; height = 100; destroyed = false;
    addChild(...cs: Node[]) { for (const c of cs) { c.parent = this; this.children.push(c); } return cs[0]; }
    addChildAt(c: Node) { return this.addChild(c); }
    removeChild(c: Node) { this.children = this.children.filter((x) => x !== c); return c; }
    removeChildren() { const out = this.children; this.children = []; return out; }
    setChildIndex() {}
    destroy() { this.destroyed = true; this.parent?.removeChild(this); }
    on() { return this; } off() { return this; } once() { return this; }
    getBounds() { return { minX: 0, minY: 0, maxX: 100, maxY: 100, width: 100, height: 100 }; }
    toLocal(p: unknown) { return p; }
  }
  const graphics = () => {
    const node = new Node();
    const proxy: unknown = new Proxy(node, {
      get(t, p, r) { if (p in t) return Reflect.get(t, p, r); return () => proxy; },
    });
    return proxy;
  };
  class Graphics { constructor() { return graphics() as Graphics; } }
  class Text extends Node {
    text = ""; style: unknown;
    constructor(opts?: { text?: unknown; style?: unknown }) {
      super(); this.text = String(opts?.text ?? ""); this.style = opts?.style;
      this.width = Math.max(10, this.text.length * 8); this.height = 20;
    }
  }
  class Sprite extends Node { constructor(tex?: unknown) { super(); if (tex) this.texture = tex; } }
  class Container extends Node {}
  class Rectangle { constructor(public x = 0, public y = 0, public width = 0, public height = 0) {} }
  class Texture { static WHITE = texture(); static from = () => texture(); }
  class Application {
    canvas = document.createElement("canvas"); stage = new Container();
    renderer = { background: { color: 0 }, generateTexture: () => texture() };
    screen = { width: 800, height: 600 };
    ticker = { add: () => {}, remove: () => {} };
    async init() {} render() {} resize() {} destroy() {}
  }
  // URL-aware: a test lists which URL fragments must FAIL to load.
  const Assets = {
    load: async (url: string) => {
      const failing = (globalThis as Any).__failUrls as string[] | undefined;
      if (failing?.some((f) => url.includes(f))) throw new Error("blocked: " + url);
      return { ...texture(), url };
    },
  };
  return { Application, Assets, Container, Graphics, Rectangle, Sprite, Text, Texture };
});
vi.mock("../render/avatarTexture", () => ({
  loadAvatarTexture: async () => ({ width: 100, height: 100 }),
  getContentBounds: () => undefined,
  registerContentBounds: () => {},
}));
vi.mock("../render/TextureProvider", () => ({
  ProgrammaticTextureProvider: class { refresh() {} getDecoration() { return { width: 32, height: 32 }; } destroy() {} },
}));

const { SceneRenderer } = await import("../render/SceneRenderer");
const { LANDMARK_ART } = await import("../render/zones");

const TH = sampleZones.find((z) => z.key === "treehouse_hideaway")!;
const avatar = (): AvatarInstance => ({
  id: "local", isLocal: true, position: { ...sampleLayout.spawnPoint },
  config: { species: "bunny", bodyColor: "#f3c1d6", accessoryKey: "none", displayColor: "#c47b9a" },
});
async function renderer(failUrls: string[]) {
  (globalThis as Any).__failUrls = failUrls;
  const r: Any = new SceneRenderer({
    container: document.createElement("div"), reducedMotion: true, hideTextLabels: false, audioEnabled: false,
  });
  await r.init(sproutPack, sampleLayout, JSON.parse(JSON.stringify(sampleZones)) as ZoneInstance[], [avatar()], null);
  return r;
}
const urlOf = (t: Any) => String(t?.url ?? "");
const th = (r: Any) => ({
  back: r.landmarkTextures.get("treehouse_hideaway"),
  front: r.landmarkFrontTextures.get("treehouse_hideaway"),
  bundle: r.zoneBundles.get("treehouse_hideaway"),
  mark: r.landmarkMarks().find((m: { key: string }) => m.key === "treehouse_hideaway"),
});

beforeAll(() => { vi.spyOn(console, "info").mockImplementation(() => {}); vi.spyOn(console, "warn").mockImplementation(() => {}); });
beforeEach(() => { (globalThis as Any).__failUrls = []; });

describe("Treehouse landmark loading — complete pair or complete master, never a fragment", () => {
  const c = footprintCenter(TH.gridPosition, TH.footprint.w, TH.footprint.h);
  const cfg = LANDMARK_ART.treehouse_hideaway;

  it("loads the pair when both halves load (unchanged geometry and depth)", async () => {
    const t = th(await renderer([]));
    expect(urlOf(t.back)).toMatch(/treehouse\.webp$/);
    expect(urlOf(t.front)).toMatch(/treehouse-front\.webp$/);
    expect(t.bundle.containers.length).toBe(2);
    expect(t.mark.depthKey).toBeCloseTo(c.y - cfg.backInset! * cfg.scale + 0.05, 3);
    expect(t.bundle.containers[0].zIndex).toBeCloseTo(t.mark.depthKey, 3);
  });

  it("front fails → the COMPLETE master alone, no front, no lowered depth", async () => {
    const t = th(await renderer(["treehouse-front.webp"]));
    expect(urlOf(t.back), "the cut back layer must not be shown alone").toMatch(/treehouse-full\.webp$/);
    expect(t.front).toBeUndefined();
    expect(t.bundle.containers.length, "a front container appeared without a front").toBe(1);
    expect(t.mark.depthKey, "forest pin must follow the art, not the config").toBeUndefined();
    expect(t.bundle.containers[0].zIndex).toBeCloseTo(c.y + 0.05, 3);
  });

  it("back fails → the COMPLETE master alone; the front fragment never escapes", async () => {
    const t = th(await renderer(["landmarks/treehouse.webp"]));
    expect(urlOf(t.back)).toMatch(/treehouse-full\.webp$/);
    expect(t.front).toBeUndefined();
    expect(t.bundle.containers.length).toBe(1);
  });

  it("front AND master fail → no texture: the code-drawn structure, not a fragment", async () => {
    const t = th(await renderer(["treehouse-front.webp", "treehouse-full.webp"]));
    expect(t.back).toBeUndefined();
    expect(t.front).toBeUndefined();
    expect(t.bundle.containers.length).toBe(1);
    expect(t.mark.depthKey).toBeUndefined();
  });

  it("leaves every other landmark's single sprite alone", async () => {
    const r = await renderer(["treehouse-front.webp"]);
    for (const z of sampleZones) if (z.key !== "treehouse_hideaway") {
      expect(urlOf(r.landmarkTextures.get(z.key))).toContain(LANDMARK_ART[z.key].url.split("/").pop());
      expect(r.landmarkFrontTextures.has(z.key)).toBe(false);
    }
  });
});
