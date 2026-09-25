// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { sampleLayout, sampleZones } from "../defaultLayout";
import { sproutPack } from "../theme-packs";
import type { AvatarInstance, ZoneInstance } from "../types";

/**
 * The boat opening wired into the REAL entry path: picker → opening → dock →
 * Island. Proven on a real SceneRenderer with the renderer's Pixi mock,
 * Assets.load made to reject chosen URLs, and the frame loop driven by hand.
 *
 *   - the opening's four textures are ONE kit: any one failing → the complete
 *     covered-boat cinematic (its own verified pair); that failing too → the
 *     avatar lands on the dock with no cinematic. Never a fragment, never a
 *     stuck entry;
 *   - the child's SELECTED friend rides — and a different friend on re-entry;
 *   - tap-to-skip completes once: one dock placement, one welcome, input live;
 *   - reduced motion reaches the same Island entry with no cinematic at all.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
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
      p.set(1, 1);
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
    addChildAt(c: Node) {
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
    static EMPTY = texture();
    static from = () => texture();
    destroy() {}
  }
  class BlurFilter {
    strength = 0;
    constructor(o?: { strength?: number }) {
      this.strength = o?.strength ?? 0;
    }
    destroy() {}
  }
  class Application {
    canvas = document.createElement("canvas");
    stage = new Container();
    renderer = { background: { color: 0 }, generateTexture: () => texture() };
    screen = { width: 800, height: 600 };
    ticker = { add: () => {}, remove: () => {} };
    async init() {}
    render() {}
    resize() {}
    destroy() {}
  }
  // URL-aware: a test lists which URL fragments must FAIL to load.
  const Assets = {
    load: async (url: string) => {
      const failing = (globalThis as Any).__failUrls as string[] | undefined;
      if (failing?.some((f) => url.includes(f))) throw new Error("blocked: " + url);
      // Stalled: a request that stays pending until the test settles it by hand.
      const stalling = (globalThis as Any).__stallUrls as string[] | undefined;
      if (stalling?.some((f) => url.includes(f))) {
        return new Promise((resolve, reject) => {
          (globalThis as Any).__stalled.push({
            url,
            resolve: () => resolve({ ...texture(), url }),
            reject: () => reject(new Error("late failure: " + url)),
          });
        });
      }
      return { ...texture(), url };
    },
  };
  return { Application, Assets, BlurFilter, Container, Graphics, Rectangle, Sprite, Text, Texture };
});
vi.mock("../render/avatarTexture", () => ({
  // Each friend's texture carries its URL, so a test can tell WHICH friend rides.
  loadAvatarTexture: async (url: string) => ({ width: 100, height: 100, url }),
  getContentBounds: () => undefined,
  registerContentBounds: () => {},
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
const { BoatOpeningView, APPROACH, SETTLE } = await import("../render/BoatOpeningView");
const { ArrivalView } = await import("../render/ArrivalView");
const { avatarImageUrl } = await import("../render/avatarCatalog");
const { OPENING_ART } = await import("../render/openingArt");

const OPENING = [
  "opening-environment.webp",
  "opening/boat-back.webp",
  "opening/boat-front.webp",
  "captain-pete.webp",
];
const OLD_BOAT = ["boat-covered-back.webp", "boat-covered-front.webp"];

const avatar = (imageUrl?: string): AvatarInstance => ({
  id: "local",
  isLocal: true,
  position: { ...sampleLayout.spawnPoint },
  config: {
    species: "bunny",
    bodyColor: "#f3c1d6",
    accessoryKey: "none",
    displayColor: "#c47b9a",
    imageUrl,
  },
});
async function renderer(
  failUrls: string[],
  opts: { reducedMotion?: boolean; imageUrl?: string } = {},
) {
  (globalThis as Any).__failUrls = failUrls;
  const r: Any = new SceneRenderer({
    container: document.createElement("div"),
    reducedMotion: !!opts.reducedMotion,
    hideTextLabels: false,
    audioEnabled: false,
  });
  await r.init(
    sproutPack,
    sampleLayout,
    JSON.parse(JSON.stringify(sampleZones)) as ZoneInstance[],
    [avatar(opts.imageUrl)],
    null,
  );
  // The welcome card's art loads lazily; count the calls, don't draw it.
  r.guideCalls = 0;
  r.showGuide = () => {
    r.guideCalls++;
  };
  return r;
}
const frame = (r: Any, ms = 16) => r.update({ deltaMS: ms });
const run = (r: Any, seconds: number) => {
  for (let i = 0; i < Math.ceil(seconds / 0.05); i++) frame(r, 50);
};
const tap = (r: Any) => r.onPointerDown({ global: { x: 400, y: 300 }, pointerId: 1, button: 0 });
const localView = (r: Any) => r.avatarViews.get("local");
const urlOf = (t: Any) => String(t?.url ?? "");
/** The passenger's texture, whichever cinematic is playing. */
const riderUrl = (v: Any) => urlOf((v.friend ?? v.rider).texture);

