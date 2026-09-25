// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * BoatOpeningView contract (the approved boat opening, 2026-09-24):
 *   - draw order: plate → boat [back layer → Captain Pete → Friend → front
 *     layer], so the near hull covers both passengers' lower bodies;
 *   - boat and passengers share ONE transform — only the boat container moves,
 *     scales and rocks; the layers and passengers never move inside it;
 *   - the Friend is content-anchored (true feet / centre, content-height
 *     scale), falls back to canvas-bottom anchoring, and is hidden (Pete sails
 *     alone) with no texture;
 *   - the approach decelerates into the berth and completes level;
 *   - tap-to-skip lands at the same level berth pose, once;
 *   - reduced motion: at the berth from the first frame, no rocking;
 *   - framing: the plate covers landscape screens; portrait keeps the whole
 *     boat, both passengers and the landing edge in view.
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
    position = new Pt();
    scale = (() => {
      const p = new Pt();
      p.set(1, 1);
      return p;
    })();
    anchor = new Pt();
    pivot = new Pt();
    visible = true;
    alpha = 1;
    rotation = 0;
    tint = 0xffffff;
    filters: unknown[] = [];
    texture: unknown;
    destroyed = false;
    get x() {
      return this.position.x;
    }
    set x(v: number) {
      this.position.x = v;
    }
    get y() {
      return this.position.y;
    }
    set y(v: number) {
      this.position.y = v;
    }
    addChild(...cs: Node[]) {
      this.children.push(...cs);
      return cs[0];
    }
    destroy() {
      this.destroyed = true;
    }
  }
  class BlurFilter {
    strength = 0;
    strengthX = 0;
    strengthY = 0;
    destroyed = false;
    destroy() {
      this.destroyed = true;
    }
  }
  class Rectangle {
    constructor(
      public x = 0,
      public y = 0,
      public width = 0,
      public height = 0,
    ) {}
  }
  class Texture {
    static EMPTY = new Texture();
    /** A texture over a canvas the view painted (the portrait sky). */
    static from(canvas: unknown) {
      return new Texture({ source: { canvas } });
    }
    source: unknown;
    frame: unknown;
    destroyed = false;
    sourceDestroyed = false;
    constructor(o?: { source?: unknown; frame?: unknown }) {
      this.source = o?.source;
      this.frame = o?.frame;
    }
    destroy(destroySource = false) {
      this.destroyed = true;
      this.sourceDestroyed = destroySource;
    }
  }
  return { BlurFilter, Container: Node, Rectangle, Sprite: Node, Texture };
});

const { BoatOpeningView, APPROACH, SETTLE } = await import("../render/BoatOpeningView");
const { OPENING_ART } = await import("../render/openingArt");
const { registerContentBounds } = await import("../render/avatarTexture");

// tests peek at private sprites — go through `any` deliberately
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const kit = {
  environment: { width: 1671, height: 941 },
  boatBack: { width: 1254, height: 1254 },
  boatFront: { width: 1254, height: 1254 },
  captain: { width: 1145, height: 1374 },
} as never;
const friendTex = () => ({ width: 480, height: 640 }) as never;
const mk = (rm = false, w = 1280, h = 800, tex: unknown = friendTex()): Any => {
  const v: Any = new BoatOpeningView(rm);
  v.enter(kit, w, h, tex);
  return v;
};
const run = (v: Any, seconds: number, dt = 1 / 60) => {
  for (let t = 0; t < seconds; t += dt) v.update(dt);
};
const pose = (v: Any) => ({
  x: v.boat.position.x,
  y: v.boat.position.y,
  s: v.boat.scale.x,
  r: v.boat.rotation,
});
const berth = {
  x: OPENING_ART.to.x + OPENING_ART.pivot.x * OPENING_ART.to.s,
  y: OPENING_ART.to.y + OPENING_ART.pivot.y * OPENING_ART.to.s,
  s: OPENING_ART.to.s,
};
const expectAtBerth = (v: Any) => {
  const p = pose(v);
  expect(p.x).toBeCloseTo(berth.x, 6);
  expect(p.y).toBeCloseTo(berth.y, 6);
  expect(p.s).toBeCloseTo(berth.s, 6);
  expect(Math.abs(p.r)).toBe(0);
};

