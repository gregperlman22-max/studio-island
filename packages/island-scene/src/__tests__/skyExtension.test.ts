import { describe, expect, it } from "vitest";
import { SKY_DEFAULTS, skyExtensionPixels } from "../render/skyExtension";

/**
 * The phone-portrait sky above the boat opening's painting is built from the
 * plate's own top row (render/skyExtension.ts):
 *   - its bottom row equals that edge exactly — no seam at the join;
 *   - above the short feather, it is the sideways-smoothed edge — a cloud wisp
 *     on the edge must not be stretched upward into a streak;
 *   - it deepens slightly toward the top (zenith), and is fully opaque.
 */
const W = 1671; // the plate's width: the smoothing radius is a share of it
const ROWS = 64;
/** A sky-blue edge row with one bright 12-px wisp, like the plate's. */
function edgeRow(): Uint8ClampedArray {
  const e = new Uint8ClampedArray(W * 4);
  for (let x = 0; x < W; x++) {
    const wisp = x >= 100 && x < 112;
    e.set(wisp ? [200, 220, 245, 255] : [30 + x / 10, 140, 244, 255], x * 4);
  }
  return e;
}
const px = (out: Uint8ClampedArray, x: number, y: number) =>
  Array.from(out.slice((y * W + x) * 4, (y * W + x) * 4 + 4));

describe("skyExtensionPixels", () => {
  const edge = edgeRow();
  const out = skyExtensionPixels(edge, W, ROWS);

  it("bottom row = the plate's top row, exactly", () => {
    for (let x = 0; x < W; x++)
      expect(px(out, x, ROWS - 1)).toEqual(Array.from(edge.slice(x * 4, x * 4 + 4)));
  });

  it("above the feather, the wisp is smoothed away (no streak)", () => {
    const y = Math.floor(ROWS * (1 - SKY_DEFAULTS.feather)) - 2;
    const inWisp = px(out, 106, y)[0];
    const beside = px(out, 60, y)[0];
    expect(Math.abs(inWisp - beside)).toBeLessThan(20);
    // …whereas at the join the wisp is still exactly there.
    expect(px(out, 106, ROWS - 1)[0]).toBe(200);
  });

  it("neighbouring columns stay smooth all the way up", () => {
    for (const y of [0, ROWS / 2, ROWS - 5]) {
      let maxStep = 0;
      for (let x = 1; x < W; x++)
        for (let c = 0; c < 3; c++)
          maxStep = Math.max(maxStep, Math.abs(px(out, x, y)[c] - px(out, x - 1, y)[c]));
      expect(maxStep).toBeLessThanOrEqual(3);
    }
  });

  it("deepens toward the zenith and is opaque", () => {
    const top = px(out, 300, 0);
    const mid = px(out, 300, ROWS - 8);
    expect(top[0]).toBeLessThan(mid[0]); // less red: deeper blue
    for (let i = 3; i < out.length; i += 4) expect(out[i]).toBe(255);
  });
});
