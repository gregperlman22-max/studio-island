import { readFileSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';

// ── constants mirrored from the engine ──
const TILE_W = 64, TILE_H = 32, CLIFF = 14;
const SPAN_W = 1600;                     // SceneRenderer.ISLAND_SPAN_W
const tileToScreen = (gx, gy) => ({ x: (gx - gy) * (TILE_W / 2), y: (gx + gy) * (TILE_H / 2) });
const tileCenter   = (gx, gy) => { const t = tileToScreen(gx, gy); return { x: t.x, y: t.y + TILE_H / 2 }; };

// ── parse defaultLayout.ts ──
const src = readFileSync('../../packages/island-scene/src/defaultLayout.ts', 'utf8');
const grab = (name) => {
  const m = src.match(new RegExp(`const ${name}[\\s\\S]*?= \\[([\\s\\S]*?)\\n\\];`));
  return m[1];
};
const expandRows = (body) => {
  const cells = [];
  const rowRe = /\[\s*(\d+)\s*,\s*\[([^\]]*(?:\][^\]]*)*?)\]\s*\]/g; // [y, [[a,b],...]]
  // simpler: eval the array literal
  const arr = eval('[' + body + ']');
  for (const [y, ranges] of arr) for (const [x0, x1] of ranges) for (let x = x0; x <= x1; x++) cells.push({ x, y });
  return cells;
};
// Walk base mirrors buildGrid: WALK_ROWS (rendered-sand silhouette) when present,
// else the legacy LAND_ROWS. Obstacle blocking is dropped in buildGrid, so none here.
const landCells = expandRows(/WALK_ROWS/.test(src) ? grab('WALK_ROWS') : grab('LAND_ROWS'));
const obstacleCells = [];
const spawn = (() => { const m = src.match(/spawnPoint: GridPosition = \{ x: (\d+), y: (\d+) \}/); return { x: +m[1], y: +m[2] }; })();

// zones
const zones = [];
const zRe = /gridPosition: \{ x: (\d+), y: (\d+) \}, footprint: \{ w: (\d+), h: (\d+) \}/g;
let zm; while ((zm = zRe.exec(src))) zones.push({ x: +zm[1], y: +zm[2], w: +zm[3], h: +zm[4] });

// ── reconstruct buildGrid() reachable set ──
const land = new Set(landCells.map(c => `${c.x},${c.y}`));
const blocked = new Set();
for (const o of obstacleCells) blocked.add(`${o.x},${o.y}`);
for (const z of zones) for (let dx = 0; dx < z.w; dx++) for (let dy = 0; dy < z.h; dy++) blocked.add(`${z.x + dx},${z.y + dy}`);
const base = (x, y) => land.has(`${x},${y}`) && !blocked.has(`${x},${y}`);
const nearestWalkable = (p, maxR = 14) => {
  if (base(p.x, p.y)) return p;
  for (let r = 1; r <= maxR; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
    if (base(p.x + dx, p.y + dy)) return { x: p.x + dx, y: p.y + dy };
  }
  return null;
};
const seed = base(spawn.x, spawn.y) ? spawn : (nearestWalkable(spawn) ?? spawn);
const reachable = new Set();
if (base(seed.x, seed.y)) {
  const st = [seed]; reachable.add(`${seed.x},${seed.y}`);
  while (st.length) {
    const c = st.pop();
    for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      const nx = c.x + dx, ny = c.y + dy, k = `${nx},${ny}`;
      if (base(nx, ny) && !reachable.has(k)) { reachable.add(k); st.push({ x: nx, y: ny }); }
    }
    for (const [dx, dy] of [[1,1],[1,-1],[-1,1],[-1,-1]]) {
      const nx = c.x + dx, ny = c.y + dy, k = `${nx},${ny}`;
      if (base(nx, ny) && base(c.x + dx, c.y) && base(c.x, c.y + dy) && !reachable.has(k)) { reachable.add(k); st.push({ x: nx, y: ny }); }
    }
  }
}
const walkCells = [...reachable].map(k => { const [x, y] = k.split(',').map(Number); return { x, y }; });

// ── worldBounds (mirror computeWorldBounds) — runtime uses layout.landCells
//    (the original LAND_ROWS), NOT the walk set, so read it directly. ──
const boundsCells = expandRows(grab('LAND_ROWS'));
let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
for (const c of boundsCells) {
  const { x, y } = tileToScreen(c.x, c.y);
  minX = Math.min(minX, x - TILE_W / 2); maxX = Math.max(maxX, x + TILE_W / 2);
  minY = Math.min(minY, y - 40);        maxY = Math.max(maxY, y + TILE_H + CLIFF);
}
const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;

// ── sand sprite registration (LayeredIsland.layout) ──
const sandMeta = await sharp('../../packages/island-scene/src/assets/sprites/sand-base-v2.png').metadata();
const STW = sandMeta.width, STH = sandMeta.height;
const sandScale = SPAN_W / STW;              // world px per texture px
// world (wx,wy) -> sand texture pixel:  tex = (world - center)/scale + texSize/2
const worldToSandTex = (wx, wy) => ({ sx: (wx - cx) / sandScale + STW / 2, sy: (wy - cy) / sandScale + STH / 2 });

