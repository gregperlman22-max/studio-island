#!/usr/bin/env node
/**
 * Build the playable local preview: the REAL demo production build
 * (`npm run build:demo` → dist-demo/) plus a no-dependency local server.
 *
 *   node preview-kit/make-preview.mjs <output-folder>
 *
 * Output:
 *   START-HERE.html   how to launch (Node or Python), stop, and the Wi-Fi option
 *   serve.mjs         local server (Node 18+)
 *   serve.py          the same with Python 3
 *   BUILD-INFO.txt    the exact commit/tree this was built from
 *   game/             dist-demo/ without source maps, plus start.html (review links)
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const KIT = path.dirname(fileURLToPath(import.meta.url));
const PKG = path.dirname(KIT);
const OUT = path.resolve(process.argv[2] ?? "");
if (!process.argv[2]) {
  console.error("usage: node preview-kit/make-preview.mjs <output-folder>");
  process.exit(1);
}
const git = (c) => execSync(`git ${c}`, { cwd: PKG, encoding: "utf8" }).trim();
const dirty = git("status --porcelain") !== "";
const candidate = `${git("rev-parse HEAD")} (tree ${git("rev-parse HEAD^{tree}")})${dirty ? " + UNCOMMITTED CHANGES" : ""}`;

execSync("npm run build:demo", { cwd: PKG, stdio: "inherit" });

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
fs.cpSync(path.join(PKG, "dist-demo"), path.join(OUT, "game"), {
  recursive: true,
  filter: (src) => !src.endsWith(".map"), // source maps are not needed to play
});
const fill = (file) =>
  fs.readFileSync(path.join(KIT, file), "utf8").replaceAll("{{CANDIDATE}}", candidate);
fs.writeFileSync(path.join(OUT, "game", "start.html"), fill("start.html"));
fs.writeFileSync(path.join(OUT, "START-HERE.html"), fill("START-HERE.html"));
for (const f of ["serve.mjs", "serve.py"]) fs.copyFileSync(path.join(KIT, f), path.join(OUT, f));
fs.writeFileSync(
  path.join(OUT, "BUILD-INFO.txt"),
  [
    "Engage Island — playable local preview",
    `Built from: ${candidate}`,
    `Branch: ${git("rev-parse --abbrev-ref HEAD")}`,
    `Built at: ${new Date().toISOString()}`,
    "Build: npm run build:demo (vite build → dist-demo/, base '/'), source maps omitted.",
    "",
  ].join("\n"),
);
console.log(`\npreview written to ${OUT}\n${candidate}`);
