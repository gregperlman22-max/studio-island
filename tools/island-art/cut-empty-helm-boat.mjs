// Cut the empty-helm covered boat out of the full-scene master
// (arrival-boat-bg-empty-helm.png) into the transparent sprite that sails the
// arrival cinematic (src/assets/landmarks/boat-empty-helm.webp is encoded from
// this output). Same strategy as boat-knockout.mjs: border flood through
// background-classified pixels, walled in by the boat's ink outlines. Two
// background predicates:
//   isSky   (upper band only)  — light + desaturated warm cream / clouds
//   isWater (lower band only)  — teal: green&blue well above red
// The cream sail is protected by ENCLOSURE (rigging/outline walls), the white
// wake foam by POSITION (below the sky band, fails the teal test).
import sharp from "sharp";

// usage: node cut-empty-helm-boat.mjs [outDir] [--debug]
import { mkdirSync } from "fs";
const SRC = new URL("../../packages/island-scene/src/assets/landmarks/arrival-boat-bg-empty-helm.png", import.meta.url).pathname;
const OUT = process.argv.find((a, i) => i >= 2 && !a.startsWith("--")) ?? "out";
mkdirSync(OUT, { recursive: true });
const debug = process.argv.includes("--debug");

// Crop: boat + rigging + wake only — must exclude the shore (trees/sand would
// survive the flood). Full image is 1672x941; horizon ~y390; shoreline foam
// reaches left to ~x990.
const CROP = { left: 120, top: 200, width: 730, height: 580 };
// Above FOAM_Y: sky/haze — key anything light-or-teal (sail survives by
// enclosure inside its ink outline). Below FOAM_Y: teal only, so the white
// wake foam survives by color.
const FOAM_Y = 355;

const { data, info } = await sharp(SRC).extract(CROP).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const { width: W, height: H } = info;
const N = W * H;
const px = Buffer.from(data);

// Protected geometry (crop-local px): the sail, flag, mast and rigging rope
// are soft watercolor with no ink wall, so the flood must never enter them.
// Thin sky slivers hugging these shapes ride along with the cutout — invisible
// against the destination bg's near-identical cream sky.
const inRect = (x, y, x0, y0, x1, y1) => x >= x0 && x <= x1 && y >= y0 && y <= y1;
const inPoly = (x, y, pts) => {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};
// Sail outline traced from 4x insets (leech is convex), +6px margin outward.
const SAIL_POLY = [
  [424, 118], [441, 123], [496, 156], [536, 206], [556, 256], [566, 312],
  [566, 332], [424, 332],
];
const isProtected = (x, y) =>
  inRect(x, y, 420, 64, 532, 128) ||   // flag
  inRect(x, y, 402, 52, 438, 348) ||   // mast
  inPoly(x, y, SAIL_POLY);             // sail

const isBg = (i, y) => {
  const x = i % W;
  if (isProtected(x, y)) return false;
  const r = px[i * 4], g = px[i * 4 + 1], b = px[i * 4 + 2];
  // b-r floor is slack: the sage wave water reads green over blue. White foam
  // still fails the g-r test and survives.
  const tealish = g - r > 18 && b - r > -12;
  if (y >= FOAM_Y) return tealish;
  const lum = Math.max(r, g, b), sat = lum - Math.min(r, g, b);
  return tealish || (lum > 140 && sat < 135);
};

const visited = new Uint8Array(N);
const removed = new Uint8Array(N);
const stack = [];
const seed = (x, y) => {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = y * W + x;
  if (visited[i]) return;
  visited[i] = 1;
  if (!isBg(i, y)) return;
  removed[i] = 1;
  stack.push(i);
};
for (let x = 0; x < W; x++) { seed(x, 0); seed(x, H - 1); }
for (let y = 0; y < H; y++) { seed(0, y); seed(W - 1, y); }
// extra manual seeds (enclosed pockets found by inspection) via argv "x,y"
for (const a of process.argv.slice(2)) {
  const m = a.match(/^(\d+),(\d+)$/);
  if (m) seed(+m[1], +m[2]);
}
let cleared = 0;
while (stack.length) {
  const i = stack.pop();
  cleared++;
  const x = i % W, y = (i - x) / W;
  seed(x + 1, y); seed(x - 1, y); seed(x, y + 1); seed(x, y - 1);
}
for (let i = 0; i < N; i++) if (removed[i]) px[i * 4 + 3] = 0;
console.log(`cleared ${cleared} (${((100 * cleared) / N).toFixed(1)}%)`);

