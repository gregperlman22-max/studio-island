import sharp from "sharp";
import fs from "node:fs";
import crypto from "node:crypto";
// libvips caches decodes by path. The saved-file check re-reads files this
// script has just (re)written, so the cache would hand back the pre-write
// decode and pass a corrupted file. Off, so every read is a real read.
sharp.cache(false);

/**
 * Boat opening (2026-09-24 approved direction) — runtime assets.
 *
 *   node boat-opening-layers.mjs            # writes + verifies
 *   node boat-opening-layers.mjs --preview  # also writes review overlays
 *
 * 1. BOAT PAIR — a deterministic back/front split of the 1254 boat master.
 *    The mask (boat-front-mask.json, master pixel coordinates) is rasterised
 *    with shape-rendering="crispEdges", so every pixel has ONE owner. Front =
 *    master pixels inside the mask (near hull wall, near rail cap, the
 *    fittings on it); back = every other master pixel. Both layers keep the
 *    master's untrimmed 1254 canvas, so they share its coordinate system by
 *    construction — neither is ever trimmed, centred or resized on its own.
 *    Front-over-back reproduces the master exactly (one layer carries the
 *    master's RGBA at each pixel, the other is fully transparent), and that
 *    is verified IN MEMORY and again on the SAVED files before the finals are
 *    replaced. A mismatch exits 2 and leaves the finals untouched.
 *    `BOAT_LAYERS_INJECT_FAULT=1` corrupts one pixel of the saved front to
 *    prove that branch.
 *
 * 3. PROMOTION — the four finals are one set. Every existing final is first
 *    copied to a backup and a journal is written; only then are the staged
 *    files renamed over the finals. If any rename fails, the backups are
 *    copied back (finals that did not exist before are removed), so a handled
 *    failure leaves the PREVIOUS complete set (exit 2). After a successful
 *    promotion the INSTALLED files are verified again (pair recomposes to the
 *    master, bytes equal to what was staged); a failure there also rolls back.
 *    Limits, stated plainly: four renames are not one atomic operation. A
 *    process killed mid-promotion leaves a mixed set on disk, with the journal
 *    and backups beside it; the next run of this script restores the previous
 *    set from them before doing anything else. A reader (e.g. a dev server)
 *    can observe the set mid-promotion, and nothing is fsynced, so power loss
 *    guarantees nothing. `test/boat-opening-layers.test.mjs` exercises this.
 *
 *    BOAT_LAYERS_OUT_DIR / BOAT_LAYERS_MASK redirect the output directory and
 *    mask (the regression test uses temporary copies; defaults are the repo's).
 *
 *    No uncut "full" boat is shipped: drawn whole, the master would put the
 *    passengers' legs on top of the hull. When the pair cannot load, the
 *    runtime falls back to the existing covered-boat cinematic instead (see
 *    render/openingArt.ts).
 *
 * 2. ENVIRONMENT PLATE and CAPTAIN PETE — encoded for the runtime (lossy WebP,
 *    measured and reported; the pair's exact-recomposition gate does not apply
 *    to single sprites). Same pixel dimensions as the sources.
 */
const HERE = new URL(".", import.meta.url).pathname;
const SRC = HERE + "source/boat-opening-2026-09-24/source/assets/";
const MASTER = SRC + "boat.png";
const MASK_JSON = process.env.BOAT_LAYERS_MASK || HERE + "boat-front-mask.json";
const OUT_DIR = (process.env.BOAT_LAYERS_OUT_DIR || HERE + "../../packages/island-scene/src/assets/opening").replace(/\/?$/, "/");
const PREVIEW = process.argv.includes("--preview");
const PREVIEW_DIR = process.env.PREVIEW_DIR || HERE + "preview-boat-opening/";

const W = 1254, H = 1254;
const mask = JSON.parse(fs.readFileSync(MASK_JSON, "utf8"));
const pts = (p) => p.map(([x, y]) => `${x},${y}`).join(" ");
const shapesSvg = (fill, extra = "") =>
  mask.polygons.map((p) => `<polygon points="${pts(p.points)}" fill="${fill}" ${extra}/>`).join("");
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" shape-rendering="crispEdges">${shapesSvg("#fff")}</svg>`;
const maskRaw = await sharp(Buffer.from(svg)).ensureAlpha().raw().toBuffer(); // RGBA, white where front
const { data: m, info } = await sharp(MASTER).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
if (info.width !== W || info.height !== H) throw new Error("boat master is not 1254x1254");
fs.mkdirSync(OUT_DIR, { recursive: true });

const FINALS = ["boat-back.webp", "boat-front.webp", "opening-environment.webp", "captain-pete.webp"];
const JOURNAL = OUT_DIR + ".boat-opening-promotion.json";
const bakOf = (name) => OUT_DIR + "." + name + ".bak";
/** Put the previous set back: copy (not move) each backup, so a restore that
 *  is itself interrupted can simply be run again. */
