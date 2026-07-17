import { describe, expect, it } from "vitest";
import { computeContentBounds } from "../render/contentBounds";

/**
 * The content-aware anchor/scale fix rests on this measurement: given a sprite's
 * alpha, find the opaque bbox as canvas fractions so a render site can pin the
 * true feet / horizontal centre and scale by visible content, not padded canvas.
 */

/** Build a w×h alpha buffer with an opaque rect [x0,x1)×[y0,y1). */
function alphaRect(w: number, h: number, x0: number, y0: number, x1: number, y1: number): Uint8Array {
  const a = new Uint8Array(w * h);
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) a[y * w + x] = 255;
  return a;
}

describe("computeContentBounds", () => {
  it("measures a centred rect: centre 0.5, feet at the content bottom", () => {
    // 10×10 canvas, opaque cols 2..7 (excl), rows 2..8 (excl).
    const b = computeContentBounds(alphaRect(10, 10, 2, 2, 8, 8), 10, 10)!;
    expect(b.centerX).toBeCloseTo(0.5, 5); // (2+7+1)/2 / 10 = 0.5
    expect(b.feetY).toBeCloseTo(0.8, 5);   // bottom opaque row is 7 → (7+1)/10
    expect(b.topY).toBeCloseTo(0.2, 5);
    expect(b.contentW).toBeCloseTo(0.6, 5);
    expect(b.contentH).toBeCloseTo(0.6, 5);
  });

  it("captures an OFF-CENTRE, bottom-padded sprite (the Squirrel case)", () => {
    // content shifted right and floating above the canvas bottom.
    const b = computeContentBounds(alphaRect(100, 100, 40, 10, 90, 80), 100, 100)!;
    expect(b.centerX).toBeCloseTo(0.65, 5); // (40+89+1)/2 / 100
    expect(b.feetY).toBeCloseTo(0.80, 5);   // 20% bottom padding → feet at 0.80, NOT 1.0
    expect(b.contentH).toBeCloseTo(0.70, 5);
  });

  it("ignores near-transparent pixels below the threshold", () => {
    const a = alphaRect(10, 10, 3, 3, 7, 7);
    a[0] = 8; // a stray faint pixel in the corner (below default threshold 16)
    const b = computeContentBounds(a, 10, 10)!;
    expect(b.topY).toBeCloseTo(0.3, 5); // corner ignored, bbox unchanged
    expect(b.centerX).toBeCloseTo(0.5, 5);
  });

  it("returns null for a fully transparent buffer or bad dimensions", () => {
    expect(computeContentBounds(new Uint8Array(100), 10, 10)).toBeNull();
    expect(computeContentBounds(new Uint8Array(4), 0, 10)).toBeNull();
    expect(computeContentBounds(new Uint8Array(2), 10, 10)).toBeNull(); // buffer too small
  });
});