describe("BoatOpeningView layering", () => {
  it("draws plate → boat, and inside the boat back → Pete → Friend → front", () => {
    const v = mk();
    expect(v.stage.children).toEqual([v.sky, v.env, v.boat]);
    expect(v.boat.children).toEqual([v.boatBack, v.captain, v.friend, v.boatFront]);
    expect(v.container.children).toEqual([v.stage]);
    expect(v.boatBack.texture).toBe((kit as Any).boatBack);
    expect(v.boatFront.texture).toBe((kit as Any).boatFront);
    expect(v.env.texture).toBe((kit as Any).environment);
  });

  it("both layers share the boat canvas: same origin, no offset or scale of their own", () => {
    const v = mk();
    run(v, 2);
    for (const s of [v.boatBack, v.boatFront]) {
      expect([
        s.position.x,
        s.position.y,
        s.scale.x,
        s.scale.y,
        s.anchor.x,
        s.anchor.y,
        s.rotation,
      ]).toEqual([0, 0, 1, 1, 0, 0, 0]);
    }
  });

  it("ONE transform: only the boat container moves; passengers stay put inside it", () => {
    const v = mk();
    const inside = () =>
      [v.captain, v.friend].map((s: Any) => [s.position.x, s.position.y, s.scale.x, s.rotation]);
    const before = inside();
    const p0 = pose(v);
    run(v, 1.5);
    expect(inside()).toEqual(before);
    expect(pose(v).x).not.toBeCloseTo(p0.x, 1);
  });

  it("places Captain Pete by the study's own foot point at the stern", () => {
    const v = mk();
    const c = OPENING_ART.captain;
    expect(v.captain.anchor.x).toBeCloseTo(c.anchorX, 6);
    expect(v.captain.anchor.y).toBeCloseTo(c.anchorY, 6);
    expect([v.captain.position.x, v.captain.position.y, v.captain.scale.x]).toEqual([
      c.x,
      c.y,
      c.scale,
    ]);
  });
});

describe("BoatOpeningView passenger", () => {
  it("content-anchors the selected Friend (true feet / centre, content-height scale)", () => {
    const tex = friendTex();
    registerContentBounds(tex, {
      centerX: 0.44,
      feetY: 0.85,
      topY: 0.11,
      contentW: 0.5,
      contentH: 0.74,
    });
    const v = mk(false, 1280, 800, tex);
    const f = OPENING_ART.friend;
    expect(v.friend.visible).toBe(true);
    expect(v.friend.texture).toBe(tex);
    expect(v.friend.anchor.x).toBeCloseTo(0.44, 6);
    expect(v.friend.anchor.y).toBeCloseTo(0.85, 6);
    expect(v.friend.scale.x).toBeCloseTo(f.contentHeight / (0.74 * 640), 6);
    expect([v.friend.position.x, v.friend.position.y]).toEqual([f.x, f.y]);
  });

  it("without measured bounds: canvas-bottom anchoring at the same spot", () => {
    const v = mk();
    expect([v.friend.anchor.x, v.friend.anchor.y]).toEqual([0.5, 1]);
    expect(v.friend.scale.x).toBeCloseTo(OPENING_ART.friend.contentHeight / 640, 6);
  });

  it("no Friend texture → Pete sails alone, and the view still completes", () => {
    const v: Any = new BoatOpeningView(false);
    v.enter(kit, 1280, 800, undefined);
    expect(v.friend.visible).toBe(false);
    expect(v.captain.visible).toBe(true);
    run(v, APPROACH + SETTLE + 0.1);
    expect(v.done).toBe(true);
  });

  it("re-entering with another Friend swaps the passenger", () => {
    const v = mk();
    const other = { width: 300, height: 300 } as never;
    const sky = v.sky.texture;
    v.enter(kit, 1280, 800, other);
    expect(sky.destroyed, "the previous sky texture is released").toBe(true);
    expect(v.friend.texture).toBe(other);
    expect(v.done).toBe(false);
  });
});

