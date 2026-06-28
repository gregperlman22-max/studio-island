import sharp from 'sharp';

// Offline sanity check: composite each landmark onto the terrain art using the
// SAME registration the renderer uses, so placement (clearing fit, base pin,
// relative scale) is verifiable without a browser. Does NOT show depth-sort vs
// the avatar or animations.
const ROOT = '../../packages/island-scene/src/assets';
const GROUND = `${ROOT}/home-island.png`;
const ORIGIN_X = -1056, ORIGIN_Y = 112, GSCALE = 1.5;
const HW = 32, HH = 16; // TILE_W/2, TILE_H/2

const tileCenter = (gx, gy) => ({ x: (gx - gy) * HW, y: (gx + gy) * HH + HH });
const footprintCenter = (px, py, w, h) => tileCenter(px + (w - 1) / 2, py + (h - 1) / 2);

// Mirrors defaultLayout.sampleZones + zones.LANDMARK_ART (Part-B baseline).
const ZONES = [
  { key: 'lighthouse_point', file: 'lighthouse',   x: 30, y: 4,  w: 4, h: 4, scale: 0.675,  ax: 0.5464, ay: 0.8789 },
  { key: 'treehouse_hideaway', file: 'treehouse',  x: 4,  y: 20, w: 5, h: 5, scale: 0.475,  ax: 0.501,  ay: 0.8848 },
  { key: 'art_hut', file: 'art-hut',               x: 28, y: 20, w: 4, h: 4, scale: 0.445,  ax: 0.5181, ay: 0.7236 },
  { key: 'campfire_circle', file: 'campfire',      x: 19, y: 24, w: 4, h: 4, scale: 0.255,  ax: 0.499,  ay: 0.75 },
  { key: 'arcade_cove', file: 'arcade',            x: 42, y: 24, w: 5, h: 4, scale: 0.324,  ax: 0.5103, ay: 0.8457 },
  { key: 'calm_beach', file: 'calm-beach',         x: 5,  y: 31, w: 6, h: 4, scale: 0.33,   ax: 0.4385, ay: 0.7598 },
  { key: 'welcome_dock', file: 'welcome-dock',     x: 43, y: 37, w: 6, h: 4, scale: 0.395,  ax: 0.5205, ay: 0.7676 },
];
// Boat berths just off the dock front (matches SceneRenderer.dockApproach toX/toY).
const BOAT = { file: 'boat', scale: 0.23, ax: 0.4892, ay: 0.9027, dx: -18, dy: 92 };

const composites = [];
for (const z of ZONES) {
  const c = footprintCenter(z.x, z.y, z.w, z.h);
  // world -> ground-image px
  const basePx = (c.x - ORIGIN_X) / GSCALE;
  const basePy = (c.y - ORIGIN_Y) / GSCALE;
  const sizeW = Math.round(1024 * z.scale / GSCALE);
  const sizeH = Math.round(1024 * z.scale / GSCALE);
  const left = Math.round(basePx - z.ax * sizeW);
  const top = Math.round(basePy - z.ay * sizeH);
  const buf = await sharp(`${ROOT}/landmarks/${z.file}.png`).resize(sizeW, sizeH).png().toBuffer();
  composites.push({ input: buf, left, top });
  // tiny magenta dot at the base point to confirm the pin lands on the clearing
  const dot = await sharp({ create: { width: 7, height: 7, channels: 4, background: { r: 255, g: 0, b: 255, alpha: 1 } } }).png().toBuffer();
  composites.push({ input: dot, left: Math.round(basePx) - 3, top: Math.round(basePy) - 3 });
  console.log(`${z.key}: base(${Math.round(basePx)},${Math.round(basePy)}) size ${sizeW}x${sizeH} at (${left},${top})`);
}

// Boat at the welcome_dock landing point.
{
  const dock = ZONES.find((z) => z.key === 'welcome_dock');
  const c = footprintCenter(dock.x, dock.y, dock.w, dock.h);
  const basePx = (c.x + BOAT.dx - ORIGIN_X) / GSCALE;
  const basePy = (c.y + BOAT.dy - ORIGIN_Y) / GSCALE;
  const sizeW = Math.round(1254 * BOAT.scale / GSCALE);
  const buf = await sharp(`${ROOT}/landmarks/${BOAT.file}.png`).resize(sizeW, sizeW).png().toBuffer();
  composites.push({ input: buf, left: Math.round(basePx - BOAT.ax * sizeW), top: Math.round(basePy - BOAT.ay * sizeW) });
  console.log(`boat: base(${Math.round(basePx)},${Math.round(basePy)}) size ${sizeW}`);
}

await sharp(GROUND).composite(composites).png().toFile('landmarks/_place-preview.png');
// Also a downscaled version for quick viewing.
await sharp('landmarks/_place-preview.png').resize(900).png().toFile('landmarks/_place-preview-small.png');
console.log('wrote _place-preview.png');
