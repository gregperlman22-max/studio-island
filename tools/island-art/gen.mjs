import zlib from "node:zlib";
import fs from "node:fs";
import path from "node:path";

// Write outputs next to this script so rerunning regenerates them in place.
const OUT = import.meta.dirname;
const out = (name) => path.join(OUT, name);

// ───────────────────────── constants (constants.ts) ─────────────────────────
const TILE_W = 64, TILE_H = 32, CLIFF = 14;
const HW = TILE_W / 2, HH = TILE_H / 2;

// ───────────────────────── iso.ts ─────────────────────────
const tileToScreen = (gx, gy) => ({ x: (gx - gy) * HW, y: (gx + gy) * HH });
const tileCenter = (gx, gy) => { const t = tileToScreen(gx, gy); return { x: t.x, y: t.y + HH }; };
const footprintCenter = (p, w, h) => tileCenter(p.x + (w - 1) / 2, p.y + (h - 1) / 2);

// ───────────────────────── defaultLayout.ts ─────────────────────────
const GRID_W = 54, GRID_H = 36, CX = 27, CY = 18, RX = 24, RY = 16;
function isLandCell(x, y) {
  const ang = Math.atan2(y - CY, x - CX);
  const wobble =
    0.06 * Math.sin(ang * 3 + 0.5) +
    0.05 * Math.sin(ang * 5 + 2.1) +
    0.04 * Math.sin(x * 0.5) * Math.cos(y * 0.4);
  const nx = (x - CX) / RX, ny = (y - CY) / RY;
  return nx * nx + ny * ny <= 1.04 + wobble;
}
const landCells = [];
for (let y = 0; y < GRID_H; y++)
  for (let x = 0; x < GRID_W; x++)
    if (isLandCell(x, y)) landCells.push({ x, y });

const zones = [
  { key: "lighthouse_point",   name: "Lighthouse Point",   pos: { x: 25, y: 4 },  fp: { w: 4, h: 4 } },
  { key: "treehouse_hideaway", name: "Treehouse Hideaway", pos: { x: 11, y: 9 },  fp: { w: 5, h: 5 } },
  { key: "art_hut",            name: "Art Hut",            pos: { x: 38, y: 11 }, fp: { w: 4, h: 4 } },
  { key: "campfire_circle",    name: "Campfire Circle",    pos: { x: 25, y: 16 }, fp: { w: 4, h: 4 } },
  { key: "arcade_cove",        name: "Arcade Cove",        pos: { x: 40, y: 21 }, fp: { w: 5, h: 4 } },
  { key: "calm_beach",         name: "Calm Beach",         pos: { x: 9,  y: 23 }, fp: { w: 6, h: 4 } },
  { key: "welcome_dock",       name: "Welcome Dock",       pos: { x: 24, y: 28 }, fp: { w: 6, h: 4 } },
];
const spawnPoint = { x: 27, y: 25 };