// Enclosed show-through holes: opaque clusters that look like background and
// are PALE (water/sky seen through wheel spokes, the boom window, the
// cabin-mast slit). Key them transparent so the destination bg — and the
// rider behind the wheel — shows through. Dark bg-looking clusters (door
// glass, the blue hull stripe) are boat parts and stay.
{
  const seen = new Uint8Array(N);
  let holed = 0, kept = 0;
  for (let p0 = 0; p0 < N; p0++) {
    const y0 = (p0 / W) | 0;
    if (removed[p0] || seen[p0] || !isBg(p0, y0) || isProtected(p0 % W, y0)) continue;
    let area = 0, lumSum = 0;
    const members = [];
    const st = [p0]; seen[p0] = 1;
    while (st.length) {
      const p = st.pop(); area++; members.push(p);
      lumSum += Math.max(px[p * 4], px[p * 4 + 1], px[p * 4 + 2]);
      const x = p % W, y = (p - x) / W;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const np = ny * W + nx;
        if (!seen[np] && !removed[np] && isBg(np, ny) && !isProtected(nx, ny)) { seen[np] = 1; st.push(np); }
      }
    }
    if (area >= 25 && lumSum / area > 175) {
      for (const p of members) { removed[p] = 1; px[p * 4 + 3] = 0; }
      holed += area;
    } else kept += area;
  }
  console.log(`holes keyed: ${holed}px; dark/small bg-looking kept: ${kept}px`);
}

// Force-key the enclosed haze band between the sail leech and the bow post —
// it is walled in on all sides by boat parts, so no flood reaches it.
{
  let n = 0;
  for (let y = 125; y <= 352; y++) for (let x = 540; x <= 586; x++) {
    const i = y * W + x;
    if (removed[i] || isProtected(x, y) || !isBg(i, y)) continue;
    removed[i] = 1; px[i * 4 + 3] = 0; n++;
  }
  console.log(`haze band force-keyed: ${n}px`);
}

// Right of the bow scroll there is only sky/haze — key it all. At berth those
// rows overlap the shore sand, where a kept teal sliver would show as a blotch
// (while sailing they were invisible over same-row water, but not on sand).
{
  let n = 0;
  for (let y = 0; y <= 388; y++) for (let x = 626; x < W; x++) {
    const i = y * W + x;
    if (!removed[i]) { removed[i] = 1; px[i * 4 + 3] = 0; n++; }
  }
  console.log(`beyond-bow force-keyed: ${n}px`);
}

// Wake skirt fade: the foam trail runs past the crop, so dissolve it toward
// the left/right/bottom edges instead of cutting hard.
for (let y = 340; y < H; y++) for (let x = 0; x < W; x++) {
  const i = y * W + x;
  if (px[i * 4 + 3] === 0) continue;
  const fx = Math.min(1, Math.min(x, W - 1 - x) / 55);
  const fy = Math.min(1, (H - 1 - y) / 30);
  const f = Math.min(fx, fy);
  const s = f * f * (3 - 2 * f);
  if (s < 1) px[i * 4 + 3] = Math.round(px[i * 4 + 3] * s);
}

// Gentle 1px silhouette feather: 3x3 mean of the (binary-ish) alpha.
{
  const a = new Uint8Array(N);
  for (let p = 0; p < N; p++) a[p] = px[p * 4 + 3];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let sum = 0, cnt = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      sum += a[ny * W + nx]; cnt++;
    }
    px[(y * W + x) * 4 + 3] = Math.round(sum / cnt);
  }
}

if (debug) {
  const dbg = Buffer.from(data);
  for (let i = 0; i < N; i++) if (removed[i]) { dbg[i * 4] = 255; dbg[i * 4 + 1] = 0; dbg[i * 4 + 2] = 255; }
  await sharp(dbg, { raw: { width: W, height: H, channels: 4 } }).png().toFile(`${OUT}/boatcut-debug.png`);
  console.log("wrote boatcut-debug.png");
} else {
  // Boat-content mask (pre-trim, crop coords) — drives the bg patch fill.
  // From `removed`, NOT final alpha: the wake-skirt fade pushes outskirt foam
  // below any alpha threshold, but those pixels are still boat ink in the
  // source scene and must be painted out.
  const mask = Buffer.alloc(N);
  for (let p = 0; p < N; p++) mask[p] = removed[p] ? 0 : 255;
  await sharp(mask, { raw: { width: W, height: H, channels: 1 } }).png().toFile(`${OUT}/boatcut-mask.png`);

  // trim to content + report bbox for anchor math
  let x0 = W, y0 = H, x1 = 0, y1 = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (px[(y * W + x) * 4 + 3] > 8) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  console.log("content bbox in crop:", x0, y0, x1, y1, "size", x1 - x0 + 1, "x", y1 - y0 + 1);
  await sharp(px, { raw: { width: W, height: H, channels: 4 } })
    .extract({ left: x0, top: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 })
    .png().toFile(`${OUT}/boat-empty-helm-cut.png`);
  console.log("wrote boat-empty-helm-cut.png (trimmed)");
}
