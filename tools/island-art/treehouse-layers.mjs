import sharp from "sharp";
import fs from "node:fs";
// libvips caches decodes by path. The saved-file check re-reads files this
// script has just (re)written, so the cache would hand back the pre-write
// decode and pass a corrupted file. Off, so every read is a real read.
sharp.cache(false);

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

// Verify IN MEMORY: front OVER back == master, alpha and the RGB of every visible pixel.
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

// The COMPLETE master is shipped too, as the runtime's fallback when either
// half of the pair fails to load: a back layer alone is the master with holes
// in it, not the old single sprite. Same canvas, same anchor, same scale.
const full = Buffer.from(m);
for (let i = 0; i < W * H; i++) if (full[i * 4 + 3] === 0) full[i * 4] = full[i * 4 + 1] = full[i * 4 + 2] = 0;

/**
 * Write each layer to a TEMPORARY file, read it back and check it against the
 * master; only when every file passes are the finals replaced. A rejected
 * result therefore never overwrites a known-good pair, and a mismatch is a
 * non-zero exit, not a log line.
 *
 * `TREEHOUSE_LAYERS_INJECT_FAULT=1` flips one visible pixel in the saved
 * front layer before verification — the way the failure branch is proven.
 */
const outputs = [
  { name: "treehouse.webp", buf: back, role: "back" },
  { name: "treehouse-front.webp", buf: front, role: "front" },
  { name: "treehouse-full.webp", buf: full, role: "full" },
];
const tmpOf = (name) => OUT_DIR + "." + name + ".tmp";
for (const o of outputs) await sharp(o.buf, raw).webp({ lossless: true }).toFile(tmpOf(o.name));

if (process.env.TREEHOUSE_LAYERS_INJECT_FAULT === "1") {
  // Corrupt the saved front: decode, flip one opaque pixel's colour, re-encode.
  const t = tmpOf("treehouse-front.webp");
  const buf = await sharp(t).ensureAlpha().raw().toBuffer();
  const i = buf.findIndex((_, k) => k % 4 === 3 && buf[k] > 0) - 3;
  buf[i] = 255 - buf[i];
  await sharp(buf, raw).webp({ lossless: true }).toFile(t);
  console.log("FAULT INJECTED: one pixel of the saved front layer was altered");
}

const rb = await sharp(tmpOf("treehouse.webp")).ensureAlpha().raw().toBuffer();
const rf = await sharp(tmpOf("treehouse-front.webp")).ensureAlpha().raw().toBuffer();
const rfull = await sharp(tmpOf("treehouse-full.webp")).ensureAlpha().raw().toBuffer();
let badPair = 0, badFull = 0;
for (let i = 0; i < W * H * 4; i += 4) {
  const src = rf[i + 3] ? rf : rb;
  if ((rf[i + 3] ? 1 : 0) + (rb[i + 3] ? 1 : 0) > 1) badPair++;
  else if (src[i + 3] !== m[i + 3]) badPair++;
  else if (m[i + 3] && (src[i] !== m[i] || src[i + 1] !== m[i + 1] || src[i + 2] !== m[i + 2])) badPair++;
  if (rfull[i + 3] !== m[i + 3]) badFull++;
  else if (m[i + 3] && (rfull[i] !== m[i] || rfull[i + 1] !== m[i + 1] || rfull[i + 2] !== m[i + 2])) badFull++;
}
console.log(`saved pair recomposes to master: ${badPair === 0 ? "YES" : "NO (" + badPair + " mismatches)"}`);
console.log(`saved full matches master:       ${badFull === 0 ? "YES" : "NO (" + badFull + " mismatches)"}`);
if (badPair || badFull) {
  for (const o of outputs) fs.rmSync(tmpOf(o.name), { force: true });
  console.error("REJECTED: saved output does not reproduce the master; finals left untouched");
  process.exit(2);
}
for (const o of outputs) fs.renameSync(tmpOf(o.name), OUT_DIR + o.name);
console.log("written:", outputs.map((o) => o.name).join(", "));

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
