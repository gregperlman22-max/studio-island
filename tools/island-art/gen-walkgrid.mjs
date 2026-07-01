import { readFileSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';

// ── engine constants / registration (must mirror the runtime) ──
const TILE_W = 64, TILE_H = 32, CLIFF = 14, SPAN_W = 1600;
const t2s = (gx, gy) => ({ x: (gx - gy) * 32, y: (gx + gy) * 16 });
const tc  = (gx, gy) => { const t = t2s(gx, gy); return { x: t.x, y: t.y + 16 }; };

// Sampling center = the CURRENT worldBounds center (from the unchanged
// landCells). landCells is left intact so worldBounds / sand placement / the
// coast shimmer never move; we only derive a NEW walkable base that matches the
// rendered sand silhouette. Keep this in lock-step with computeWorldBounds().
const src = readFileSync('../../packages/island-scene/src/defaultLayout.ts', 'utf8');
const grab = (n) => src.match(new RegExp(`const ${n}[\\s\\S]*?= \\[([\\s\\S]*?)\\n\\];`))[1];
const expand = (body) => { const a = eval('[' + body + ']'); const c = []; for (const [y, r] of a) for (const [x0, x1] of r) for (let x = x0; x <= x1; x++) c.push({ x, y }); return c; };
const landCells = expand(grab('LAND_ROWS'));
const obstacleCells = expand(grab('OBSTACLE_ROWS'));
const spawn = (() => { const m = src.match(/spawnPoint: GridPosition = \{ x: (\d+), y: (\d+) \}/); return { x: +m[1], y: +m[2] }; })();
const GRID_W = +src.match(/const GRID_W = (\d+);/)[1];
const GRID_H = +src.match(/const GRID_H = (\d+);/)[1];
const zones = [];
{ const zRe = /gridPosition: \{ x: (\d+), y: (\d+) \}, footprint: \{ w: (\d+), h: (\d+) \}/g; let zm; while ((zm = zRe.exec(src))) zones.push({ x: +zm[1], y: +zm[2], w: +zm[3], h: +zm[4] }); }

// current worldBounds center (from landCells) — the sand render position
let mnX = Infinity, mxX = -Infinity, mnY = Infinity, mxY = -Infinity;
for (const c of landCells) { const { x, y } = t2s(c.x, c.y); mnX = Math.min(mnX, x - 32); mxX = Math.max(mxX, x + 32); mnY = Math.min(mnY, y - 40); mxY = Math.max(mxY, y + TILE_H + CLIFF); }
const CX = (mnX + mxX) / 2, CY = (mnY + mxY) / 2;

// ── sample sand-base-v2 alpha (the painting that actually renders) ──
const STW = 1100, STH = 878, scale = SPAN_W / STW;
const { data } = await sharp('../../packages/island-scene/src/assets/sprites/sand-base-v2.png').raw().toBuffer({ resolveWithObject: true });
const alpha = (sx, sy) => { const x = Math.round(sx), y = Math.round(sy); if (x < 0 || y < 0 || x >= STW || y >= STH) return 0; return data[(y * STW + x) * 4 + 3]; };
const cellAlpha = (gx, gy) => { const w = tc(gx, gy); return alpha((w.x - CX) / scale + STW / 2, (w.y - CY) / scale + STH / 2); };

// Defaults reproduce the shipped grid: keep a cell when its CENTRE sits on
// clearly-opaque sand (alpha > 200), with NO inland erosion — this keeps the
// avatar's feet off the ocean/anti-aliased waterline while preserving the full
// coastal perimeter (incl. the treehouse shore).
const AT = Number(process.env.AT ?? 200);     // sand alpha above this = solid land
const ERODE = Number(process.env.ERODE ?? 0); // cells to pull the edge inland

// on-sand cells (center opaque), clamped to the layout grid
let onSand = new Set();
for (let gx = 0; gx < GRID_W; gx++) for (let gy = 0; gy < GRID_H; gy++) if (cellAlpha(gx, gy) > AT) onSand.add(`${gx},${gy}`);

// erode N cells: drop any cell with an 8-neighbour off-sand (pulls edge inland)
const erode1 = (set) => {
  const out = new Set();
  for (const k of set) { const [x, y] = k.split(',').map(Number); let edge = false;
    for (let dx = -1; dx <= 1 && !edge; dx++) for (let dy = -1; dy <= 1; dy++) { if (!dx && !dy) continue; if (!set.has(`${x + dx},${y + dy}`)) { edge = true; break; } }
    if (!edge) out.add(k); }
  return out;
};
let walk = onSand;
for (let i = 0; i < ERODE; i++) walk = erode1(walk);

// largest 4-connected component (drop detached sandbars/specks)
const largest = (cellSet) => {
  const seen = new Set(); let best = [];
  for (const k0 of cellSet) { if (seen.has(k0)) continue; const [sx, sy] = k0.split(',').map(Number); const st = [[sx, sy]]; seen.add(k0); const comp = [];
    while (st.length) { const [x, y] = st.pop(); comp.push({ x, y }); for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) { const k = `${x+dx},${y+dy}`; if (cellSet.has(k) && !seen.has(k)) { seen.add(k); st.push([x+dx, y+dy]); } } }
    if (comp.length > best.length) best = comp; }
  return best;
};
const walkComp = largest(walk);
const walkSet = new Set(walkComp.map(c => `${c.x},${c.y}`));

