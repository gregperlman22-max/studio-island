/**
 * Content-aware bounds for character sprites.
 *
 * The painted avatar/guide art ships on a fixed 480×640 canvas, but each animal
 * sits inside its own margin: the feet are NOT at the canvas bottom and the body
 * is not always horizontally centred (e.g. Squirrel's content centre is at 57%).
 * Anchoring a sprite at the canvas bottom-centre (0.5, 1) therefore floats the
 * feet and, for off-centre art, shifts the body sideways — and scaling by the
 * canvas height makes the VISIBLE animal a different size per sprite (its content
 * fills 69–89% of the canvas).
 *
 * `computeContentBounds` measures the opaque content box once (at load) so a
 * render site can pin the true feet / horizontal centre and scale by the visible
 * content height instead of the padded canvas. Pure + allocation-light so it is
 * unit-tested directly; the browser wrapper that feeds it canvas alpha lives in
 * avatarTexture.ts.
 */

export interface ContentBounds {
  /** Opaque-content bbox centre X, as a fraction of canvas width (0..1). */
  centerX: number;
  /** Content bbox BOTTOM edge (the feet line), fraction of canvas height (0..1). */
  feetY: number;
  /** Content bbox TOP edge, fraction of canvas height (0..1). */
  topY: number;
  /** Content width, fraction of canvas width (0..1). */
  contentW: number;
  /** Content height, fraction of canvas height (0..1). */
  contentH: number;
}

/**
 * Opaque-content bounds of an alpha buffer (one byte per pixel, row-major),
 * normalised to canvas fractions. Returns null when nothing clears `threshold`
 * (a fully transparent image) so callers fall back to canvas-based anchoring.
 */
export function computeContentBounds(
  alpha: Uint8Array | Uint8ClampedArray | number[],
  w: number,
  h: number,
  threshold = 16,
): ContentBounds | null {
  if (w <= 0 || h <= 0 || alpha.length < w * h) return null;
  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      if (alpha[row + x] > threshold) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null; // nothing opaque
  const bw = maxX - minX + 1;
  const bh = maxY - minY + 1;
  return {
    centerX: (minX + maxX + 1) / 2 / w, // +1: right edge is exclusive of the pixel
    feetY: (maxY + 1) / h,              // bottom of the last opaque row
    topY: minY / h,
    contentW: bw / w,
    contentH: bh / h,
  };
}