// load sand alpha
const { data: sandData } = await sharp('../../packages/island-scene/src/assets/sprites/sand-base-v2.png').raw().toBuffer({ resolveWithObject: true });
const sandAlpha = (sx, sy) => {
  const x = Math.round(sx), y = Math.round(sy);
  if (x < 0 || y < 0 || x >= STW || y >= STH) return 0;
  return sandData[(y * STW + x) * 4 + 3];
};

// ── classify each walkable cell against the VISIBLE sand silhouette ──
const ALPHA_WATER = 40; // sand alpha below this => visible ocean
const onWater = [];
for (const c of walkCells) {
  const w = tileCenter(c.x, c.y);
  const { sx, sy } = worldToSandTex(w.x, w.y);
  const a = sandAlpha(sx, sy);
  if (a <= ALPHA_WATER) onWater.push({ ...c, alpha: a });
}

console.log(`grid ${grab ? '' : ''}land=${landCells.length} obstacle=${obstacleCells.length} walkable(reachable)=${walkCells.length}`);
console.log(`worldBounds center cx=${cx.toFixed(1)} cy=${cy.toFixed(1)}  sandScale=${sandScale.toFixed(4)} STW=${STW} STH=${STH}`);
console.log(`WALKABLE-OVER-VISIBLE-WATER cells: ${onWater.length}`);

// distribution buckets
const bx0 = Math.min(...walkCells.map(c => c.x)), bx1 = Math.max(...walkCells.map(c => c.x));
const by0 = Math.min(...walkCells.map(c => c.y)), by1 = Math.max(...walkCells.map(c => c.y));
console.log(`walkable x[${bx0}..${bx1}] y[${by0}..${by1}]`);

// cluster the water cells (8-conn)
const wset = new Set(onWater.map(c => `${c.x},${c.y}`));
const seenC = new Set(); const clusters = [];
for (const c of onWater) {
  const k0 = `${c.x},${c.y}`; if (seenC.has(k0)) continue;
  const st = [c]; seenC.add(k0); const comp = [];
  while (st.length) { const p = st.pop(); comp.push(p);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      if (!dx && !dy) continue; const nk = `${p.x + dx},${p.y + dy}`;
      if (wset.has(nk) && !seenC.has(nk)) { seenC.add(nk); st.push({ x: p.x + dx, y: p.y + dy }); } } }
  clusters.push(comp);
}
clusters.sort((a, b) => b.length - a.length);
console.log(`\n${clusters.length} water clusters (size >=1). Top clusters:`);
for (const comp of clusters.slice(0, 12)) {
  const xs = comp.map(c => c.x), ys = comp.map(c => c.y);
  const mnx = Math.min(...xs), mxx = Math.max(...xs), mny = Math.min(...ys), mxy = Math.max(...ys);
  const near = zones.map(z => { const zc = { x: z.x + z.w / 2, y: z.y + z.h / 2 }; const d = Math.hypot((mnx + mxx) / 2 - zc.x, (mny + mxy) / 2 - zc.y); return { z, d }; }).sort((a, b) => a.d - b.d)[0];
  console.log(`  size=${String(comp.length).padStart(3)}  x[${mnx}..${mxx}] y[${mny}..${mxy}]  nearest zone@(${near.z.x},${near.z.y}) d=${near.d.toFixed(1)}`);
}

// Treehouse-west specific (zone treehouse at 11,18)
const th = zones.find(z => z.x === 11 && z.y === 18);
if (th) {
  const westWater = onWater.filter(c => c.x < th.x && c.y >= th.y - 3 && c.y <= th.y + th.h + 3);
  console.log(`\nWest-of-treehouse water cells (x<${th.x}, y in ${th.y - 3}..${th.y + th.h + 3}): ${westWater.length}`);
  console.log('  ' + westWater.map(c => `(${c.x},${c.y}:a${c.alpha})`).join(' '));
}

// ── overlay image ──
const scaleUp = 1; const out = Buffer.from(sandData);
const paint = (sx, sy, r, g, b) => { const x = Math.round(sx), y = Math.round(sy); if (x<0||y<0||x>=STW||y>=STH) return; const i=(y*STW+x)*4; out[i]=r; out[i+1]=g; out[i+2]=b; out[i+3]=255; };
for (const c of walkCells) {
  const w = tileCenter(c.x, c.y); const { sx, sy } = worldToSandTex(w.x, w.y);
  const water = wset.has(`${c.x},${c.y}`);
  for (let dx = -2; dx <= 2; dx++) for (let dy = -2; dy <= 2; dy++) paint(sx + dx, sy + dy, water ? 255 : 40, water ? 30 : 220, water ? 30 : 60);
}
const bg = await sharp({ create: { width: STW, height: STH, channels: 4, background: { r: 20, g: 28, b: 60, alpha: 1 } } }).png().toBuffer();
await sharp(bg).composite([{ input: await sharp(out, { raw: { width: STW, height: STH, channels: 4 } }).png().toBuffer() }]).png().toFile('diag-walkwater.png');
console.log('\nwrote diag-walkwater.png (green=walkable on sand, RED=walkable over visible ocean)');