describe("BoatOpeningView motion", () => {
  it("decelerates: each second covers less distance than the one before", () => {
    const v = mk();
    const xs = [pose(v).x];
    for (let i = 0; i < 5; i++) {
      run(v, 1);
      xs.push(pose(v).x);
    }
    const steps = xs.slice(1).map((x, i) => x - xs[i]);
    for (const d of steps) expect(d).toBeGreaterThan(0);
    for (let i = 1; i < steps.length; i++) expect(steps[i]).toBeLessThan(steps[i - 1]);
  });

  it("rocking stays restrained (≤ 2.5 stage px, ≤ 0.5°)", () => {
    const v = mk();
    let maxRoll = 0;
    for (let t = 0; t < APPROACH + SETTLE; t += 1 / 60) {
      v.update(1 / 60);
      maxRoll = Math.max(maxRoll, Math.abs(v.boat.rotation));
    }
    expect(maxRoll).toBeLessThanOrEqual((0.5 * Math.PI) / 180);
  });

  it("completes after the approach + settle, level at the berth, and stays there", () => {
    const v = mk();
    run(v, APPROACH + SETTLE - 0.05);
    expect(v.done).toBe(false);
    run(v, 0.1);
    expect(v.done).toBe(true);
    expectAtBerth(v);
    const p = pose(v);
    run(v, 1);
    expect(pose(v)).toEqual(p);
  });

  it("tap-to-skip lands level at the same berth pose, once", () => {
    const v = mk();
    run(v, 0.7);
    v.skip();
    expect(v.done).toBe(true);
    expectAtBerth(v);
    const p = pose(v);
    v.skip();
    v.update(0.5);
    expect(pose(v)).toEqual(p);
  });

  it("reduced motion: at the berth from the first frame, never rocking", () => {
    const v = mk(true);
    expectAtBerth(v);
    for (let i = 0; i < 120; i++) {
      v.update(1 / 60);
      expect(Math.abs(v.boat.rotation)).toBe(0);
      expect(v.boat.position.y).toBeCloseTo(berth.y, 6);
    }
  });
});