beforeAll(() => {
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
});
beforeEach(() => {
  (globalThis as Any).__failUrls = [];
  (globalThis as Any).__stallUrls = [];
  (globalThis as Any).__stalled = [];
});

describe("Boat opening — picker → opening → dock → Island", () => {
  it("plays the approved opening with the friend the child picked, then lands and greets once", async () => {
    const r = await renderer([]);
    expect(r.arrival).toBe("select");
    expect(r.openingKit).toBeDefined();
    r.onAvatarChosen("dog");
    expect(r.arrival).toBe("cinematic");
    expect(r.arrivalView).toBeInstanceOf(BoatOpeningView);
    expect(riderUrl(r.arrivalView)).toBe(avatarImageUrl("dog"));
    expect(localView(r).container.visible, "the world avatar waits aboard").toBe(false);

    run(r, APPROACH + SETTLE + 0.1);
    expect(r.arrival).toBe("fade");
    expect(localView(r).container.visible).toBe(true);
    run(r, 0.9);
    expect(r.arrival).toBe("done");
    expect(r.arrivalView).toBeUndefined();
    expect(r.guideCalls, "Captain Pete's welcome").toBe(1);
    expect(r.inputLive()).toBe(true);
  });

  it("a different friend rides on another pick, and on re-entry with a saved friend", async () => {
    const a = await renderer([]);
    a.onAvatarChosen("otter");
    expect(riderUrl(a.arrivalView)).toBe(avatarImageUrl("otter"));
    // Re-entry (the host remounts with the saved pick): no picker, straight to sea.
    const b = await renderer([], { imageUrl: avatarImageUrl("cat")! });
    expect(b.arrival).toBe("cinematic");
    expect(b.avatarSelect).toBeUndefined();
    expect(b.arrivalView).toBeInstanceOf(BoatOpeningView);
    expect(riderUrl(b.arrivalView)).toBe(avatarImageUrl("cat"));
  });

  it("tap-to-skip lands at once: one dock placement, one welcome, no stale view, input live", async () => {
    const r = await renderer([]);
    r.onAvatarChosen("dog");
    frame(r);
    const view = r.arrivalView;
    const destroy = vi.spyOn(view, "destroy");
    const dock = vi.spyOn(r, "placeAvatarOnDock");
    tap(r);
    tap(r); // a second tap in the same frame is harmless
    expect(view.done).toBe(true);
    frame(r);
    expect(r.arrival).toBe("fade");
    tap(r); // taps during the fade do not restart or re-skip anything
    run(r, 0.9);
    expect(r.arrival).toBe("done");
    expect(dock).toHaveBeenCalledTimes(1);
    expect(destroy).toHaveBeenCalledTimes(1);
    expect(r.arrivalView).toBeUndefined();
    run(r, 1);
    expect(r.guideCalls).toBe(1);
    expect(dock).toHaveBeenCalledTimes(1);
    expect(r.inputLive()).toBe(true);
  });

  it("reduced motion: the pick goes straight to the dock — no cinematic, same Island entry", async () => {
    const r = await renderer([], { reducedMotion: true });
    expect(r.arrival).toBe("select");
    r.onAvatarChosen("dog");
    expect(r.arrival).toBe("done");
    expect(r.arrivalView).toBeUndefined();
    expect(localView(r).container.visible).toBe(true);
    frame(r);
    expect(r.guideCalls).toBe(1);
    expect(r.inputLive()).toBe(true);
  });

  it("reduced motion on re-entry: no picker, no cinematic, on the dock", async () => {
    const r = await renderer([], { reducedMotion: true, imageUrl: avatarImageUrl("cat")! });
    expect(r.arrival).toBe("done");
    expect(r.arrivalView).toBeUndefined();
    expect(localView(r).container.visible).toBe(true);
  });
});