// ───────────────────────── coast.ts (faithful port) ─────────────────────────
const key = (p) => `${Math.round(p.x)},${Math.round(p.y)}`;
const ekey = (e) => `${key(e[0])}>${key(e[1])}`;
function islandOutline(cells, iterations = 4) {
  const set = new Set(cells.map((c) => `${c.x},${c.y}`));
  const isLand = (x, y) => set.has(`${x},${y}`);
  const TH = TILE_H;
  const adj = new Map();
  const push = (a, b) => { const k = key(a); const l = adj.get(k); if (l) l.push([a, b]); else adj.set(k, [[a, b]]); };
  for (const c of cells) {
    const { x: cx, y: cy } = tileToScreen(c.x, c.y);
    const T = { x: cx, y: cy }, R = { x: cx + HW, y: cy + HH }, B = { x: cx, y: cy + TH }, L = { x: cx - HW, y: cy + HH };
    if (!isLand(c.x, c.y - 1)) push(T, R);
    if (!isLand(c.x + 1, c.y)) push(R, B);
    if (!isLand(c.x, c.y + 1)) push(B, L);
    if (!isLand(c.x - 1, c.y)) push(L, T);
  }
  const used = new Set();
  let best = [];
  for (const list of adj.values()) {
    for (const seed of list) {
      if (used.has(ekey(seed))) continue;
      const loop = [];
      let edge = seed;
      for (let i = 0; edge && i < adj.size * 4 + 8; i++) {
        if (used.has(ekey(edge))) break;
        used.add(ekey(edge));
        loop.push(edge[0]);
        const from = edge[0], to = edge[1];
        const cand = (adj.get(key(to)) ?? []).filter((c) => !used.has(ekey(c)));
        if (cand.length === 0) break;
        edge = pickClockwise(cand, { x: to.x - from.x, y: to.y - from.y });
      }
      if (loop.length > best.length) best = loop;
    }
  }
  const resampled = resample(best, TILE_W * 1.1);
  if (resampled.length < 4) return best;
  return perturb(chaikin(resampled, iterations));
}
function pickClockwise(cand, inDir) {
  let best = cand[0], bestTurn = Infinity;
  for (const c of cand) {
    const out = { x: c[1].x - c[0].x, y: c[1].y - c[0].y };
    const turn = Math.atan2(inDir.x * out.y - inDir.y * out.x, inDir.x * out.x + inDir.y * out.y);
    if (turn < bestTurn) { bestTurn = turn; best = c; }
  }
  return best;
}
function perturb(loop) {
  const n = loop.length;
  if (n < 8) return loop;
  return loop.map((p, i) => {
    const a = loop[(i - 1 + n) % n], b = loop[(i + 1) % n];
    const tx = b.x - a.x, ty = b.y - a.y;
    const len = Math.hypot(tx, ty) || 1;
    const nx = -ty / len, ny = tx / len;
    const amp = 3.5 * Math.sin(i * 0.21) + 2.5 * Math.sin(i * 0.07 + 1.3);
    return { x: p.x + nx * amp, y: p.y + ny * amp };
  });
}
function resample(loop, spacing) {
  if (loop.length < 4) return loop;
  const out = []; let carry = 0;
  for (let i = 0; i < loop.length; i++) {
    const a = loop[i], b = loop[(i + 1) % loop.length];
    const segLen = Math.hypot(b.x - a.x, b.y - a.y);
    if (segLen === 0) continue;
    let d = -carry;
    while (d + spacing <= segLen) { d += spacing; const t = d / segLen; out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }); }
    carry = segLen - d;
  }
  return out.length >= 4 ? out : loop;
}
function chaikin(pts, iterations) {
  let p = pts;
  for (let it = 0; it < iterations; it++) {
    const out = []; const n = p.length;
    for (let i = 0; i < n; i++) {
      const a = p[i], b = p[(i + 1) % n];
      out.push({ x: a.x * 0.75 + b.x * 0.25, y: a.y * 0.75 + b.y * 0.25 });
      out.push({ x: a.x * 0.25 + b.x * 0.75, y: a.y * 0.25 + b.y * 0.75 });
    }
    p = out;
  }
  return p;
}

const outline = islandOutline(landCells);

// ───────────────────────── bounds ─────────────────────────
// Coast (smoothed outline) extent in WORLD pixels.
let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
for (const p of outline) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); }
// Land-cell (walk-grid) diamond extent — the TRUTH for walking.
let cminX = Infinity, cmaxX = -Infinity, cminY = Infinity, cmaxY = -Infinity;
for (const c of landCells) {
  const t = tileToScreen(c.x, c.y);
  cminX = Math.min(cminX, t.x - HW); cmaxX = Math.max(cmaxX, t.x + HW);
  cminY = Math.min(cminY, t.y);      cmaxY = Math.max(cmaxY, t.y + TILE_H);
}
const unionMinX = Math.min(minX, cminX), unionMaxX = Math.max(maxX, cmaxX);
const unionMinY = Math.min(minY, cminY), unionMaxY = Math.max(maxY, cmaxY);

// Transparent feather/safe margin around the island, in WORLD px.
const MARGIN = 70;
const originX = unionMinX - MARGIN;       // world coord at image pixel (0,0) before scaling
const originY = unionMinY - MARGIN;
const worldW = (unionMaxX - unionMinX) + 2 * MARGIN;
const worldH = (unionMaxY - unionMinY) + 2 * MARGIN;

// Scale so width ≈ 4096.
const TARGET_W = 4096;
const S = TARGET_W / worldW;
const IMG_W = TARGET_W;
const IMG_H = Math.round(worldH * S);

