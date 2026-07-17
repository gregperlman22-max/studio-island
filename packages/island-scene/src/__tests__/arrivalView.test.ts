// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";

/**
 * Arrival-boat PASSENGER contract: the Pete-baked covered boat ships as two
 * layers (hull-back / hull-front) and the player's chosen avatar rides between
 * them as a passenger.
 *   - render order is hull-back → rider → hull-front, so the near rail occludes
 *     the rider's legs and the cabin/Pete sit behind;
 *   - the rider is CONTENT-ANCHORED (true feet/centre pin, scaled by content
 *     height) and pinned to BOAT_ART.railX/railY relative to the waterline
 *     anchor; with no measured bounds it falls back to canvas-bottom anchoring;
 *   - no rider texture → the boat sails with Pete alone (free-build sail, or the
 *     avatar art failed to load);
 *   - tap-to-skip lands the whole layer level at the berth;
 *   - the rocking animation moves both hull layers + rider as one layer.
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
    rotation = 0;
    texture: unknown;
    addChild(...cs: Node[]) { this.children.push(...cs); return cs[0]; }
    destroy() {}
  }
  return { Container: Node, Sprite: Node, Texture: Node };
});

const { ArrivalView } = await import("../render/ArrivalView");
const { BOAT_ART } = await import("../render/zones");
const { registerContentBounds } = await import("../render/avatarTexture");

// tests peek at private sprites — go through `any` deliberately
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mk = (reducedMotion: boolean): any => new ArrivalView(reducedMotion);

const W = 800;
const H = 450;
const bgTex = { width: 1672, height: 941 } as never;
const boatBack = { width: 1124, height: 906 } as never;
const boatFront = { width: 1124, height: 906 } as never;
const riderTex = { width: 480, height: 640 } as never;

const s = (H * 0.29) / 906; // ArrivalView boatScale (off the hull-back height)
const bw = 1124 * s;
const bh = 906 * s;

describe("ArrivalView passenger between the hull layers", () => {
  it("renders hull-back → rider → hull-front", () => {
    const v = mk(false);
    v.enter(bgTex, boatBack, boatFront, W, H, "arrive", riderTex);
    const layer = v.boatLayer;
    expect(layer.children.indexOf(v.boatBack)).toBe(0);
    expect(layer.children.indexOf(v.rider)).toBe(1);
    expect(layer.children.indexOf(v.boatFront)).toBe(2);
  });

  it("content-anchors the rider (true feet/centre + content-height scale) at the rail", () => {
    const v = mk(false);
    registerContentBounds(riderTex, {
      centerX: 0.44, feetY: 0.85, topY: 0.11, contentW: 0.5, contentH: 0.74,
    });
    v.enter(bgTex, boatBack, boatFront, W, H, "arrive", riderTex);
    expect(v.rider.visible).toBe(true);
    expect(v.rider.anchor.x).toBeCloseTo(0.44, 5);
    expect(v.rider.anchor.y).toBeCloseTo(0.85, 5);
    expect(v.rider.scale.y).toBeCloseTo((BOAT_ART.riderHeight * bh) / (0.74 * 640), 5);
    expect(v.rider.position.x).toBeCloseTo((BOAT_ART.railX - BOAT_ART.anchorX) * bw, 5);
    expect(v.rider.position.y).toBeCloseTo((BOAT_ART.railY - BOAT_ART.anchorY) * bh, 5);
  });

  it("falls back to canvas-bottom anchoring when bounds are unmeasured", () => {
    const v = mk(false);
    const plain = { width: 480, height: 640 } as never; // never registered
    v.enter(bgTex, boatBack, boatFront, W, H, "arrive", plain);
    expect(v.rider.anchor.x).toBe(0.5);
    expect(v.rider.anchor.y).toBe(1);
    expect(v.rider.scale.y).toBeCloseTo((BOAT_ART.riderHeight * bh) / 640, 5);
  });

  it("sails with Pete alone when no rider texture is given", () => {
    const v = mk(false);
    v.enter(bgTex, boatBack, boatFront, W, H, "arrive");
    expect(v.rider.visible).toBe(false);
    expect(v.boatBack.visible).toBe(true);
    expect(v.boatFront.visible).toBe(true);
  });

  it("both hull layers anchor at the BOAT_ART waterline pin", () => {
    const v = mk(false);
    expect(v.boatBack.anchor.x).toBeCloseTo(BOAT_ART.anchorX, 5);
    expect(v.boatBack.anchor.y).toBeCloseTo(BOAT_ART.anchorY, 5);
    expect(v.boatFront.anchor.x).toBeCloseTo(BOAT_ART.anchorX, 5);
    expect(v.boatFront.anchor.y).toBeCloseTo(BOAT_ART.anchorY, 5);
  });

  it("skip() lands the layer at the berth, level", () => {
    const v = mk(false);
    v.enter(bgTex, boatBack, boatFront, W, H, "arrive", riderTex);
    v.update(0.5); // mid-sail, rocking
    expect(v.boatLayer.rotation).not.toBe(0);
    v.skip();
    expect(v.done).toBe(true);
    expect(v.boatLayer.rotation).toBe(0);
    expect(v.boatLayer.position.x).toBeCloseTo(W * 0.66, 5);
    expect(v.boatLayer.position.y).toBeCloseTo(H * 0.66, 5);
  });

  it("rocks the whole layer, never the hull layers or rider alone", () => {
    const v = mk(false);
    v.enter(bgTex, boatBack, boatFront, W, H, "arrive", riderTex);
    v.update(1.0);
    expect(v.boatLayer.rotation).not.toBe(0);
    expect(v.boatBack.rotation).toBe(0);
    expect(v.boatFront.rotation).toBe(0);
    expect(v.rider.rotation).toBe(0);
  });

  it("respects reduced motion: no rocking, passenger still present", () => {
    const v = mk(true);
    v.enter(bgTex, boatBack, boatFront, W, H, "arrive", riderTex);
    v.update(1.0);
    expect(v.boatLayer.rotation).toBe(0);
    expect(v.rider.visible).toBe(true);
  });
});