function restorePrevious(prior) {
  for (const f of prior) {
    if (f.had) fs.copyFileSync(bakOf(f.name), OUT_DIR + f.name);
    else fs.rmSync(OUT_DIR + f.name, { force: true });
  }
}
function dropBackups() {
  for (const n of FINALS) fs.rmSync(bakOf(n), { force: true });
  fs.rmSync(JOURNAL, { force: true });
}
// An earlier run was killed mid-promotion: its journal names the complete
// previous set; restore it before anything else. Backups without a journal
// were never used (the finals were not yet touched): discard them.
if (fs.existsSync(JOURNAL)) {
  restorePrevious(JSON.parse(fs.readFileSync(JOURNAL, "utf8")));
  dropBackups();
  console.log("RECOVERED: an interrupted promotion was rolled back to the previous complete set");
} else dropBackups();
// Staged files left by an interrupted run are never promoted: discard them.
for (const n of FINALS) fs.rmSync(OUT_DIR + "." + n + ".tmp", { force: true });
fs.rmSync(JOURNAL + ".tmp", { force: true });

const back = Buffer.from(m), front = Buffer.from(m);
let frontPx = 0, backPx = 0;
for (let i = 0; i < W * H; i++) {
  const inFront = maskRaw[i * 4] > 127;
  const a = m[i * 4 + 3];
  if (inFront) { back[i * 4 + 3] = 0; if (a) frontPx++; }
  else { front[i * 4 + 3] = 0; if (a) backPx++; }
}
// The master's own fully transparent pixels carry arbitrary RGB; zero it in
// both layers (and in the reference the checks compare against), so lossless
// WebP has nothing to carry there.
const ref = Buffer.from(m);
for (const buf of [back, front, ref]) for (let i = 0; i < W * H; i++) if (buf[i * 4 + 3] === 0) buf[i * 4] = buf[i * 4 + 1] = buf[i * 4 + 2] = 0;

/** front OVER back == master: no pixel owned twice, alpha equal, RGB of every visible pixel equal. */
function recomposeMismatches(f, b) {
  let bad = 0;
  for (let i = 0; i < W * H * 4; i += 4) {
    const fa = f[i + 3], ba = b[i + 3];
    if (fa && ba) { bad++; continue; }
    const src = fa ? f : b;
    if (src[i + 3] !== ref[i + 3]) { bad++; continue; }
    if (ref[i + 3] && (src[i] !== ref[i] || src[i + 1] !== ref[i + 1] || src[i + 2] !== ref[i + 2])) bad++;
  }
  return bad;
}
const memBad = recomposeMismatches(front, back);
console.log(`front: ${frontPx} px   back: ${backPx} px   (master non-transparent px: ${frontPx + backPx})`);
console.log(`in-memory recomposition mismatches vs master: ${memBad}`);
if (memBad) { console.error("REJECTED in memory: layers do not recompose to the master"); process.exit(2); }

const raw = { raw: { width: W, height: H, channels: 4 } };
const tmpOf = (name) => OUT_DIR + "." + name + ".tmp";
const pair = [
  { name: "boat-back.webp", buf: back },
  { name: "boat-front.webp", buf: front },
];
for (const o of pair) await sharp(o.buf, raw).webp({ lossless: true, effort: 6 }).toFile(tmpOf(o.name));

if (process.env.BOAT_LAYERS_INJECT_FAULT === "1") {
  const t = tmpOf("boat-front.webp");
  const buf = await sharp(t).ensureAlpha().raw().toBuffer();
  const i = buf.findIndex((_, k) => k % 4 === 3 && buf[k] > 0) - 3;
  buf[i] = 255 - buf[i];
  await sharp(buf, raw).webp({ lossless: true }).toFile(t);
  console.log("FAULT INJECTED: one pixel of the saved front layer was altered");
}

const rb = await sharp(tmpOf("boat-back.webp")).ensureAlpha().raw().toBuffer();
const rf = await sharp(tmpOf("boat-front.webp")).ensureAlpha().raw().toBuffer();
const savedBad = recomposeMismatches(rf, rb);
console.log(`saved pair recomposes to master: ${savedBad === 0 ? "YES" : "NO (" + savedBad + " mismatches)"}`);
if (savedBad) {
  for (const o of pair) fs.rmSync(tmpOf(o.name), { force: true });
  console.error("REJECTED: saved pair does not reproduce the master; finals left untouched");
  process.exit(2);
}

