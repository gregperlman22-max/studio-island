// split-covered-boat.mjs — cut the Pete-baked covered boat into two layers so
// the arrival cinematic can composite the player's avatar as a PASSENGER:
// render hull-back → rider → hull-front, with the near rail occluding the
// rider's legs (see ArrivalView).
//
// The cut follows the NEAR GUNWALE (top edge of the near hull wall), traced from
// the gridded deck/hull junction. Everything BELOW the line → hull-front (near
// rail + hull wall + teal + wake); everything ABOVE → hull-back (cabin, Pete,
// sail, mast, far hull). The two layers losslessly reassemble the original.
//
// USAGE:  cd tools/island-art && node split-covered-boat.mjs
//   in:  ../../packages/island-scene/src/assets/landmarks/boat-covered.png
//   out: boat-covered-back.webp, boat-covered-front.webp (same dir)
import sharp from "sharp";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const HERE = dirname(fileURLToPath(import.meta.url));
const DIR = join(HERE, "../../packages/island-scene/src/assets/landmarks");
const SRC = join(DIR, "boat-covered.png");

// Near-gunwale polyline, fractions of the boat canvas.
const GUNWALE = [
  [0.00, 0.72], [0.15, 0.70], [0.28, 0.70], [0.40, 0.71], [0.50, 0.72],
  [0.58, 0.71], [0.66, 0.67], [0.75, 0.63], [0.85, 0.60], [1.00, 0.65],
];

function polySvg(W, H, pts) {
  const p = pts.map(([fx, fy]) => `${(fx * W).toFixed(1)},${(fy * H).toFixed(1)}`).join(" ");
  return Buffer.from(`<svg width="${W}" height="${H}"><polygon points="${p}" fill="#fff"/></svg>`);
}

const meta = await sharp(SRC).metadata();
const W = meta.width, H = meta.height;
const below = [...GUNWALE, [1, 1], [0, 1]];               // hull-front region
const above = [[0, 0], [1, 0], ...[...GUNWALE].reverse()]; // hull-back region

for (const [name, pts] of [["boat-covered-front", below], ["boat-covered-back", above]]) {
  const mask = polySvg(W, H, pts);
  await sharp(SRC)
    .composite([{ input: mask, blend: "dest-in" }]) // keep boat where mask is opaque
    .webp({ quality: 90, alphaQuality: 100, effort: 6 })
    .toFile(join(DIR, `${name}.webp`));
  console.log(`wrote ${name}.webp (${W}x${H})`);
}