describe("Boat opening — a failed layer never shows a fragment or traps entry", () => {
  for (const fail of OPENING) {
    it(`${fail} fails → the complete covered-boat cinematic, with the chosen friend`, async () => {
      const r = await renderer([fail]);
      expect(r.openingKit, "no partial kit").toBeUndefined();
      expect(urlOf(r.boatBackTex)).toMatch(/boat-covered-back\.webp$/);
      expect(urlOf(r.boatFrontTex)).toMatch(/boat-covered-front\.webp$/);
      r.onAvatarChosen("dog");
      expect(r.arrivalView).toBeInstanceOf(ArrivalView);
      expect(riderUrl(r.arrivalView)).toBe(avatarImageUrl("dog"));
      // Its own draw order: hull-back → rider → hull-front.
      const layer = r.arrivalView.boatLayer;
      expect(
        layer.children.map((c: Any) =>
          c === r.arrivalView.boatBack
            ? "back"
            : c === r.arrivalView.rider
              ? "rider"
              : c === r.arrivalView.boatFront
                ? "front"
                : "?",
        ),
      ).toEqual(["back", "rider", "front"]);
      tap(r);
      frame(r);
      run(r, 0.9);
      expect(r.arrival).toBe("done");
      expect(r.guideCalls).toBe(1);
      expect(r.inputLive()).toBe(true);
    });
  }

  it("the opening kit loads → the old boat pair is not downloaded at all", async () => {
    const r = await renderer([]);
    expect(r.boatBackTex).toBeUndefined();
    expect(r.boatFrontTex).toBeUndefined();
  });

  it("opening AND covered boat fail → the avatar lands on the dock, no cinematic", async () => {
    const r = await renderer(["opening/boat-front.webp", ...OLD_BOAT]);
    expect(r.openingKit).toBeUndefined();
    expect(r.boatFrontTex).toBeUndefined();
    r.onAvatarChosen("dog");
    expect(r.arrival).toBe("done");
    expect(r.arrivalView).toBeUndefined();
    expect(localView(r).container.visible).toBe(true);
    frame(r);
    expect(r.guideCalls).toBe(1);
    expect(r.inputLive()).toBe(true);
  });

  it("the friend's art failed → the boat still docks, with Captain Pete alone", async () => {
    const r = await renderer([]);
    r.avatarTextures.clear();
    r.onAvatarChosen("dog");
    expect(r.arrivalView).toBeInstanceOf(BoatOpeningView);
    expect(r.arrivalView.friend.visible).toBe(false);
    run(r, APPROACH + SETTLE + 1);
    expect(r.arrival).toBe("done");
  });
});