// Single sprites: the environment plate (opaque) and Captain Pete (alpha).
const singles = [
  { name: "opening-environment.webp", src: SRC + "environment.png", opts: { quality: 86, effort: 6 } },
  { name: "captain-pete.webp", src: SRC + "captain-study.png", opts: { quality: 90, alphaQuality: 100, effort: 6 } },
];
for (const s of singles) {
  const meta = await sharp(s.src).metadata();
  await sharp(s.src).webp(s.opts).toFile(tmpOf(s.name));
  const back2 = await sharp(tmpOf(s.name)).metadata();
  if (back2.width !== meta.width || back2.height !== meta.height) {
    for (const o of [...pair, ...singles]) fs.rmSync(tmpOf(o.name), { force: true });
    console.error(`REJECTED: ${s.name} re-read as ${back2.width}x${back2.height}, source ${meta.width}x${meta.height}`);
    process.exit(2);
  }
}

// ── Promotion (see 3. above) ─────────────────────────────────────────
const staged = [...pair, ...singles].map((o) => o.name);
const hashOf = (f) => crypto.createHash("sha256").update(fs.readFileSync(f)).digest("hex");
const stagedHash = Object.fromEntries(staged.map((n) => [n, hashOf(tmpOf(n))]));
const prior = staged.map((name) => ({ name, had: fs.existsSync(OUT_DIR + name) }));
const dropStaged = () => { for (const n of staged) fs.rmSync(tmpOf(n), { force: true }); };
try {
  for (const f of prior) if (f.had) fs.copyFileSync(OUT_DIR + f.name, bakOf(f.name));
  fs.writeFileSync(JOURNAL + ".tmp", JSON.stringify(prior));
  fs.renameSync(JOURNAL + ".tmp", JOURNAL);
} catch (err) {
  // Finals not touched yet.
  dropBackups(); fs.rmSync(JOURNAL + ".tmp", { force: true }); dropStaged();
  console.error("REJECTED: could not back up the current finals; finals left untouched —", err.message);
  process.exit(2);
}
/** The installed set: the pair recomposes to the master and every file is
 *  byte-for-byte what was verified in staging. */
async function installedProblems() {
  const problems = [];
  for (const n of staged) if (hashOf(OUT_DIR + n) !== stagedHash[n]) problems.push(`${n} differs from the verified staged file`);
  const ib = await sharp(OUT_DIR + "boat-back.webp").ensureAlpha().raw().toBuffer();
  const iF = await sharp(OUT_DIR + "boat-front.webp").ensureAlpha().raw().toBuffer();
  const bad = recomposeMismatches(iF, ib);
  if (bad) problems.push(`installed pair: ${bad} pixels differ from the master`);
  return problems;
}
let failure = null;
try {
  for (const n of staged) fs.renameSync(tmpOf(n), OUT_DIR + n);
  const problems = await installedProblems();
  if (problems.length) failure = problems.join("; ");
} catch (err) {
  failure = err.message;
}
if (failure) {
  try {
    restorePrevious(prior);
  } catch (err) {
    console.error(`PROMOTION FAILED (${failure}) AND RESTORE FAILED (${err.message}); journal and backups kept — rerun this script to restore the previous set`);
    process.exit(3);
  }
  dropBackups(); dropStaged();
  console.error(`REJECTED during promotion (${failure}); previous finals restored`);
  process.exit(2);
}
dropBackups();
console.log(`installed set verified: ${staged.length} files match staging; installed pair recomposes to master: YES`);
for (const n of staged) console.log(`written: ${n}  ${fs.statSync(OUT_DIR + n).size} bytes`);

if (PREVIEW) {
  fs.mkdirSync(PREVIEW_DIR, { recursive: true });
  const dark = { background: "#203040" };
  await sharp(front, raw).flatten(dark).png().toFile(PREVIEW_DIR + "front-on-dark.png");
  await sharp(back, raw).flatten(dark).png().toFile(PREVIEW_DIR + "back-on-dark.png");
  const edge = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${shapesSvg("#ff00ff38", 'stroke="#ff00ff" stroke-width="1.5"')}</svg>`;
  const overlaid = await sharp(ref, raw).flatten(dark).composite([{ input: Buffer.from(edge) }]).png().toBuffer();
  await sharp(overlaid).png().toFile(PREVIEW_DIR + "mask-boundary-full.png");
  await sharp(overlaid).extract({ left: 0, top: 880, width: 700, height: 200 }).resize(2100, 600, { kernel: "nearest" }).png().toFile(PREVIEW_DIR + "mask-boundary-stern-3x.png");
  await sharp(overlaid).extract({ left: 600, top: 760, width: 654, height: 300 }).resize(1962, 900, { kernel: "nearest" }).png().toFile(PREVIEW_DIR + "mask-boundary-bow-3x.png");
  await sharp(back, raw).composite([{ input: front, raw: raw.raw }]).flatten(dark).png().toFile(PREVIEW_DIR + "recomposed-on-dark.png");
  console.log("previews ->", PREVIEW_DIR);
}