const toImg = (wx, wy) => ({ x: (wx - originX) * S, y: (wy - originY) * S });

// ───────────────────────── tiny raster ─────────────────────────
function makeCanvas(w, h) { return { w, h, data: new Uint8Array(w * h * 4) }; }
function setPx(c, x, y, r, g, b, a) {
  if (x < 0 || y < 0 || x >= c.w || y >= c.h) return;
  const i = (y * c.w + x) * 4;
  const ia = a / 255, na = 1 - ia;
  c.data[i] = r * ia + c.data[i] * na;
  c.data[i + 1] = g * ia + c.data[i + 1] * na;
  c.data[i + 2] = b * ia + c.data[i + 2] * na;
  c.data[i + 3] = Math.min(255, c.data[i + 3] + a * (1 - c.data[i + 3] / 255));
}
function fillPoly(c, pts, r, g, b, a) {
  let lo = Infinity, hi = -Infinity;
  for (const p of pts) { lo = Math.min(lo, p.y); hi = Math.max(hi, p.y); }
  lo = Math.max(0, Math.floor(lo)); hi = Math.min(c.h - 1, Math.ceil(hi));
  for (let y = lo; y <= hi; y++) {
    const xs = [];
    for (let i = 0; i < pts.length; i++) {
      const a1 = pts[i], b1 = pts[(i + 1) % pts.length];
      const y1 = a1.y, y2 = b1.y;
      if ((y1 <= y && y2 > y) || (y2 <= y && y1 > y)) {
        const t = (y - y1) / (y2 - y1);
        xs.push(a1.x + t * (b1.x - a1.x));
      }
    }
    xs.sort((p, q) => p - q);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const xa = Math.round(xs[k]), xb = Math.round(xs[k + 1]);
      for (let x = xa; x <= xb; x++) setPx(c, x, y, r, g, b, a);
    }
  }
}
function strokePoly(c, pts, r, g, b, a, width, closed = true) {
  const n = pts.length;
  const end = closed ? n : n - 1;
  for (let i = 0; i < end; i++) line(c, pts[i], pts[(i + 1) % n], r, g, b, a, width);
}
function line(c, p0, p1, r, g, b, a, width) {
  const dx = p1.x - p0.x, dy = p1.y - p0.y;
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy)));
  const hw = (width - 1) / 2;
  for (let s = 0; s <= steps; s++) {
    const x = p0.x + (dx * s) / steps, y = p0.y + (dy * s) / steps;
    for (let oy = -hw; oy <= hw; oy++) for (let ox = -hw; ox <= hw; ox++)
      setPx(c, Math.round(x + ox), Math.round(y + oy), r, g, b, a);
  }
}
function crosshair(c, p, r, g, b, size) {
  for (let d = -size; d <= size; d++) { setPx(c, Math.round(p.x + d), Math.round(p.y), r, g, b, 255); setPx(c, Math.round(p.x), Math.round(p.y + d), r, g, b, 255); }
}

// ───────────────────────── PNG encode ─────────────────────────
function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}
function chunk(type, data) {
  const t = Buffer.from(type, "ascii");
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
}
function encodePNG(c) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(c.w, 0); ihdr.writeUInt32BE(c.h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const raw = Buffer.alloc(c.h * (c.w * 4 + 1));
  for (let y = 0; y < c.h; y++) {
    raw[y * (c.w * 4 + 1)] = 0;
    c.data.copy ? null : null;
    Buffer.from(c.data.buffer, y * c.w * 4, c.w * 4).copy(raw, y * (c.w * 4 + 1) + 1);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0))]);
}

// ───────────────────────── render: silhouette ─────────────────────────
const outImg = outline.map((p) => toImg(p.x, p.y));
const sil = makeCanvas(IMG_W, IMG_H);
fillPoly(sil, outImg, 26, 26, 26, 255); // land solid dark, water transparent
fs.writeFileSync(out("island-silhouette.png"), encodePNG(sil));

