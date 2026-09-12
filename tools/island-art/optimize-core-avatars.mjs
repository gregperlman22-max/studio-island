import sharp from "sharp";
import { mkdirSync, readdirSync, statSync } from "node:fs";
import { join, basename } from "node:path";

/**
 * Core-avatar delivery pipeline.
 *
 * The six approved Island Friends arrive as large PNGs (~6.5 MB total, up to
 * 1086x1448). They render at ~200-250 CSS px on a picker card and ~44 px
 * in-world, so shipping the source canvases to a child's tablet is wasteful by
 * an order of magnitude.
 *
 * This script produces the runtime WebPs. It is RE-RUNNABLE and the art is
 * never redrawn: a single uniform downscale plus a WebP encode with alpha.
 *
 * WHY A UNIFORM SCALE, AND NO CROP
 * The renderer anchors and sizes every character by its measured opaque
 * CONTENT BOX, normalised to canvas fractions (see contentBounds.ts). A uniform
 * scale leaves those fractions unchanged, so feet alignment, horizontal centre
 * and in-world height all survive untouched. Cropping the transparent padding
 * would change them and shift every character. Do not add a trim step.
 *
 * WHY PER-SOURCE TARGETS
 * The six do not share a canvas: Daisy is 553x542 and Remy 459x538 against
 * 1086x1448 for the other four, and their characters occupy different
 * fractions of those canvases. Scaling everything to one pixel size would give
 * the six different effective resolutions. Instead each is scaled so its
 * CONTENT lands at TARGET_CONTENT_PX tall — and never upscaled, because Daisy
 * and Remy are already below that and enlarging them would add bytes without
 * adding a single pixel of real detail.
 *
 * Usage:  cd tools/island-art && npm install && node optimize-core-avatars.mjs
 */

const SRC_DIR = join(import.meta.dirname, "source/core-avatars");
const OUT_DIR = join(
  import.meta.dirname,
  "../../packages/island-scene/public/avatars/core",
);

/**
 * Target height of the CHARACTER (not the canvas) in the shipped file.
 *
 * The largest the art is ever drawn is the portrait-tablet card, where the
 * picker gives it ~294 CSS px of height (cardH 525 x the 0.56 art band; see
 * avatarPickerLayout / AvatarSelect). 780px is ~2.65x that, which covers a
 * 2x display outright and is close enough on a 3x phone that no softness is
 * visible at card size. In-world the character is ~44px, so this is generous
 * there by design.
 */
const TARGET_CONTENT_PX = 780;

/** Encoder settings. alphaQuality 100 keeps the cutout edge clean — alpha is
 *  what a soft matte lives or dies by, and it costs very little. */
const WEBP = { quality: 90, alphaQuality: 100, effort: 6 };

/** Opaque-content bbox, matching contentBounds.ts's threshold exactly. */
async function contentBox(img) {
  const { data, info } = await img
    .clone()
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width: w, height: h, channels } = info;
  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * channels + 3] > 16) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  return {
    w, h,
    contentW: (maxX - minX + 1) / w,
    contentH: (maxY - minY + 1) / h,
    centerX: (minX + maxX + 1) / 2 / w,
    feetY: (maxY + 1) / h,
  };
}

const fmt = (n) => `${(n / 1024).toFixed(0)} KB`;
const pct = (a, b) => `${(((a - b) / a) * 100).toFixed(1)}%`;

mkdirSync(OUT_DIR, { recursive: true });

const files = readdirSync(SRC_DIR).filter((f) => f.endsWith(".png")).sort();
let srcTotal = 0;
let outTotal = 0;

console.log(
  "file".padEnd(24) + "source".padEnd(16) + "output".padEnd(16) +
  "bytes".padEnd(22) + "content bounds drift",
);
console.log("-".repeat(100));

for (const f of files) {
  const srcPath = join(SRC_DIR, f);
  const outPath = join(OUT_DIR, basename(f, ".png") + ".webp");

  const src = sharp(srcPath);
  const before = await contentBox(src);
  if (!before) throw new Error(`${f}: fully transparent`);

  // Scale so the CHARACTER is TARGET_CONTENT_PX tall; never enlarge.
  const contentPx = before.contentH * before.h;
  const scale = Math.min(1, TARGET_CONTENT_PX / contentPx);
  const outW = Math.max(1, Math.round(before.w * scale));
  const outH = Math.max(1, Math.round(before.h * scale));

  await sharp(srcPath)
    .resize(outW, outH, { kernel: "lanczos3", fit: "fill" })
    .webp(WEBP)
    .toFile(outPath);

  const after = await contentBox(sharp(outPath));
  const drift = [
    Math.abs(after.contentH - before.contentH),
    Math.abs(after.centerX - before.centerX),
    Math.abs(after.feetY - before.feetY),
  ];
  // A uniform scale must leave the normalised bounds alone; anything past a
  // pixel of rounding means the geometry moved and the characters will not
  // line up in-world.
  const worst = Math.max(...drift);
  if (worst > 0.01) {
    throw new Error(`${f}: content bounds moved by ${worst.toFixed(4)} — geometry changed`);
  }

  const sBytes = statSync(srcPath).size;
  const oBytes = statSync(outPath).size;
  srcTotal += sBytes;
  outTotal += oBytes;

  console.log(
    basename(outPath).padEnd(24) +
    `${before.w}x${before.h}`.padEnd(16) +
    `${outW}x${outH}`.padEnd(16) +
    `${fmt(sBytes)} -> ${fmt(oBytes)} (${pct(sBytes, oBytes)})`.padEnd(22) +
    `  H ${drift[0].toFixed(4)}  X ${drift[1].toFixed(4)}  feet ${drift[2].toFixed(4)}`,
  );
}

console.log("-".repeat(100));
console.log(
  `TOTAL  ${fmt(srcTotal)} -> ${fmt(outTotal)}   reduction ${pct(srcTotal, outTotal)}`,
);
