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
// Injector: the Nth rename of a staged final (…webp.tmp), and/or the Nth
// deletion of an EXISTING backup (…webp.bak, i.e. cleanup), throws or kills.
const INJECT = path.join(T, "inject.mjs");
fs.writeFileSync(INJECT, `import fs from "node:fs";
const fail = (what, n, mode) => {
  if (mode === "kill") process.kill(process.pid, "SIGKILL");
  throw new Error("INJECTED: " + what + " " + n + " failed");
};
const renameAt = Number(process.env.FAIL_RENAME_AT), renameMode = process.env.FAIL_MODE;
const realRename = fs.renameSync; let r = 0;
fs.renameSync = function (a, b) {
  if (String(a).endsWith(".webp.tmp") && ++r === renameAt) fail("rename of staged final", r, renameMode);
  return realRename(a, b);
};
const rmAt = Number(process.env.FAIL_BACKUP_RM_AT), rmMode = process.env.FAIL_BACKUP_RM_MODE;
const realRm = fs.rmSync; let d = 0;
fs.rmSync = function (p, o) {
  if (String(p).endsWith(".webp.bak") && fs.existsSync(p) && ++d === rmAt) fail("deletion of backup", d, rmMode);
  return realRm(p, o);
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

let A, B;
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
  B = hashes();
  assert.notEqual(B["boat-back.webp"], A["boat-back.webp"]);
  assert.notEqual(B["boat-front.webp"], A["boat-front.webp"]);
  assert.deepEqual(leftovers(), []);
  assert.equal(await installedMismatches(), 0);
});

// ── Backup CLEANUP interrupted (review follow-up to R1) ────────────────
// dropBackups() is the one cleanup used after a verified install, after a
// rollback and after a recovery. It must retire the journal before deleting
// any backup, so a cleanup that fails or is killed part-way never leaves a
// journal that orders a restore from missing backups. Each case then proves
// an ordinary rerun succeeds with a complete valid set and no leftovers.
const journalExists = () => fs.existsSync(path.join(OUT, ".boat-opening-promotion.json"));
async function ordinaryRerun(maskFile, expected) {
  const r = run({ maskFile });
  assert.equal(r.status, 0, "an ordinary rerun must succeed");
  assert.deepEqual(hashes(), expected);
  assert.equal(await installedMismatches(), 0);
  assert.deepEqual(leftovers(), []);
}

test("cleanup after a verified install fails at backup 2 → A installed, no journal; rerun succeeds", async () => {
  // State: B installed. Install A; the 2nd backup deletion throws.
  const r = run({ maskFile: MASK_A, inject: true, env: { FAIL_BACKUP_RM_AT: "2", FAIL_BACKUP_RM_MODE: "throw" } });
  assert.notEqual(r.status, 0, "the injected cleanup error is reported");
  assert.match(r.stdout + r.stderr, /INJECTED: deletion of backup 2/);
  assert.equal(journalExists(), false, "no journal survives into cleanup");
  assert.deepEqual(hashes(), A, "the verified install stands");
  assert.equal(await installedMismatches(), 0);
  await ordinaryRerun(MASK_A, A);
});

test("cleanup after a verified install is KILLED at backup 2 → B installed, no journal; rerun succeeds", async () => {
  // State: A installed. Install B; SIGKILL on the 2nd backup deletion.
  const r = run({ maskFile: MASK_B, inject: true, env: { FAIL_BACKUP_RM_AT: "2", FAIL_BACKUP_RM_MODE: "kill" } });
  assert.equal(r.signal, "SIGKILL");
  assert.equal(journalExists(), false);
  assert.ok(leftovers().some((f) => f.endsWith(".bak")), "some backups were left behind");
  assert.deepEqual(hashes(), B);
  assert.equal(await installedMismatches(), 0);
  await ordinaryRerun(MASK_B, B);
});

test("cleanup after a ROLLBACK fails at backup 1 → previous set B restored, no journal; rerun succeeds", async () => {
  // State: B installed. Install A: rename 2 fails (rollback to B), then cleanup fails.
  const r = run({
    maskFile: MASK_A,
    inject: true,
    env: { FAIL_RENAME_AT: "2", FAIL_MODE: "throw", FAIL_BACKUP_RM_AT: "1", FAIL_BACKUP_RM_MODE: "throw" },
  });
  assert.notEqual(r.status, 0);
  assert.match(r.stdout + r.stderr, /INJECTED: deletion of backup 1/);
  assert.equal(journalExists(), false);
  assert.deepEqual(hashes(), B, "the rollback restored the previous complete set");
  assert.equal(await installedMismatches(), 0);
  await ordinaryRerun(MASK_B, B);
});

test("cleanup after a RECOVERY fails at backup 1 → restored set B, no journal; rerun succeeds", async () => {
  // State: B installed. Killed mid-promotion of A → mixed set + journal.
  const k = run({ maskFile: MASK_A, inject: true, env: { FAIL_RENAME_AT: "2", FAIL_MODE: "kill" } });
  assert.equal(k.signal, "SIGKILL");
  assert.ok(journalExists());
  // Next run recovers B, then its cleanup fails.
  const r = run({ maskFile: MASK_A, inject: true, env: { FAIL_BACKUP_RM_AT: "1", FAIL_BACKUP_RM_MODE: "throw" } });
  assert.notEqual(r.status, 0);
  assert.match(r.stdout + r.stderr, /INJECTED: deletion of backup 1/);
  assert.equal(journalExists(), false);
  assert.deepEqual(hashes(), B, "recovery restored the previous complete set");
  assert.equal(await installedMismatches(), 0);
  // An ordinary rerun then installs A cleanly.
  await ordinaryRerun(MASK_A, A);
  fs.copyFileSync(path.join(T, "runs.log"), process.env.RUNS_LOG ?? path.join(T, "runs-copy.log"));
});