// ───────── render: punched-out silhouette (clearings reserved) ─────────
// Helpers that OVERWRITE pixels (not alpha-blend) so footprints become holes.
function overwritePx(c, x, y, r, gg, b, a) {
  if (x < 0 || y < 0 || x >= c.w || y >= c.h) return;
  const i = (y * c.w + x) * 4; c.data[i] = r; c.data[i + 1] = gg; c.data[i + 2] = b; c.data[i + 3] = a;
}
function punchPoly(c, pts, r, gg, b, a) {
  let lo = Infinity, hi = -Infinity;
  for (const p of pts) { lo = Math.min(lo, p.y); hi = Math.max(hi, p.y); }
  lo = Math.max(0, Math.floor(lo)); hi = Math.min(c.h - 1, Math.ceil(hi));
  for (let y = lo; y <= hi; y++) {
    const xs = [];
    for (let i = 0; i < pts.length; i++) {
      const a1 = pts[i], b1 = pts[(i + 1) % pts.length];
      if ((a1.y <= y && b1.y > y) || (b1.y <= y && a1.y > y)) { const t = (y - a1.y) / (b1.y - a1.y); xs.push(a1.x + t * (b1.x - a1.x)); }
    }
    xs.sort((p, q) => p - q);
    for (let k = 0; k + 1 < xs.length; k += 2)
      for (let x = Math.round(xs[k]); x <= Math.round(xs[k + 1]); x++) overwritePx(c, x, y, r, gg, b, a);
  }
}
// Diagonal hatch inside a polygon (clear "reserved" marking).
function hatchPoly(c, pts, r, gg, b, a, spacing) {
  let lo = Infinity, hi = -Infinity, lx = Infinity, rx = -Infinity;
  for (const p of pts) { lo = Math.min(lo, p.y); hi = Math.max(hi, p.y); lx = Math.min(lx, p.x); rx = Math.max(rx, p.x); }
  const inside = (px, py) => {
    let c2 = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      if (((pts[i].y > py) !== (pts[j].y > py)) && (px < (pts[j].x - pts[i].x) * (py - pts[i].y) / (pts[j].y - pts[i].y) + pts[i].x)) c2 = !c2;
    }
    return c2;
  };
  for (let d = Math.floor(lo - (rx - lx)); d < hi; d += spacing) {
    for (let y = Math.max(0, Math.floor(lo)); y <= Math.min(c.h - 1, Math.ceil(hi)); y++) {
      const x = Math.round(d + (y - lo)); // 45° lines
      if (x >= 0 && x < c.w && inside(x, y)) overwritePx(c, x, y, r, gg, b, a);
    }
  }
}
const zoneDiamond = (z) => {
  const p = z.pos, w = z.fp.w, h = z.fp.h;
  return [ tileToScreen(p.x, p.y), tileToScreen(p.x + w, p.y), tileToScreen(p.x + w, p.y + h), tileToScreen(p.x, p.y + h) ].map(c => toImg(c.x, c.y));
};
const punched = makeCanvas(IMG_W, IMG_H);
fillPoly(punched, outImg, 26, 26, 26, 255);
for (const z of zonesArr()) {
  const d = zoneDiamond(z);
  fillPoly(punched, d, 224, 60, 60, 130);                                       // translucent red "reserved" fill
  strokePoly(punched, d, 235, 70, 70, 255, Math.max(4, Math.round(S * 2)));     // bold red outline
}
fs.writeFileSync(out("island-silhouette-punched.png"), encodePNG(punched));
function zonesArr() { return zones; }

