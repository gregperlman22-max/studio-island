// Paint the boat OUT of the uploaded arrival scene master so the scene
// becomes the sailing stage (src/assets/landmarks/arrival-bg.webp is encoded
// from this output) and the cut boat sails over it. Run cut-empty-helm-boat
// first — its boatcut-mask.png drives the fill region.
// Fill = row-preserving ping-pong tile of the clean sky/water strip just right
// of the boat (x 860-1008 abs; same rows keep the horizon, haze and wave
// structure). Region = boat cutout mask dilated 8px.
import sharp from "sharp";

// usage: node patch-arrival-bg.mjs [outDir]   (outDir = cut script's outDir)
const SRC = new URL("../../packages/island-scene/src/assets/landmarks/arrival-boat-bg-empty-helm.png", import.meta.url).pathname;
const S = process.argv[2] ?? "out";
const CROP = { left: 120, top: 200 }; // mask origin in abs coords
// Far-left open sea: clean sky above the horizon and clean water below at
// every row of the patch region (the right side runs into the shore).
const STRIP_X0 = 8, STRIP_X1 = 116;

const { data: img, info } = await sharp(SRC).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const { width: W, height: H } = info;

const { data: mraw, info: minfo } = await sharp(`${S}/boatcut-mask.png`).raw().toBuffer({ resolveWithObject: true });
const MW = minfo.width, MH = minfo.height, MC = minfo.channels;

// dilate mask by 8 (chebyshev) into abs-coords boolean
const R = 8;
const fill = new Uint8Array(W * H);
for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
  if (mraw[(y * MW + x) * MC] < 128) continue;
  for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
    const ax = CROP.left + x + dx, ay = CROP.top + y + dy;
    if (ax < 0 || ay < 0 || ax >= W || ay >= H) continue;
    fill[ay * W + ax] = 1;
  }
}

// The boat's dark water reflection reads as teal, so the cut keyed it as
// background and it never entered the mask — paint it out explicitly.
for (let y = 605; y <= 760; y++) for (let x = 95; x <= 800; x++) fill[y * W + x] = 1;

// ping-pong sample of the strip, constant phase for vertical wave coherence
const SL = STRIP_X1 - STRIP_X0; // 148
const period = 2 * SL;
const stripX = (k) => {
  const m = ((k % period) + period) % period;
  return STRIP_X0 + (m < SL ? m : period - 1 - m);
};

// Fill per contiguous masked run in each row, tone-matched: the strip texture
// is written with a per-pixel linear correction that ramps between the mean
// color just left of the run and just right of it, so the patch inherits the
// local water/sky tone (bluer offshore, sandier near the shallows).
const orig = Buffer.from(img);
const meanAt = (y, x0, x1) => {
  const c = [0, 0, 0];
  let cnt = 0;
  for (let x = Math.max(0, x0); x <= Math.min(W - 1, x1); x++) {
    const i = (y * W + x) * 4;
    c[0] += orig[i]; c[1] += orig[i + 1]; c[2] += orig[i + 2]; cnt++;
  }
  return cnt ? c.map((v) => v / cnt) : null;
};
let n = 0;
for (let y = 0; y < H; y++) {
  let x = 0;
  while (x < W) {
    if (!fill[y * W + x]) { x++; continue; }
    let xe = x;
    while (xe + 1 < W && fill[y * W + xe + 1]) xe++;
    // strip mean for this row (full strip; texture varies little per row)
    const sm = meanAt(y, STRIP_X0, STRIP_X1 - 1);
    const lm = x > 0 ? meanAt(y, x - 7, x - 1) : null;
    const rm = xe < W - 1 ? meanAt(y, xe + 1, xe + 7) : null;
    for (let xi = x; xi <= xe; xi++) {
      const t = xe > x ? (xi - x) / (xe - x) : 0.5;
      const target = lm && rm ? lm.map((v, k) => v * (1 - t) + rm[k] * t) : (lm ?? rm ?? sm);
      const sx = stripX(xi - CROP.left);
      const si = (y * W + sx) * 4, di = (y * W + xi) * 4;
      for (let k = 0; k < 3; k++) {
        const v = orig[si + k] + (target[k] - sm[k]);
        img[di + k] = Math.max(0, Math.min(255, Math.round(v)));
      }
      img[di + 3] = 255;
      n++;
    }
    x = xe + 1;
  }
}
console.log(`patched ${n}px (${((100 * n) / (W * H)).toFixed(1)}%)`);

await sharp(img, { raw: { width: W, height: H, channels: 4 } }).png().toFile(`${S}/arrival-bg-patched.png`);
console.log("wrote arrival-bg-patched.png");
