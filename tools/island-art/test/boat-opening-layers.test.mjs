/**
 * Regression for boat-opening-layers.mjs PROMOTION (review finding R1):
 * the four finals are one set, so a failure while replacing them must leave
 * the previous complete set — never a back layer from one generation with a
 * front from another.
 *
 *   node --test tools/island-art/test/
 *
 * Everything runs in a temporary directory (BOAT_LAYERS_OUT_DIR); the repo's
 * runtime assets and the retained source art are never written. Two different
 * valid generations come from two masks: the repo mask (A) and the same mask
 * shifted up 5 px (B) — each partitions the master exactly, but their layers
 * differ, so a mixed A/B pair no longer recomposes the master. Failures are
 * injected from outside the tool by a preloaded fs.renameSync wrapper.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";

sharp.cache(false);
const TOOLS = path.resolve(import.meta.dirname, "..");
// BOAT_LAYERS_TOOL: run the same checks against another copy of the tool.
const TOOL = process.env.BOAT_LAYERS_TOOL ?? path.join(TOOLS, "boat-opening-layers.mjs");
const MASTER = path.join(TOOLS, "source/boat-opening-2026-09-24/source/assets/boat.png");
const FINALS = ["boat-back.webp", "boat-front.webp", "opening-environment.webp", "captain-pete.webp"];

const T = fs.mkdtempSync(path.join(os.tmpdir(), "boat-promotion-"));
const OUT = path.join(T, "out");
const MASK_A = path.join(TOOLS, "boat-front-mask.json");
const MASK_B = path.join(T, "mask-b.json");
const mask = JSON.parse(fs.readFileSync(MASK_A, "utf8"));
for (const p of mask.polygons) p.points = p.points.map(([x, y]) => [x, Math.max(0, y - 5)]);
fs.writeFileSync(MASK_B, JSON.stringify(mask));
// Injector: the Nth rename of a staged final (…webp.tmp) throws, or kills the process.
const INJECT = path.join(T, "inject.mjs");
fs.writeFileSync(INJECT, `import fs from "node:fs";
const at = Number(process.env.FAIL_RENAME_AT), mode = process.env.FAIL_MODE;
const real = fs.renameSync; let n = 0;
fs.renameSync = function (a, b) {
  if (String(a).endsWith(".webp.tmp") && ++n === at) {
    if (mode === "kill") process.kill(process.pid, "SIGKILL");
    throw new Error("INJECTED: rename " + n + " of the staged finals failed");
  }
  return real(a, b);
};
`);

function run({ maskFile, env = {}, inject = false }) {
  const args = inject ? ["--import", INJECT, TOOL] : [TOOL];
  const r = spawnSync(process.execPath, args, {
    env: { ...process.env, BOAT_LAYERS_OUT_DIR: OUT, BOAT_LAYERS_MASK: maskFile, ...env },
    encoding: "utf8",
  });
  const log = `$ ${JSON.stringify(env)} mask=${path.basename(maskFile)}\n${r.stdout}${r.stderr}exit ${r.status} ${r.signal ?? ""}\n`;
  fs.appendFileSync(path.join(T, "runs.log"), log);
  console.log(log);
  return r;
}
const hashes = () =>
  Object.fromEntries(FINALS.map((n) => [n, crypto.createHash("sha256").update(fs.readFileSync(path.join(OUT, n))).digest("hex")]));
const leftovers = () => fs.readdirSync(OUT).filter((f) => f.startsWith("."));
/** Independent of the tool: installed front-over-back vs the master, pixel by pixel. */
async function installedMismatches() {
  const m = await sharp(MASTER).ensureAlpha().raw().toBuffer();
  const f = await sharp(path.join(OUT, "boat-front.webp")).ensureAlpha().raw().toBuffer();
  const b = await sharp(path.join(OUT, "boat-back.webp")).ensureAlpha().raw().toBuffer();
  let bad = 0;
  for (let i = 0; i < m.length; i += 4) {
    if (f[i + 3] && b[i + 3]) { bad++; continue; }
    const s = f[i + 3] ? f : b;
    if (s[i + 3] !== m[i + 3] || (m[i + 3] && (s[i] !== m[i] || s[i + 1] !== m[i + 1] || s[i + 2] !== m[i + 2]))) bad++;
  }
  return bad;
}

let A;
test("generation A installs and verifies", async () => {
  const r = run({ maskFile: MASK_A });
  assert.equal(r.status, 0);
  assert.deepEqual(leftovers(), []);
  assert.equal(await installedMismatches(), 0);
  A = hashes();
});

for (const at of [2, 4]) {
  test(`B fails on staged rename ${at} of 4 (after ${at - 1} final(s) replaced) → the previous set A is restored`, async () => {
    const r = run({ maskFile: MASK_B, inject: true, env: { FAIL_RENAME_AT: String(at), FAIL_MODE: "throw" } });
    assert.match(r.stdout, /saved pair recomposes to master: YES/, "B itself passed staging verification");
    assert.equal(await installedMismatches(), 0, "installed pair must still recompose the master");
    assert.deepEqual(hashes(), A, "the previous complete set A is installed");
    assert.deepEqual(leftovers(), [], "no staged, backup or journal files left");
    assert.equal(r.status, 2);
    assert.match(r.stderr, /previous finals restored/);
  });
}

test("saved-file corruption is still rejected before promotion (finals stay A)", async () => {
  const r = run({ maskFile: MASK_B, env: { BOAT_LAYERS_INJECT_FAULT: "1" } });
  assert.equal(r.status, 2);
  assert.match(r.stdout, /saved pair recomposes to master: NO \(1 mismatches\)/);
  assert.deepEqual(hashes(), A);
  assert.deepEqual(leftovers(), []);
});

test("killed mid-promotion: mixed on disk, then the next run restores A before anything else", async () => {
  const r = run({ maskFile: MASK_B, inject: true, env: { FAIL_RENAME_AT: "2", FAIL_MODE: "kill" } });
  assert.equal(r.signal, "SIGKILL");
  const h = hashes();
  assert.notEqual(h["boat-back.webp"], A["boat-back.webp"], "the first rename landed");
  assert.equal(h["boat-front.webp"], A["boat-front.webp"]);
  assert.ok(await installedMismatches() > 0, "an abrupt kill CAN leave a mixed set (documented limit)");
  assert.ok(leftovers().includes(".boat-opening-promotion.json"), "the journal survives the kill");
  // Next run (here one that then stops at the corruption gate, before promoting).
  const r2 = run({ maskFile: MASK_B, env: { BOAT_LAYERS_INJECT_FAULT: "1" } });
  assert.equal(await installedMismatches(), 0, "the next run must restore a complete set");
  assert.deepEqual(hashes(), A);
  assert.deepEqual(leftovers(), []);
  assert.equal(r2.status, 2);
  assert.match(r2.stdout, /RECOVERED/);
});

test("generation B installs when nothing fails, replacing the pair as a set", async () => {
  const r = run({ maskFile: MASK_B });
  assert.equal(r.status, 0);
  const B = hashes();
  assert.notEqual(B["boat-back.webp"], A["boat-back.webp"]);
  assert.notEqual(B["boat-front.webp"], A["boat-front.webp"]);
  assert.deepEqual(leftovers(), []);
  assert.equal(await installedMismatches(), 0);
  fs.copyFileSync(path.join(T, "runs.log"), process.env.RUNS_LOG ?? path.join(T, "runs-copy.log"));
});
