// @vitest-environment jsdom
import { beforeAll, describe, expect, it, vi } from "vitest";
import { sampleLayout, sampleZones } from "../defaultLayout";
import { sproutPack } from "../theme-packs";
import type { AvatarInstance, ZoneInstance } from "../types";

/**
 * Review item 2 — the renderer's gesture boundary during the journey.
 *
 * A held press is how a child walks the corridor. If that same press is still
 * down when the journey reaches arrival, releasing it must NOT act as a tap on
 * the "Go inside" pill arrival has just drawn under the finger. This is proven
 * through SceneRenderer's real onPointerDown / onPointerUp — the decision the
 * review reproduced lives there, not in TravelView.handleTap — with the same
 * Pixi display-object mock the renderer's other tests use.
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

const W = 800, H = 600;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const avatar = (): AvatarInstance => ({
  id: "local", isLocal: true, position: { ...sampleLayout.spawnPoint },
  config: { species: "bunny", bodyColor: "#f3c1d6", accessoryKey: "none", displayColor: "#c47b9a" },
});
const ev = (x: number, y: number) => ({ global: { x, y }, pointerId: 1 }) as Any;

/** A REAL SceneRenderer with the Treehouse journey mounted and on its way. */
async function journeyUnderway() {
  const onZoneTap = vi.fn();
  const r: Any = new SceneRenderer({
    container: document.createElement("div"),
    reducedMotion: true,          // skips the picker and the boat cinematic
    hideTextLabels: false, audioEnabled: false, onZoneTap,
  });
  await r.init(sproutPack, sampleLayout, JSON.parse(JSON.stringify(sampleZones)) as ZoneInstance[], [avatar()], null);
  r.opts.reducedMotion = false;   // continuous travel: a held press walks
  r.travelZone = "treehouse_hideaway";
  const view: Any = r.ensureTravel();
  view.opts.reducedMotion = false;
  const props: Record<string, unknown> = {};
  for (const k of ["tree1", "tree2", "bush1", "bush2", "rock", "flower", "flowerBush", "grass"]) props[k] = { width: 512, height: 768 };
  view.kit = { props, destination: { width: 1024, height: 1024 }, bounds: new WeakMap() };
  view.setFriend({ width: 480, height: 640 }, "otter", true);
  view.setOlive({ width: 480, height: 640 });
  view.begin(W, H);
  const go = view.hits.find((h: { id: string }) => h.id === "lets-go").rect;
  view.handleTap(go.x + go.w / 2, go.y + go.h / 2);
  expect(view.phase).toBe("travel");
  return { r, view, onZoneTap };
}

beforeAll(() => { vi.spyOn(console, "info").mockImplementation(() => {}); });

describe("a walking hold cannot enter the room on release (review item 2)", () => {
  // The review's reproduction point: where "Go inside" will be drawn.
  const hold: [number, number] = [W / 2, H - 52];

  it("holds through arrival, releases, and the greeting is still up", async () => {
    const { r, view, onZoneTap } = await journeyUnderway();
    r.onPointerDown(ev(...hold));
    for (let i = 0; i < 2000 && view.phase === "travel"; i++) view.update(1 / 60);
    expect(view.phase, "the hold never carried the journey to arrival").toBe("arrival");
    // The pill is now under the finger, exactly as the review found.
    const pill = view.hits.find((h: { id: string }) => h.id === "enter-room").rect;
    expect(hold[0]).toBeGreaterThanOrEqual(pill.x);
    expect(hold[0]).toBeLessThanOrEqual(pill.x + pill.w);
    expect(hold[1]).toBeGreaterThanOrEqual(pill.y);
    expect(hold[1]).toBeLessThanOrEqual(pill.y + pill.h);

    r.onPointerUp(ev(...hold));

    expect(onZoneTap, "releasing the walk entered the room").not.toHaveBeenCalled();
    expect(view.active).toBe(true);
    expect(view.phase).toBe("arrival");
  });

  it("enters on a fresh press and release of Go inside", async () => {
    const { r, view, onZoneTap } = await journeyUnderway();
    r.onPointerDown(ev(...hold));
    for (let i = 0; i < 2000 && view.phase === "travel"; i++) view.update(1 / 60);
    r.onPointerUp(ev(...hold));
    expect(onZoneTap).not.toHaveBeenCalled();
    r.onPointerDown(ev(...hold));
    r.onPointerUp(ev(...hold));
    expect(onZoneTap).toHaveBeenCalledWith("treehouse_hideaway");
  });

  it("still treats an ordinary tap during travel as a tap", async () => {
    const { r, view } = await journeyUnderway();
    const map = view.hits.find((h: { id: string }) => h.id === "map-open").rect;
    r.onPointerDown(ev(map.x + 2, map.y + 2));
    r.onPointerUp(ev(map.x + 2, map.y + 2));
    expect(view.state.mapOpen).toBe(true);
  });

  it("still steps a reduced-motion journey one tap per waypoint", async () => {
    const { r, view } = await journeyUnderway();
    r.opts.reducedMotion = true;
    view.opts.reducedMotion = true;
    view.state = { ...view.state, reducedMotion: true };
    view.draw();
    const p0 = view.progress;
    const kg = view.hits.find((h: { id: string }) => h.id === "keep-going").rect;
    r.onPointerDown(ev(kg.x + kg.w / 2, kg.y + kg.h / 2));
    r.onPointerUp(ev(kg.x + kg.w / 2, kg.y + kg.h / 2));
    expect(view.progress).toBeGreaterThan(p0);
  });
});
