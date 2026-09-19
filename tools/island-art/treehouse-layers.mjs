import sharp from "sharp";
import fs from "node:fs";

/**
 * Treehouse exterior — deterministic back/front split of the 1024 master.
 *
 *   node treehouse-layers.mjs            # writes the pair + verifies
 *   node treehouse-layers.mjs --preview  # also writes review overlays
 *
 * The mask is a set of traced polygons in MASTER pixel coordinates
 * (treehouse-front-mask.json), rasterised with sharp from SVG at exactly
 * 1024x1024 with no antialiasing (shape-rendering="crispEdges"), so every pixel
 * has ONE owner. Front = master pixels inside the mask; back = every other
 * master pixel. Both layers keep the master's untrimmed 1024 canvas, so they
 * share the master's anchor and scale by construction — neither is ever
 * centred, trimmed or resized on its own.
 *
 * Recomposition (front over back) therefore reproduces the master exactly:
 * at each pixel one layer carries the master's RGBA and the other is fully
 * transparent, so "over" returns the master's pixel unchanged. The script
 * verifies that claim before writing anything to the runtime folder.
 */
const HERE = new URL(".", import.meta.url).pathname;
const MASTER = HERE + "source/treehouse-master-2026-09-19/candidate/treehouse-master-1024.png";
const MASK_JSON = HERE + "treehouse-front-mask.json";
const OUT_DIR = HERE + "../../packages/island-scene/src/assets/landmarks/";
const PREVIEW = process.argv.includes("--preview");
const PREVIEW_DIR = process.env.PREVIEW_DIR || HERE + "preview-treehouse/";

const W = 1024, H = 1024;
const mask = JSON.parse(fs.readFileSync(MASK_JSON, "utf8"));
/** Every mask element as SVG: polygons, stroked polylines (round caps/joins) and circles. */
function shapesSvg(m, fill, stroke, extra = "") {
  const pts = (p) => p.map(([x, y]) => `${x},${y}`).join(" ");
  return (m.polygons ?? []).map((p) => `<polygon points="${pts(p.points)}" fill="${fill}" ${extra}/>`).join("") +
    (m.strokes ?? []).map((t) => `<polyline points="${pts(t.points)}" fill="none" stroke="${stroke}" stroke-width="${t.width}" stroke-linecap="round" stroke-linejoin="round" ${extra}/>`).join("") +
    (m.circles ?? []).map((c) => `<circle cx="${c.cx}" cy="${c.cy}" r="${c.r}" fill="${fill}" ${extra}/>`).join("");
}
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" shape-rendering="crispEdges">` +
  shapesSvg(mask, "#fff", "#fff") + `</svg>`;
const maskRaw = await sharp(Buffer.from(svg)).ensureAlpha().raw().toBuffer();   // RGBA, white where front
const { data: m, info } = await sharp(MASTER).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
if (info.width !== W || info.height !== H) throw new Error("master is not 1024x1024");

const back = Buffer.from(m), front = Buffer.from(m);
let frontPx = 0, backPx = 0;
for (let i = 0; i < W * H; i++) {
  const inFront = maskRaw[i * 4] > 127;
  const a = m[i * 4 + 3];
  if (inFront) { back[i * 4 + 3] = 0; if (a) frontPx++; }
  else { front[i * 4 + 3] = 0; if (a) backPx++; }
}
// Zero the RGB of fully transparent pixels too, so lossless WebP has nothing
// to carry there and a viewer's "visible RGB" compare is clean.
for (const buf of [back, front]) for (let i = 0; i < W * H; i++) if (buf[i * 4 + 3] === 0) buf[i * 4] = buf[i * 4 + 1] = buf[i * 4 + 2] = 0;

// Verify: front OVER back == master, for alpha and for the RGB of every visible pixel.
let bad = 0;
for (let i = 0; i < W * H; i++) {
  const fa = front[i * 4 + 3], ba = back[i * 4 + 3], ma = m[i * 4 + 3];
  const src = fa ? front : back;
  if ((fa && ba) || (fa || ba) !== (ma ? fa || ba : 0) || (fa || ba) !== ma) { bad++; continue; }
  if (ma && (src[i * 4] !== m[i * 4] || src[i * 4 + 1] !== m[i * 4 + 1] || src[i * 4 + 2] !== m[i * 4 + 2])) bad++;
}
console.log(`front: ${frontPx} px   back: ${backPx} px   (master opaque px: ${frontPx + backPx})`);
console.log(`recomposition mismatches vs master: ${bad}`);
if (bad) throw new Error("layers do not recompose to the master");

const raw = { raw: { width: W, height: H, channels: 4 } };
await sharp(back, raw).webp({ lossless: true }).toFile(OUT_DIR + "treehouse.webp");
await sharp(front, raw).webp({ lossless: true }).toFile(OUT_DIR + "treehouse-front.webp");
// Round-trip the written files and re-verify against the master.
const rb = await sharp(OUT_DIR + "treehouse.webp").ensureAlpha().raw().toBuffer();
const rf = await sharp(OUT_DIR + "treehouse-front.webp").ensureAlpha().raw().toBuffer();
let bad2 = 0;
for (let i = 0; i < W * H * 4; i += 4) {
  const src = rf[i + 3] ? rf : rb;
  if ((rf[i + 3] ? 1 : 0) + (rb[i + 3] ? 1 : 0) > 1) bad2++;
  else if (src[i + 3] !== m[i + 3]) bad2++;
  else if (m[i + 3] && (src[i] !== m[i] || src[i + 1] !== m[i + 1] || src[i + 2] !== m[i + 2])) bad2++;
}
console.log(`written WebP pair recomposes to master: ${bad2 === 0 ? "YES" : "NO (" + bad2 + " mismatches)"}`);

if (PREVIEW) {
  fs.mkdirSync(PREVIEW_DIR, { recursive: true });
  const dark = { background: "#202020" };
  await sharp(front, raw).flatten(dark).png().toFile(PREVIEW_DIR + "front-on-dark.png");
  await sharp(back, raw).flatten(dark).png().toFile(PREVIEW_DIR + "back-on-dark.png");
  // Boundary overlay: master with the mask edge drawn magenta, at 2x around the stairs.
  const edge = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">` +
    shapesSvg(mask, "#ff00ff40", "#ff00ff60", 'stroke-opacity="0.9"') + `</svg>`;
  const overlaid = await sharp(MASTER).flatten(dark).composite([{ input: Buffer.from(edge) }]).png().toBuffer();
  await sharp(overlaid).extract({ left: 380, top: 420, width: 480, height: 520 }).resize(960, 1040, { kernel: "nearest" }).png().toFile(PREVIEW_DIR + "mask-boundary-2x.png");
  await sharp(overlaid).png().toFile(PREVIEW_DIR + "mask-boundary-full.png");
  // Front layer alone at 2x around the stairs, so stray back pixels caught in the mask are visible.
  await sharp(front, raw).flatten(dark).extract({ left: 380, top: 420, width: 480, height: 520 }).resize(960, 1040, { kernel: "nearest" }).png().toFile(PREVIEW_DIR + "front-only-2x.png");
  // Recomposed (front over back) for a visual sanity check next to the master.
  await sharp(back, raw).composite([{ input: front, raw: raw.raw }]).flatten(dark).png().toFile(PREVIEW_DIR + "recomposed-on-dark.png");
  console.log("previews →", PREVIEW_DIR);
}