// ───────────────────────── render: placement guide ─────────────────────────
const g = makeCanvas(IMG_W, IMG_H);
// land fill light
fillPoly(g, outImg, 230, 224, 205, 255);
// faint walk-grid diamonds
for (const c of landCells) {
  const t = tileToScreen(c.x, c.y);
  const dia = [ {x:t.x,y:t.y}, {x:t.x+HW,y:t.y+HH}, {x:t.x,y:t.y+TILE_H}, {x:t.x-HW,y:t.y+HH} ].map(p=>toImg(p.x,p.y));
  strokePoly(g, dia, 200, 190, 165, 110, 1);
}
// coast outline bold
strokePoly(g, outImg, 60, 50, 40, 255, Math.max(2, Math.round(S * 1.2)));
// suggested path spine: dock -> spawn -> campfire -> (lighthouse, treehouse, art, arcade, beach)
const center = (z) => footprintCenter(z.pos, z.fp.w, z.fp.h);
const byKey = Object.fromEntries(zones.map(z=>[z.key,z]));
const pathLinks = [
  ["welcome_dock","campfire_circle"],
  ["campfire_circle","lighthouse_point"],
  ["campfire_circle","treehouse_hideaway"],
  ["campfire_circle","art_hut"],
  ["campfire_circle","arcade_cove"],
  ["campfire_circle","calm_beach"],
];
for (const [a,b] of pathLinks) {
  const pa = toImg(center(byKey[a]).x, center(byKey[a]).y);
  const pb = toImg(center(byKey[b]).x, center(byKey[b]).y);
  line(g, pa, pb, 188, 150, 92, 200, Math.max(3, Math.round(S * 3)));
}
// zone footprints as colored diamonds spanning their grid cells
const zoneColors = {
  lighthouse_point:[226,59,59], treehouse_hideaway:[60,150,70], art_hut:[180,90,200],
  campfire_circle:[255,140,40], arcade_cove:[74,91,208], calm_beach:[80,180,210], welcome_dock:[150,107,64],
};
for (const z of zones) {
  // footprint outline: trace the 4 outer diamond corners of the WxH block
  const p = z.pos, w = z.fp.w, h = z.fp.h;
  const corners = [
    tileToScreen(p.x, p.y),                       // top
    tileToScreen(p.x + w, p.y),                   // right-ish
    tileToScreen(p.x + w, p.y + h),               // bottom
    tileToScreen(p.x, p.y + h),                   // left-ish
  ].map(c=>toImg(c.x, c.y));
  const col = zoneColors[z.key];
  strokePoly(g, corners, col[0], col[1], col[2], 255, Math.max(3, Math.round(S*1.5)));
  const ctr = toImg(center(z).x, center(z).y);
  crosshair(g, ctr, col[0], col[1], col[2], Math.round(S*5));
}
// spawn crosshair (green) + dock marker
crosshair(g, toImg(tileCenter(spawnPoint.x, spawnPoint.y).x, tileCenter(spawnPoint.x, spawnPoint.y).y), 0, 200, 0, Math.round(S*6));
fs.writeFileSync(out("island-placement-guide.png"), encodePNG(g));

// ───────────────────────── report numbers ─────────────────────────
const fmt = (n) => Math.round(n * 100) / 100;
console.log("LAND CELLS:", landCells.length);
console.log("OUTLINE POINTS:", outline.length);
console.log("--- world-pixel extents ---");
console.log("coast outline   X:[", fmt(minX), ",", fmt(maxX), "]  Y:[", fmt(minY), ",", fmt(maxY), "]");
console.log("land-cell cells X:[", fmt(cminX), ",", fmt(cmaxX), "]  Y:[", fmt(cminY), ",", fmt(cmaxY), "]");
console.log("union           X:[", fmt(unionMinX), ",", fmt(unionMaxX), "]  Y:[", fmt(unionMinY), ",", fmt(unionMaxY), "]");
console.log("island world W x H (no margin):", fmt(unionMaxX-unionMinX), "x", fmt(unionMaxY-unionMinY));
console.log("--- image ---");
console.log("MARGIN world px:", MARGIN);
console.log("originX,originY (world @ img 0,0):", fmt(originX), ",", fmt(originY));
console.log("worldW x worldH (with margin):", fmt(worldW), "x", fmt(worldH));
console.log("SCALE S (img px per world px):", fmt(S));
console.log("IMAGE:", IMG_W, "x", IMG_H, "aspect", fmt(IMG_W/IMG_H));
console.log("--- registration formula ---");
console.log("img_px(gx,gy tile-center) = ( ((gx-gy)*32 -", fmt(originX), ")*", fmt(S), " , ((gx+gy)*16 +16 -", fmt(originY), ")*", fmt(S), " )");
console.log("--- zone / spawn image-pixel centers ---");
for (const z of zones) { const ci = toImg(center(z).x, center(z).y); console.log(z.key.padEnd(20), "grid", JSON.stringify(z.pos), "fp", JSON.stringify(z.fp), "-> img px", Math.round(ci.x)+","+Math.round(ci.y)); }
const sp = tileCenter(spawnPoint.x, spawnPoint.y); const spi = toImg(sp.x, sp.y);
console.log("spawnPoint".padEnd(20), "grid", JSON.stringify(spawnPoint), "-> img px", Math.round(spi.x)+","+Math.round(spi.y));