describe("Boat opening — stalled requests cannot hold entry", () => {
  const { openingMs, fallbackMs } = OPENING_ART.loadDeadline;
  const stalled = () =>
    (globalThis as Any).__stalled as { url: string; resolve(): void; reject(): void }[];
  /** Start init WITHOUT awaiting it; the frame loop and timers are driven by hand. */
  function start(stall: string[], opts: { imageUrl?: string } = {}) {
    (globalThis as Any).__stallUrls = stall;
    const r: Any = new SceneRenderer({
      container: document.createElement("div"),
      reducedMotion: false,
      hideTextLabels: false,
      audioEnabled: false,
    });
    const state = { done: false };
    const init = r
      .init(
        sproutPack,
        sampleLayout,
        JSON.parse(JSON.stringify(sampleZones)) as ZoneInstance[],
        [avatar(opts.imageUrl)],
        null,
      )
      .then(() => {
        state.done = true;
      });
    r.guideCalls = 0;
    r.showGuide = () => {
      r.guideCalls++;
    };
    return { r, init, state };
  }

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("an opening request that never settles → the covered boat after the opening deadline", async () => {
    const { r, state } = start(["opening/boat-front.webp"]);
    await vi.advanceTimersByTimeAsync(openingMs - 1);
    expect(state.done, "still inside the deadline: entry waits").toBe(false);
    expect(stalled().map((x) => x.url)).toEqual([
      expect.stringContaining("opening/boat-front.webp"),
    ]);
    await vi.advanceTimersByTimeAsync(1);
    expect(state.done, "bounded: entry proceeds at the deadline").toBe(true);
    expect(r.openingKit).toBeUndefined();
    expect(r.boatBackTex).toBeDefined();
    expect(r.arrival).toBe("select");
    r.onAvatarChosen("dog");
    expect(r.arrivalView).toBeInstanceOf(ArrivalView);
    tap(r);
    frame(r);
    run(r, 0.9);
    expect(r.arrival).toBe("done");
    expect(r.guideCalls).toBe(1);
    expect(r.inputLive()).toBe(true);
  });

  it("opening AND fallback stalled → dock entry after both deadlines, no cinematic", async () => {
    const { r, state } = start(["opening/boat-front.webp", "boat-covered-front.webp"]);
    await vi.advanceTimersByTimeAsync(openingMs + fallbackMs - 1);
    expect(state.done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(state.done).toBe(true);
    expect(r.openingKit).toBeUndefined();
    expect(r.boatFrontTex).toBeUndefined();
    r.onAvatarChosen("dog");
    expect(r.arrival).toBe("done");
    expect(r.arrivalView).toBeUndefined();
    expect(localView(r).container.visible).toBe(true);
    frame(r);
    expect(r.guideCalls).toBe(1);
    expect(r.inputLive()).toBe(true);
  });

  it("a stalled arrival background is bounded too (picker falls back to its wash)", async () => {
    const { r, state } = start(["arrival-bg"]);
    await vi.advanceTimersByTimeAsync(openingMs + fallbackMs);
    expect(state.done).toBe(true);
    expect(r.arrivalBgTex).toBeUndefined();
    expect(r.openingKit, "the opening kit does not need the old backdrop").toBeDefined();
    expect(r.arrival).toBe("select");
  });

  it("late resolution after the deadline never revives a cinematic or a second entry", async () => {
    const { r } = start(["opening/boat-front.webp", "boat-covered-front.webp"], {
      imageUrl: avatarImageUrl("cat")!,
    });
    await vi.advanceTimersByTimeAsync(openingMs + fallbackMs);
    // Re-entry with a saved friend: no picker, and no boat art → straight to the dock.
    expect(r.arrival).toBe("done");
    frame(r);
    expect(r.guideCalls).toBe(1);
    const dock = vi.spyOn(r, "placeAvatarOnDock");
    for (const s of stalled()) s.resolve(); // the stalled requests finally land
    await vi.advanceTimersByTimeAsync(1000);
    expect(r.openingKit).toBeUndefined();
    expect(r.boatFrontTex).toBeUndefined();
    run(r, 2);
    expect(r.arrival).toBe("done");
    expect(r.arrivalView).toBeUndefined();
    expect(dock).not.toHaveBeenCalled();
    expect(r.guideCalls).toBe(1);
  });

  it("destroyed while a request is stalled → nothing is built, and late results are ignored", async () => {
    const { r, init, state } = start(["opening/boat-front.webp"]);
    await vi.advanceTimersByTimeAsync(1000);
    r.destroy();
    await vi.advanceTimersByTimeAsync(openingMs + fallbackMs);
    await init;
    expect(state.done).toBe(true);
    for (const s of stalled()) s.resolve();
    await vi.advanceTimersByTimeAsync(1000);
    expect(r.openingKit).toBeUndefined();
    expect(r.avatarSelect, "no picker after destroy").toBeUndefined();
    expect(r.arrivalView, "no cinematic after destroy").toBeUndefined();
  });

  it("a stalled request that later FAILS is harmless too", async () => {
    const { r, state } = start(["opening/boat-front.webp"]);
    await vi.advanceTimersByTimeAsync(openingMs);
    expect(state.done).toBe(true);
    for (const s of stalled()) s.reject();
    await vi.advanceTimersByTimeAsync(1000);
    expect(r.boatBackTex).toBeDefined();
    expect(r.arrival).toBe("select");
  });
});
