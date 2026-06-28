import sharp from 'sharp';

// Overlay iso grid-cell centre dots + coords on the terrain so we can read off
// which grid cell sits at a painted feature (e.g. the campfire sand donut).
const ORIGIN_X = -1056, ORIGIN_Y = 112, GSCALE = 1.5, HW = 32, HH = 16;
const tileCenter = (gx, gy) => ({ x: (gx - gy) * HW, y: (gx + gy) * HH + HH });
const toPx = (wx, wy) => ({ x: (wx - ORIGIN_X) / GSCALE, y: (wy - ORIGIN_Y) / GSCALE });

const { width: W, height: H } = await sharp('home-island.png').metadata();
let svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">`;
for (let gx = 14; gx <= 22; gx++) for (let gy = 21; gy <= 28; gy++) {
  const c = tileCenter(gx, gy);
  const p = toPx(c.x, c.y);
  if (p.x < 0 || p.y < 0 || p.x > W || p.y > H) continue;
  svg += `<circle cx="${p.x.toFixed(0)}" cy="${p.y.toFixed(0)}" r="4" fill="#ff00ff" stroke="#000" stroke-width="1"/>`;
  svg += `<text x="${(p.x + 5).toFixed(0)}" y="${(p.y - 5).toFixed(0)}" font-size="15" fill="#a000a0" stroke="#fff" stroke-width="0.5" font-family="monospace" font-weight="bold">${gx},${gy}</text>`;
}
svg += `</svg>`;
const composed = await sharp('home-island.png')
  .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
  .png().toBuffer();
await sharp(composed)
  .extract({ left: 430, top: 290, width: 380, height: 380 })
  .resize(560).png().toFile('landmarks/_grid-campfire.png');
console.log('wrote _grid-campfire.png');
