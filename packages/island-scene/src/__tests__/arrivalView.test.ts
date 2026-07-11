// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";

/**
 * Arrival-boat rider contract: the player's chosen avatar rides the boat's
 * empty helm.
 *   - the rider sprite draws UNDER the boat sprite (wheel + hull occlude the
 *     body; the head shows above the wheel);
 *   - the rider's feet pin to BOAT_ART.helmX/helmY relative to the boat's
 *     waterline anchor, sized by BOAT_ART.riderHeight;
 *   - no rider texture → the boat sails riderless (free-build sail, or the
 *     avatar art failed to load);
 *   - tap-to-skip lands the whole layer level at the berth;
 *   - the rocking animation moves boat + rider as one layer.
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

// tests peek at private sprites — go through `any` deliberately
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mk = (reducedMotion: boolean): any => new ArrivalView(reducedMotion);

const W = 800;
const H = 450;
const bgTex = { width: 1672, height: 941 } as never;
const boatTex = { width: 716, height: 505 } as never;
const riderTex = { width: 480, height: 640 } as never;

describe("ArrivalView rider at the helm", () => {
  it("draws the rider under the boat so the wheel/hull occlude the body", () => {
    const v = mk(false);
    v.enter(bgTex, boatTex, W, H, "arrive", riderTex);
    const layer = v.boatLayer;
    expect(layer.children.indexOf(v.rider)).toBe(0);
    expect(layer.children.indexOf(v.boat)).toBe(1);
  });

  it("pins the rider's feet to the helm and sizes it by riderHeight", () => {
    const v = mk(false);
    v.enter(bgTex, boatTex, W, H, "arrive", riderTex);

    const s = (H * 0.29) / 505; // ArrivalView boatScale
    const bw = 716 * s;
    const bh = 505 * s;
    expect(v.rider.visible).toBe(true);
    expect(v.rider.anchor.y).toBe(1); // feet
    expect(v.rider.position.x).toBeCloseTo((BOAT_ART.helmX - BOAT_ART.anchorX) * bw, 5);
    expect(v.rider.position.y).toBeCloseTo((BOAT_ART.helmY - BOAT_ART.anchorY) * bh, 5);
    expect(v.rider.scale.y).toBeCloseTo((BOAT_ART.riderHeight * bh) / 640, 5);
  });

  it("sails riderless when no rider texture is given", () => {
    const v = mk(false);
    v.enter(bgTex, boatTex, W, H, "arrive");
    expect(v.rider.visible).toBe(false);
    expect(v.boat.visible).toBe(true);
  });

  it("boat anchors come from BOAT_ART (waterline pin)", () => {
    const v = mk(false);
    expect(v.boat.anchor.x).toBeCloseTo(BOAT_ART.anchorX, 5);
    expect(v.boat.anchor.y).toBeCloseTo(BOAT_ART.anchorY, 5);
  });

  it("skip() lands the layer at the berth, level", () => {
    const v = mk(false);
    v.enter(bgTex, boatTex, W, H, "arrive", riderTex);
    v.update(0.5); // mid-sail, rocking
    expect(v.boatLayer.rotation).not.toBe(0);
    v.skip();
    expect(v.done).toBe(true);
    expect(v.boatLayer.rotation).toBe(0);
    expect(v.boatLayer.position.x).toBeCloseTo(W * 0.66, 5);
    expect(v.boatLayer.position.y).toBeCloseTo(H * 0.66, 5);
  });

  it("rocks the whole layer (boat + rider together), never the boat alone", () => {
    const v = mk(false);
    v.enter(bgTex, boatTex, W, H, "arrive", riderTex);
    v.update(1.0);
    expect(v.boatLayer.rotation).not.toBe(0);
    expect(v.boat.rotation).toBe(0);
    expect(v.rider.rotation).toBe(0);
  });

  it("respects reduced motion: no rocking", () => {
    const v = mk(true);
    v.enter(bgTex, boatTex, W, H, "arrive", riderTex);
    v.update(1.0);
    expect(v.boatLayer.rotation).toBe(0);
    // rider still present — reduced motion trims animation, not the passenger
    expect(v.rider.visible).toBe(true);
  });
});
