// matte-characters.mjs — offline alpha matte for character art (avatars/guides).
//
// WHY: the runtime background knockout (src/render/avatarTexture.ts) assumes
// bold ink outlines that stop its flood fill. The plush-style character art
// has none, so pale fur within color tolerance of the near-white background
// leaked transparent (Panda's face, Polar Bear's torso — July 2026 diagnosis).
// This script mattes properly OFFLINE and ships true-RGBA WebPs, so the
// runtime knockout (and its cel-art ink defringe, which drew a dark halo on
// plush art) can be deleted once the results are visually signed off.
//
// ALGORITHM (per image, at full source resolution):
//   1. corner-averaged background color; border flood fill with the same
//      tolerance the runtime used (dist² ≤ 3600) → candidate background B;
//   2. LEAK SEAL — morphological opening of B with border-connectivity:
//      erode B by radius R (chamfer distance), which severs the thin necks a
//      leak crawls through; keep only eroded components still connected to
//      the image border (true background — an interior leak core is not);
//      dilate the kept set back by R. Background crevices narrower than 2R
//      stay opaque (acceptable; tune --radius per art batch);
//   3. final mask = opened ∩ original flood (never clears beyond the flood);
//      alpha feathered with two 3×3 passes for a soft 1–2px edge;
//   4. NO ink defringe — plush art keeps its natural edges;
//   5. resize to --maxdim, emit RGBA WebP (q82, alphaQuality 100).
//
// USAGE
//   cd tools/island-art && bun install   # (sharp)
//   node matte-characters.mjs <srcDir> <outDir> [--maxdim 640] [--radius N]
//                             [--sheet contact-sheet.png]
//   Original pre-conversion PNG masters live in git history:
//     git show d42759a:packages/island-scene/public/avatars/Panda.png > ...
//   Future characters: drop the raw PNG/WebP in <srcDir> and rerun.
import sharp from "sharp";
import { mkdirSync, readdirSync } from "fs";
import { basename, extname, join } from "path";

const TOL2 = 60 * 60;

const args = process.argv.slice(2);
const positional = args.filter((a) => !a.startsWith("--"));
const flag = (name, dflt) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : dflt;
};
const [srcDir, outDir] = positional;
if (!srcDir || !outDir) {
  console.error("usage: node matte-characters.mjs <srcDir> <outDir> [--maxdim 640] [--radius N] [--sheet out.png]");
  process.exit(1);
}
const MAX_DIM = Number(flag("maxdim", 640));
const RADIUS_OVERRIDE = flag("radius", null);
const SHEET = flag("sheet", null);
mkdirSync(outDir, { recursive: true });

/** Chebyshev distance to the nearest zero of `mask` (two-pass). */
function distToZero(mask, w, h) {
  const INF = 1 << 29;
  const d = new Int32Array(w * h);
  for (let p = 0; p < w * h; p++) d[p] = mask[p] ? INF : 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = y * w + x;
      if (d[p] === 0) continue;
      let best = d[p];
      if (x > 0) best = Math.min(best, d[p - 1] + 1);
      if (y > 0) {
        best = Math.min(best, d[p - w] + 1);
        if (x > 0) best = Math.min(best, d[p - w - 1] + 1);
        if (x < w - 1) best = Math.min(best, d[p - w + 1] + 1);
      }
      d[p] = best;
    }
  }
  for (let y = h - 1; y >= 0; y--) {
    for (let x = w - 1; x >= 0; x--) {
      const p = y * w + x;
      if (d[p] === 0) continue;
      let best = d[p];
      if (x < w - 1) best = Math.min(best, d[p + 1] + 1);
      if (y < h - 1) {
        best = Math.min(best, d[p + w] + 1);
        if (x < w - 1) best = Math.min(best, d[p + w + 1] + 1);
        if (x > 0) best = Math.min(best, d[p + w - 1] + 1);
      }
      d[p] = best;
    }
  }
  return d;
}

/** Flood (4-conn) over `allowed`, seeded from every border pixel in `allowed`. */
function borderFlood(allowed, w, h) {
  const out = new Uint8Array(w * h);
  const stack = [];
  const push = (x, y) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const p = y * w + x;
    if (!allowed[p] || out[p]) return;
    out[p] = 1;
    stack.push(p);
  };
  for (let x = 0; x < w; x++) { push(x, 0); push(x, h - 1); }
  for (let y = 0; y < h; y++) { push(0, y); push(w - 1, y); }
  while (stack.length) {
    const p = stack.pop();
    const x = p % w, y = (p - x) / w;
    push(x + 1, y); push(x - 1, y); push(x, y + 1); push(x, y - 1);
  }
  return out;
}

