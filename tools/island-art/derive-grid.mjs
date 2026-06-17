import sharp from 'sharp';

// ── Iso projection (mirror of packages/island-scene/src/render/iso.ts) ──
const TILE_W = 64, TILE_H = 32;
const tileCenterX = (gx, gy) => (gx - gy) * (TILE_W / 2);
const tileCenterY = (gx, gy) => (gx + gy) * (TILE_H / 2) + TILE_H / 2;
const tileTopX = (gx, gy) => (gx - gy) * (TILE_W / 2);
const tileTopY = (gx, gy) => (gx + gy) * (TILE_H / 2);

// ── Registration knobs ──
// ART_SCALE = world-pixels per art-pixel. Larger = bigger island = more tiles.
// Chosen so the cell count / island-to-avatar proportion is in the same ball-
// park as the old procedural island (~1200 cells) while filling the painting.
const ART_SCALE = Number(process.env.S ?? 1.5);
const ALPHA_T = Number(process.env.AT ?? 110); // land if center alpha > this
const MARGIN = 2;

const { data, info } = await sharp('home-island.png').raw().toBuffer({ resolveWithObject: true });
const { width: W, height: H } = info;
const alphaAt = (ax, ay) => {
  const x = Math.round(ax), y = Math.round(ay);
  if (x < 0 || y < 0 || x >= W || y >= H) return 0;
  return data[(y * W + x) * 4 + 3];
};

// Base mapping (no offset): art(0,0) <-> world(0,0); art = worldCenter / S.
// Scan a generous integer cell range and keep cells whose CENTER is opaque.
const raw = [];
for (let gx = -200; gx <= 500; gx++) {
  for (let gy = -200; gy <= 500; gy++) {
    const ax = tileCenterX(gx, gy) / ART_SCALE;
    const ay = tileCenterY(gx, gy) / ART_SCALE;
    if (ax < -2 || ay < -2 || ax > W + 2 || ay > H + 2) continue;
    if (alphaAt(ax, ay) > ALPHA_T) raw.push([gx, gy]);
  }
}

// Largest 4-connected component (drop specks / detached sandbars).
const rawSet = new Set(raw.map(([x, y]) => `${x},${y}`));
const seen = new Set();
let best = [];
for (const [sx, sy] of raw) {
  const k0 = `${sx},${sy}`;
  if (seen.has(k0)) continue;
  const comp = [], st = [[sx, sy]]; seen.add(k0);
  while (st.length) {
    const [x, y] = st.pop(); comp.push([x, y]);
    for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      const k = `${x+dx},${y+dy}`;
      if (rawSet.has(k) && !seen.has(k)) { seen.add(k); st.push([x+dx, y+dy]); }
    }
  }
  if (comp.length > best.length) best = comp;
}

// Normalize so min cell = (MARGIN, MARGIN). Record the integer translation T.
let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
for (const [x, y] of best) { minx=Math.min(minx,x); miny=Math.min(miny,y); maxx=Math.max(maxx,x); maxy=Math.max(maxy,y); }
const Tx = -minx + MARGIN, Ty = -miny + MARGIN;
const cells = best.map(([x, y]) => ({ x: x + Tx, y: y + Ty }));
const GRID_W = (maxx + Tx) + MARGIN + 1;
const GRID_H = (maxy + Ty) + MARGIN + 1;

// Sprite registration for M4 (world-pixel position of art pixel (0,0)).
const SPRITE_WORLD_X = (Tx - Ty) * (TILE_W / 2);
const SPRITE_WORLD_Y = (Tx + Ty) * (TILE_H / 2);

console.log('=== M2 derived grid ===');
console.log('ART_SCALE        =', ART_SCALE, ' (world px per art px)');
console.log('ALPHA_T          =', ALPHA_T);
console.log('land cells       =', cells.length, ` (was ~1206 on the old ellipse)`);
console.log('GRID_W x GRID_H  =', GRID_W, 'x', GRID_H);
console.log('cell translation =', { Tx, Ty });
console.log('SPRITE world pos =', { x: SPRITE_WORLD_X, y: SPRITE_WORLD_Y }, '(art px (0,0) -> this world px; sprite.scale = ART_SCALE)');

// ── Visual overlay: tint every art pixel that falls inside a land cell ──
const landSetOrig = new Set(best.map(([x, y]) => `${x},${y}`));
const sat = (gx, gy) => landSetOrig.has(`${gx},${gy}`);
const out = Buffer.from(data);
const a = Math.PI; void a;
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    // inverse of base mapping: world = art*S ; screenToTile
    const wx = x * ART_SCALE, wy = y * ART_SCALE;
    const hw = TILE_W / 2, hh = TILE_H / 2;
    const u = wx / hw, v = (wy - hh) / hh;
    const gx = Math.round((v + u) / 2), gy = Math.round((v - u) / 2);
    const i = (y * W + x) * 4;
    if (sat(gx, gy)) {
      // walkable land -> green tint
      out[i]   = Math.round(out[i]   * 0.45 + 40  * 0.55);
      out[i+1] = Math.round(out[i+1] * 0.45 + 230 * 0.55);
      out[i+2] = Math.round(out[i+2] * 0.45 + 60  * 0.55);
      out[i+3] = Math.max(out[i+3], 150);
    }
  }
}
// Composite over dark slate so transparent (water) reads distinct from land.
const bg = await sharp({ create: { width: W, height: H, channels: 4, background: { r: 26, g: 32, b: 44, alpha: 1 } } }).png().toBuffer();
await sharp(bg).composite([{ input: await sharp(out, { raw: { width: W, height: H, channels: 4 } }).png().toBuffer() }]).png().toFile('m2-overlay.png');
console.log('\nwrote m2-overlay.png (green tint = walkable cells, over the cutout)');

// ── Compact ASCII shape check ──
const set = new Set(cells.map(c => `${c.x},${c.y}`));
const stepX = Math.ceil(GRID_W / 90), stepY = Math.ceil(GRID_H / 60);
let ascii = '';
for (let y = 0; y < GRID_H; y += stepY) {
  let row = '';
  for (let x = 0; x < GRID_W; x += stepX) row += set.has(`${x},${y}`) ? '#' : ' ';
  ascii += row.replace(/\s+$/, '') + '\n';
}
console.log(`\n=== ASCII shape (sampled every ${stepX}x${stepY} cells) ===`);
console.log(ascii);

// Persist the derived data for review/M4.
const { writeFileSync } = await import('node:fs');
writeFileSync('m2-grid.json', JSON.stringify({
  ART_SCALE, ALPHA_T, GRID_W, GRID_H, Tx, Ty,
  SPRITE_WORLD_X, SPRITE_WORLD_Y, count: cells.length, cells,
}));
console.log('wrote m2-grid.json');
