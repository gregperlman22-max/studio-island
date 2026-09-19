// @vitest-environment jsdom
import { beforeAll, describe, expect, it, vi } from "vitest";
import { sampleLayout, sampleZones } from "../defaultLayout";
import { sproutPack } from "../theme-packs";
import type { AvatarInstance, ZoneInstance } from "../types";
import { footprintCenter, tileCenter } from "../render/iso";

/**
 * The Treehouse exterior as a BACK/FRONT pair — the depth contract.
 *
 * Both layers were cut from one 1024 master (tools/island-art/
 * treehouse-layers.mjs), so they share anchor and scale by construction. What
 * the renderer adds is LOCAL depth: the back layer sorts on the row where the
 * trunk meets the ground, the front layer on the stair-foot / root-tip row,
 * and a Friend whose feet are between them draws between them. Proven here on
 * a real SceneRenderer with the same Pixi mock the renderer's other tests use.
 */
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
  const Assets = { load: async () => texture() };
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
const { LANDMARK_ART, buildZoneScene } = await import("../render/zones");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const TH = sampleZones.find((z) => z.key === "treehouse_hideaway")!;
const avatar = (pos: { x: number; y: number }): AvatarInstance => ({
  id: "local", isLocal: true, position: pos,
  config: { species: "bunny", bodyColor: "#f3c1d6", accessoryKey: "none", displayColor: "#c47b9a" },
});

async function renderer(pos: { x: number; y: number }) {
  const r: Any = new SceneRenderer({
    container: document.createElement("div"),
    reducedMotion: true, hideTextLabels: false, audioEnabled: false,
  });
  await r.init(sproutPack, sampleLayout, JSON.parse(JSON.stringify(sampleZones)) as ZoneInstance[], [avatar(pos)], null);
  return r;
}

beforeAll(() => { vi.spyOn(console, "info").mockImplementation(() => {}); });

describe("the Treehouse layer pair", () => {
  const cfg = LANDMARK_ART.treehouse_hideaway;

  it("is registered as a pair cut from one canvas, measured off the master", () => {
    expect(cfg.frontUrl).toMatch(/treehouse-front\.webp$/);
    expect(cfg.url).toMatch(/treehouse\.webp$/);
    // The master's alpha > 16 bbox, [x0, y0, x1, y1) — tools/island-art/source/treehouse-master-2026-09-19/metadata.json
    expect(cfg.contentBox).toEqual([110, 59, 922, 920]);
    expect(cfg.contentH).toBe(861);
    expect(cfg.anchorX).toBeCloseTo(516 / 1024, 3);
    expect(cfg.anchorY).toBeCloseTo(920 / 1024, 3);
    expect(cfg.backInset).toBeGreaterThan(0);
  });

  it("gives the front sprite the back sprite's anchor and scale, never its own", () => {
    const back = { width: 1024, height: 1024 }, front = { width: 1024, height: 1024 };
    const scene: Any = buildZoneScene(TH, sproutPack, back as Any, front as Any);
    expect(scene.front).toBeTruthy();
    const bs = scene.container.children[0].children[0];
    const fs = scene.front.children[0].children[0];
    expect(fs.anchor).toEqual(bs.anchor);
    expect(fs.scale).toEqual(bs.scale);
    expect(fs.texture).toBe(front);
    // No front texture → no front container. (The renderer only ever passes a
    // COMPLETE texture here without a front — the full master — never the cut
    // back layer; see treehouseFallback.test.ts.)
    expect(buildZoneScene(TH, sproutPack, back as Any).front).toBeUndefined();
  });

  it("sorts a Friend between the layers when their feet are between the two rows", async () => {
    const c = footprintCenter(TH.gridPosition, TH.footprint.w, TH.footprint.h);
    const inset = cfg.backInset! * cfg.scale;
    // A tile whose row lies between the trunk base (c.y - inset) and the base (c.y).
    const between = { x: 13, y: 18 };
    const bY = tileCenter(between.x, between.y).y;
    expect(bY).toBeGreaterThan(c.y - inset);
    expect(bY).toBeLessThan(c.y);

    const r = await renderer(between);
    const bundle = r.zoneBundles.get("treehouse_hideaway");
    const [back, front] = bundle.containers;
    expect(front, "no front container in the treehouse bundle").toBeTruthy();
    expect(back.zIndex).toBeCloseTo(c.y - inset + 0.05, 3);
    expect(front.zIndex).toBeCloseTo(c.y + 0.05, 3);
    // Both live in the shared y-sorted entities layer — nothing is globally topmost.
    expect(r.entities.children).toContain(back);
    expect(r.entities.children).toContain(front);

    const view = r.avatarViews.get("local");
    expect(view.container.zIndex).toBeGreaterThan(back.zIndex);
    expect(view.container.zIndex).toBeLessThan(front.zIndex);
  });

  it("tells the island to pin its forest behind the back layer's row", async () => {
    // The treehouse forest is composed behind the treehouse by intent. With the
    // back layer sorting on the trunk row, a forest tree whose base lands south
    // of that row would otherwise draw over the trunk and the stairs.
    const r = await renderer({ x: 16, y: 21 });
    const c = footprintCenter(TH.gridPosition, TH.footprint.w, TH.footprint.h);
    const mark = r.landmarkMarks().find((m: { key: string }) => m.key === "treehouse_hideaway");
    expect(mark.depthKey).toBeCloseTo(c.y - cfg.backInset! * cfg.scale + 0.05, 3);
    expect(mark.depthKey).toBeLessThan(mark.y);
    // No other landmark carries one — the pin is local to the treehouse.
    for (const m of r.landmarkMarks()) if (m.key !== "treehouse_hideaway") expect(m.depthKey).toBeUndefined();
  });

  it("sorts a Friend south of the base in front of both, and north of the trunk behind both", async () => {
    const c = footprintCenter(TH.gridPosition, TH.footprint.w, TH.footprint.h);
    const inset = cfg.backInset! * cfg.scale;
    const south = await renderer({ x: 16, y: 21 });
    const [sb, sf] = south.zoneBundles.get("treehouse_hideaway").containers;
    const sv = south.avatarViews.get("local").container.zIndex;
    expect(sv).toBeGreaterThan(sf.zIndex);
    expect(sv).toBeGreaterThan(sb.zIndex);

    const north = await renderer({ x: 12, y: 16 });
    const [nb, nf] = north.zoneBundles.get("treehouse_hideaway").containers;
    const nv = north.avatarViews.get("local").container.zIndex;
    expect(nv).toBeLessThan(nb.zIndex);
    expect(nv).toBeLessThan(nf.zIndex);
    expect(tileCenter(12, 16).y).toBeLessThan(c.y - inset);
  });
});