describe("BoatOpeningView framing", () => {
  /** Stage-px span of the screen, given the stage transform. */
  const visible = (v: Any, w: number, h: number) => ({
    left: -v.stage.position.x / v.k,
    right: (w - v.stage.position.x) / v.k,
    top: -v.stage.position.y / v.k,
    bottom: (h - v.stage.position.y) / v.k,
  });

  for (const [w, h] of [
    [1280, 800],
    [1920, 1080],
    [1024, 768],
    [2560, 1080],
  ]) {
    it(`landscape ${w}x${h}: the plate covers the screen, nothing cut from the water or dock`, () => {
      const v = mk(false, w, h);
      for (const done of [false, true]) {
        if (done) v.skip();
        const r = visible(v, w, h);
        expect(r.left).toBeGreaterThanOrEqual(-1e-6);
        expect(r.right).toBeLessThanOrEqual(OPENING_ART.stage.w + 1e-6);
        expect(r.bottom).toBeCloseTo(OPENING_ART.stage.h, 6); // bottom-aligned: any crop is sky
        expect(v.sky.visible).toBe(false);
        expect(r.left).toBeLessThanOrEqual(OPENING_ART.essential.left);
        expect(r.right).toBeGreaterThanOrEqual(OPENING_ART.essential.right);
      }
    });
  }

  for (const [w, h] of [
    [390, 844],
    [768, 1024],
    [360, 640],
    [430, 932],
  ]) {
    it(`portrait ${w}x${h}: both passengers stay in view; the berth shows the landing edge`, () => {
      const v = mk(false, w, h);
      // Stage-px x of a boat-px point (roll is under half a degree).
      const stageX = (bx: number) =>
        v.boat.position.x + (bx - OPENING_ART.pivot.x) * v.boat.scale.x;
      for (let i = 0; i <= 6; i++) {
        const r = visible(v, w, h);
        for (const bx of [OPENING_ART.captain.x - 60, OPENING_ART.friend.x + 60]) {
          expect(stageX(bx)).toBeGreaterThan(r.left);
          expect(stageX(bx)).toBeLessThan(r.right);
        }
        run(v, 1);
      }
      v.skip();
      const r = visible(v, w, h);
      expect(r.left).toBeLessThanOrEqual(OPENING_ART.essential.left + 1e-6);
      expect(r.right).toBeGreaterThanOrEqual(OPENING_ART.essential.right - 1e-6);
      // The painting always meets the screen's bottom edge: no water or dock
      // band below it. Spare height (phone portrait) is sky above it only.
      expect(r.bottom).toBeCloseTo(OPENING_ART.stage.h, 6);
      const plateH = OPENING_ART.stage.h * v.k;
      const gap = plateH < h - 0.5;
      expect(v.sky.visible).toBe(gap);
      if (gap) {
        // No canvas here (jsdom): the fallback — the plate's top 2 rows (pure
        // sky), stretched up past the screen top, blurred sideways ONLY.
        expect(v.sky.texture.frame).toMatchObject({
          x: 0,
          y: 0,
          width: OPENING_ART.stage.w,
          height: 2,
        });
        expect(v.sky.filters).toEqual([v.blur]);
        expect(v.blur.strengthY).toBe(0);
        expect(v.blur.strengthX).toBeGreaterThan(0);
        expect(v.sky.scale.y).toBeGreaterThan(0); // stretched, not mirrored
        expect(v.sky.position.y).toBeLessThan(r.top); // reaches past the top
        expect(v.sky.position.y + v.sky.scale.y * 2).toBeGreaterThan(0); // tucked under the plate
      }
    });
  }

  it("resize mid-approach re-frames without restarting the approach", () => {
    const v = mk();
    run(v, 1);
    const p = pose(v);
    v.resize(390, 844);
    expect(pose(v).x).toBeCloseTo(p.x, 6);
    expect(v.done).toBe(false);
  });

  it("destroy releases the display tree and the one blur filter", () => {
    const v = mk(false, 390, 844);
    v.resize(400, 860); // reuses, never stacks, the filter
    const blur = v.blur;
    expect(v.sky.filters).toEqual([blur]);
    const strip = v.sky.texture;
    v.destroy();
    expect(v.container.destroyed).toBe(true);
    expect(blur.destroyed).toBe(true);
    // The fallback strip is released; the plate's shared source never is.
    expect([strip.destroyed, strip.sourceDestroyed]).toEqual([true, false]);
  });

  describe("with a 2D canvas: the sky painted from the plate's own top row", () => {
    const W = OPENING_ART.stage.w;
    let restore: () => void;
    beforeEach(() => {
      // A fake 2D context whose "plate top row" is a flat colour.
      const ctx = {
        drawImage: vi.fn(),
        getImageData: () => ({ data: new Uint8ClampedArray(W * 4).fill(200) }),
        putImageData: vi.fn(),
      };
      const spy = vi
        .spyOn(HTMLCanvasElement.prototype, "getContext")
        .mockImplementation(() => ctx as never);
      const hadImageData = "ImageData" in globalThis;
      if (!hadImageData)
        (globalThis as Any).ImageData = class {
          constructor(
            public data: Uint8ClampedArray,
            public width: number,
            public height: number,
          ) {}
        };
      restore = () => {
        spy.mockRestore();
        if (!hadImageData) delete (globalThis as Any).ImageData;
      };
    });
    afterEach(() => restore());
    const withImage = {
      ...(kit as Any),
      environment: { width: 1671, height: 941, source: { resource: {} } },
    };

    it("phone 390x844: painted sky, no blur, meets the plate edge exactly, reaches past the top", () => {
      const v: Any = new BoatOpeningView(false);
      v.enter(withImage, 390, 844, friendTex());
      const r = visible(v, 390, 844);
      expect(v.sky.visible).toBe(true);
      expect(v.sky.texture.source.canvas).toBeInstanceOf(HTMLCanvasElement);
      expect(v.sky.filters).toEqual([]);
      expect(v.blur).toBeUndefined();
      expect(v.sky.scale.x).toBe(1); // column for column with the plate
      const bottom = v.sky.position.y + v.sky.scale.y * 64;
      expect(bottom).toBeCloseTo(1, 6); // its edge row sits on the plate's top row
      expect(v.sky.position.y).toBeLessThan(r.top);
      // It owns its canvas: released with its source on destroy.
      const t = v.sky.texture;
      v.destroy();
      expect([t.destroyed, t.sourceDestroyed]).toEqual([true, true]);
    });

    it("desktop and tablet: no sky at all (the plate fills the screen)", () => {
      for (const [w, h] of [
        [1280, 800],
        [768, 1024],
      ]) {
        const v: Any = new BoatOpeningView(false);
        v.enter(withImage, w, h, friendTex());
        expect(v.sky.visible).toBe(false);
      }
    });
  });
});
