import sharp from 'sharp';

// Chosen starting scales (world px per art px). Hierarchy: lighthouse/treehouse
// tall, art-hut/arcade medium, campfire/calm-beach low, dock flat+wide.
const SCALE = {
  'lighthouse': 0.18, 'treehouse': 0.165, 'art-hut': 0.15, 'arcade': 0.135,
  'campfire': 0.088, 'calm-beach': 0.075, 'welcome-dock': 0.12,
};
const KEY = {
  'lighthouse': 'lighthouse_point', 'treehouse': 'treehouse_hideaway',
  'art-hut': 'art_hut', 'arcade': 'arcade_cove', 'campfire': 'campfire_circle',
  'calm-beach': 'calm_beach', 'welcome-dock': 'welcome_dock',
};

for (const name of Object.keys(SCALE)) {
  const { data, info } = await sharp(`landmarks/${name}.png`).raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H, channels: C } = info;
  const A = i => data[i * C + C - 1];
  let x0 = W, y0 = H, x1 = 0, y1 = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (A(y * W + x) >= 250) { if(x<x0)x0=x; if(x>x1)x1=x; if(y<y0)y0=y; if(y>y1)y1=y; }
  }
  const s = SCALE[name];
  const anchorX = +(((x0 + x1) / 2) / W).toFixed(4); // opaque horizontal center
  const anchorY = +((y1) / H).toFixed(4);            // opaque bottom (ground contact)
  // Label sits above the content top: distance base->content-top in world px.
  const contentTopAbove = (y1 - y0) * s;             // base to top, scaled
  const labelY = -Math.round(contentTopAbove + 14);
  const heightPx = Math.round((y1 - y0) * s);
  const widthPx = Math.round((x1 - x0) * s);
  console.log(`${KEY[name]}: { url: U("${name}"), scale: ${s}, anchorX: ${anchorX}, anchorY: ${anchorY}, labelY: ${labelY} },  // ~${widthPx}x${heightPx}px`);
}
