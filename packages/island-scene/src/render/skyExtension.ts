/**
 * The boat opening's sky, continued above the painting on screens taller than
 * it (phone portrait). Built from the plate's own top row, so nothing new is
 * painted and nothing is stretched into streaks:
 *
 *   - the BOTTOM row is that top row exactly, column for column, so the join
 *     with the painting has no seam;
 *   - moving up, it eases (over `feather` of the height) into a sideways-
 *     smoothed version of the same row, which removes the small cloud wisps a
 *     single row carries — stretched upward, they would read as streaks;
 *   - toward the top it deepens slightly, as a real sky does toward the zenith.
 *
 * Returns RGBA pixels for a `width` × `rows` texture, top row first.
 */
export interface SkyOptions {
  /** Share of the height over which the exact edge eases into the smoothed sky. */
  feather: number;
  /** Sideways smoothing radius, as a share of the width. */
  smoothRadius: number;
  /** How far the top row moves toward `zenith` (0..1). */
  zenithMix: number;
  zenith: readonly [number, number, number];
}

export const SKY_DEFAULTS: SkyOptions = {
  feather: 0.03,
  smoothRadius: 0.06,
  zenithMix: 0.16,
  zenith: [14, 108, 226],
};

export function skyExtensionPixels(
  edge: Uint8ClampedArray,
  width: number,
  rows: number,
  opts: SkyOptions = SKY_DEFAULTS,
): Uint8ClampedArray<ArrayBuffer> {
  // Sideways box smoothing of the edge row (prefix sums, clamped ends).
  const r = Math.max(1, Math.round(width * opts.smoothRadius));
  const smooth = new Float32Array(width * 3);
  const prefix = new Float64Array((width + 1) * 3);
  for (let x = 0; x < width; x++)
    for (let c = 0; c < 3; c++) prefix[(x + 1) * 3 + c] = prefix[x * 3 + c] + edge[x * 4 + c];
  for (let x = 0; x < width; x++) {
    const a = Math.max(0, x - r);
    const b = Math.min(width, x + r + 1);
    for (let c = 0; c < 3; c++)
      smooth[x * 3 + c] = (prefix[b * 3 + c] - prefix[a * 3 + c]) / (b - a);
  }
  const out = new Uint8ClampedArray(width * rows * 4);
  for (let j = 0; j < rows; j++) {
    // t: 0 at the top of the extension, 1 at the join with the painting.
    const t = rows === 1 ? 1 : j / (rows - 1);
    const u = Math.min(1, Math.max(0, (t - (1 - opts.feather)) / opts.feather));
    const exact = u * u * (3 - 2 * u); // smoothstep: exact edge at the join
    const z = opts.zenithMix * Math.pow(1 - t, 1.5);
    for (let x = 0; x < width; x++) {
      const o = (j * width + x) * 4;
      for (let c = 0; c < 3; c++) {
        const base = smooth[x * 3 + c] + (edge[x * 4 + c] - smooth[x * 3 + c]) * exact;
        out[o + c] = base + (opts.zenith[c] - base) * z;
      }
      out[o + 3] = 255;
    }
  }
  return out;
}
