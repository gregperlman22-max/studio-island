#!/usr/bin/env node
/**
 * Engage Island — local preview server. Serves the built game in ./game.
 * Needs Node.js 18 or newer; no packages, nothing downloaded or installed.
 *
 *   node serve.mjs            this Mac only (127.0.0.1)
 *   node serve.mjs --lan      also other devices on the same Wi-Fi
 *   node serve.mjs --port 9000
 *
 * Stop it with Control-C in the Terminal window it is running in.
 */
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "game");
const args = process.argv.slice(2);
const lan = args.includes("--lan");
const portArg = args.indexOf("--port");
const port = portArg >= 0 ? Number(args[portArg + 1]) : 8089;
const host = lan ? "0.0.0.0" : "127.0.0.1";

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webp": "image/webp",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".wav": "audio/wav",
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
  ".txt": "text/plain; charset=utf-8",
};

if (!fs.existsSync(path.join(ROOT, "index.html"))) {
  console.error(`Can't find the game files next to this script (expected ${ROOT}).`);
  process.exit(1);
}

const server = http.createServer((req, res) => {
  let rel;
  try {
    rel = decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname);
  } catch {
    res.writeHead(400).end("Bad request");
    return;
  }
  let file = path.resolve(ROOT, "." + rel);
  if (file !== ROOT && !file.startsWith(ROOT + path.sep)) {
    res.writeHead(403).end("Forbidden");
    return;
  }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, "index.html");
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("Not found");
      return;
    }
    res.writeHead(200, {
      "Content-Type": TYPES[path.extname(file).toLowerCase()] ?? "application/octet-stream",
      "Content-Length": st.size,
      "Cache-Control": "no-cache",
    });
    if (req.method === "HEAD") return res.end();
    fs.createReadStream(file).pipe(res);
  });
});

server.on("error", (e) => {
  if (e.code === "EADDRINUSE")
    console.error(`Port ${port} is already in use. Try: node serve.mjs --port ${port + 1}`);
  else console.error(e.message);
  process.exit(1);
});

server.listen(port, host, () => {
  console.log("");
  console.log("  Engage Island preview is running.");
  console.log("");
  console.log(`  On this Mac, open:   http://127.0.0.1:${port}/start.html`);
  if (lan) {
    const addrs = Object.values(os.networkInterfaces())
      .flat()
      .filter((a) => a && a.family === "IPv4" && !a.internal)
      .map((a) => a.address);
    console.log("");
    if (addrs.length) {
      console.log("  On an iPad or phone on the SAME Wi-Fi, open:");
      for (const a of addrs) console.log(`      http://${a}:${port}/start.html`);
    } else console.log("  No Wi-Fi/LAN address found on this Mac.");
    console.log("  (Anyone on this Wi-Fi can open it while this window is running.)");
  }
  console.log("");
  console.log("  To stop: press Control-C in this window.");
  console.log("");
});