// ── reachability check (mirror buildGrid + pathfinder connectivity) ──
// Obstacle blocking is intentionally DROPPED: obstacleCells were derived from the
// legacy home-island.png (never rendered) and, laid over the sand silhouette,
// wall the spawn off from the northern zones — forcing the old grid's only
// spawn→zone paths across ocean cells. Only zone footprints block here.
const blocked = new Set();
void obstacleCells;
for (const z of zones) for (let dx = 0; dx < z.w; dx++) for (let dy = 0; dy < z.h; dy++) blocked.add(`${z.x + dx},${z.y + dy}`);
const passable = (x, y) => walkSet.has(`${x},${y}`) && !blocked.has(`${x},${y}`);
const nearestWalkable = (tx, ty, maxR = 14) => { if (passable(tx, ty)) return [tx, ty]; for (let r = 1; r <= maxR; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue; if (passable(tx + dx, ty + dy)) return [tx + dx, ty + dy]; } return null; };
const seed = passable(spawn.x, spawn.y) ? [spawn.x, spawn.y] : nearestWalkable(spawn.x, spawn.y);
const reach = new Set();
if (seed) { const st = [seed]; reach.add(`${seed[0]},${seed[1]}`);
  while (st.length) { const [x, y] = st.pop();
    for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) { const nx = x+dx, ny = y+dy, k = `${nx},${ny}`; if (passable(nx, ny) && !reach.has(k)) { reach.add(k); st.push([nx, ny]); } }
    for (const [dx, dy] of [[1,1],[1,-1],[-1,1],[-1,-1]]) { const nx = x+dx, ny = y+dy, k = `${nx},${ny}`; if (passable(nx, ny) && passable(x+dx, y) && passable(x, y+dy) && !reach.has(k)) { reach.add(k); st.push([nx, ny]); } } } }

let allReach = true;
console.log(`center CX=${CX} CY=${CY}  AT=${AT} ERODE=${ERODE}`);
console.log(`onSand=${onSand.size} eroded=${walk.size} largestComp=${walkComp.length} reachable=${reach.size}`);
for (const z of zones) { const e = nearestWalkable(Math.floor(z.x + z.w / 2), Math.floor(z.y + z.h / 2)); const ok = e && reach.has(`${e[0]},${e[1]}`); if (!ok) { allReach = false; console.log(`  UNREACHABLE zone @(${z.x},${z.y}) ${z.w}x${z.h}`); } }
const df = nearestWalkable(46, 40); if (!(df && reach.has(`${df[0]},${df[1]}`))) { allReach = false; console.log('  UNREACHABLE dock_front(46,40)'); }
console.log(allReach ? 'ALL ZONES REACHABLE ✓' : 'REACHABILITY FAILED ✗');

// ── how many walkable-over-water remain (against sand, center-sample) ──
let water = 0; for (const k of reach) { const [x, y] = k.split(',').map(Number); if (cellAlpha(x, y) <= 40) water++; }
console.log(`walkable-over-water (reachable, alpha<=40): ${water}`);

// ── encode WALK_ROWS ──
const enc = (set) => { const rows = []; for (let y = 0; y < GRID_H; y++) { const xs = []; for (let x = 0; x < GRID_W; x++) if (set.has(`${x},${y}`)) xs.push(x); if (!xs.length) continue; const r = []; let s = xs[0], p = xs[0]; for (let i = 1; i < xs.length; i++) { if (xs[i] === p + 1) p = xs[i]; else { r.push([s, p]); s = p = xs[i]; } } r.push([s, p]); rows.push([y, r]); } return rows; };
const fmt = (rows) => rows.map(([y, r]) => `  [${y}, [${r.map(([a, b]) => `[${a},${b}]`).join(', ')}]],`).join('\n');
writeFileSync('walk-rows.txt', fmt(enc(walkSet)) + '\n');
console.log(`\nwrote walk-rows.txt (${walkSet.size} walkable cells)`);