async function matte(path) {
  const meta = await sharp(path).metadata();
  const w = meta.width, h = meta.height;
  const { data: d } = await sharp(path).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const R = RADIUS_OVERRIDE ? Number(RADIUS_OVERRIDE) : Math.max(4, Math.round(Math.max(w, h) / 160));

  const px = (x, y, c) => d[(y * w + x) * 3 + c];
  const corners = [[0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1]];
  let br = 0, bgc = 0, bb = 0;
  for (const [x, y] of corners) { br += px(x, y, 0); bgc += px(x, y, 1); bb += px(x, y, 2); }
  br /= 4; bgc /= 4; bb /= 4;
  const near = (p3) => {
    const dr = d[p3] - br, dg = d[p3 + 1] - bgc, db = d[p3 + 2] - bb;
    return dr * dr + dg * dg + db * db <= TOL2;
  };
  for (const [x, y] of corners) {
    if (!near((y * w + x) * 3)) throw new Error(`${basename(path)}: corners are not a flat background`);
  }

  // 1. candidate background: border flood over near-background pixels.
  const nearMask = new Uint8Array(w * h);
  for (let p = 0; p < w * h; p++) nearMask[p] = near(p * 3) ? 1 : 0;
  const B = borderFlood(nearMask, w, h);

  // 2. leak seal: erode → keep border-connected → dilate.
  const dIn = distToZero(B, w, h);            // distance into B from its edge
  const eroded = new Uint8Array(w * h);
  for (let p = 0; p < w * h; p++) eroded[p] = dIn[p] > R ? 1 : 0;
  const keptCore = borderFlood(eroded, w, h); // an interior leak core loses its neck
  const notCore = new Uint8Array(w * h);
  for (let p = 0; p < w * h; p++) notCore[p] = keptCore[p] ? 0 : 1;
  const dToCore = distToZero(notCore, w, h);  // distance to the kept core
  // 3. background = within R of the kept core, and inside the original flood.
  const alpha = new Uint8Array(w * h);
  let cleared = 0;
  for (let p = 0; p < w * h; p++) {
    const isBg = B[p] && dToCore[p] <= R;
    alpha[p] = isBg ? 0 : 255;
    if (isBg) cleared++;
  }

  // Feather: two 3×3 box passes over the alpha for a soft edge.
  for (let pass = 0; pass < 2; pass++) {
    const src = alpha.slice();
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        let s = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) s += src[(y + dy) * w + (x + dx)];
        alpha[y * w + x] = Math.round(s / 9);
      }
    }
  }

  const rgba = Buffer.alloc(w * h * 4);
  for (let p = 0; p < w * h; p++) {
    rgba[p * 4] = d[p * 3];
    rgba[p * 4 + 1] = d[p * 3 + 1];
    rgba[p * 4 + 2] = d[p * 3 + 2];
    rgba[p * 4 + 3] = alpha[p];
  }
  const out = sharp(rgba, { raw: { width: w, height: h, channels: 4 } });
  const scale = Math.min(1, MAX_DIM / Math.max(w, h));
  const resized = scale < 1 ? out.resize(Math.round(w * scale), Math.round(h * scale)) : out;
  return { image: resized, clearedPct: (100 * cleared) / (w * h), R };
}

const files = readdirSync(srcDir).filter((f) => /\.(png|webp)$/i.test(f)).sort();
const outputs = [];
for (const f of files) {
  const stem = basename(f, extname(f));
  const outPath = join(outDir, `${stem}.webp`);
  const { image, clearedPct, R } = await matte(join(srcDir, f));
  await image.webp({ quality: 82, alphaQuality: 100, effort: 6 }).toFile(outPath);
  outputs.push({ stem, outPath });
  console.log(`${stem.padEnd(12)} R=${R}  background=${clearedPct.toFixed(1)}%  -> ${outPath}`);
}

// Contact sheet: every result over a checkerboard, labeled, 5 per row.
if (SHEET && outputs.length) {
  const CELL = 240, LABEL = 26, COLS = 5;
  const rows = Math.ceil(outputs.length / COLS);
  const sheetW = COLS * CELL, sheetH = rows * (CELL + LABEL);
  const CHECK = 12;
  const bg = Buffer.alloc(sheetW * sheetH * 4);
  for (let y = 0; y < sheetH; y++) for (let x = 0; x < sheetW; x++) {
    const v = ((x / CHECK | 0) + (y / CHECK | 0)) % 2 ? 202 : 240;
    const p = (y * sheetW + x) * 4;
    bg[p] = v; bg[p + 1] = v; bg[p + 2] = v; bg[p + 3] = 255;
  }
  const composites = [];
  for (const [i, o] of outputs.entries()) {
    const cx = (i % COLS) * CELL, cy = Math.floor(i / COLS) * (CELL + LABEL);
    const thumb = await sharp(o.outPath).resize(CELL - 16, CELL - 16, { fit: "inside" }).png().toBuffer();
    composites.push({ input: thumb, left: cx + 8, top: cy + 8 });
    const label = Buffer.from(
      `<svg width="${CELL}" height="${LABEL}"><text x="${CELL / 2}" y="18" text-anchor="middle" font-family="sans-serif" font-size="15" font-weight="bold" fill="#23201c">${o.stem}</text></svg>`,
    );
    composites.push({ input: label, left: cx, top: cy + CELL - 8 });
  }
  await sharp(bg, { raw: { width: sheetW, height: sheetH, channels: 4 } })
    .composite(composites)
    .png()
    .toFile(SHEET);
  console.log(`contact sheet -> ${SHEET}`);
}
