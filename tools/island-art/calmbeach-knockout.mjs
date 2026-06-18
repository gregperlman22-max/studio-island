import sharp from 'sharp';

// calm-beach: objects (umbrella, blanket, towel, stones) sit on an OPAQUE sandy
// ground halo that is the SAME warm tan as the objects — colour can't separate
// them, and the blanket's border is a light rope (no dark outline). But the
// objects carry fine detail (rope braid, stripes, stone speckle) → high local
// contrast, while the sand halo is smooth. So the wall is "textured/saturated/
// dark"; the smooth warm-light sand is flooded away from the border.
const SAT_W = 86;      // saturated (teal stripes, deep sand-shadow) = object
const DARK = 110;      // dark crevices/outlines = object
const CONTRAST = 42;   // local luminance range above this = textured object
const DILATE = 2;      // seal hairline gaps in the textured wall
const debug = process.argv.includes('--debug');

const SRC = 'landmarks/_orig-calm-beach.png';
const { data, info } = await sharp(SRC).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const { width: W, height: H } = info;
const N = W * H;
const px = Buffer.from(data);
const R = i => px[i*4], G = i => px[i*4+1], B = i => px[i*4+2], A = i => px[i*4+3];
const lum = i => Math.max(R(i), G(i), B(i));
const sat = i => lum(i) - Math.min(R(i), G(i), B(i));

// Local luminance contrast (max-min over a 3x3 window).
const localContrast = (x, y) => {
  let mn = 255, mx = 0;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const xx = x + dx, yy = y + dy;
    if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
    const l = lum(yy * W + xx);
    if (l < mn) mn = l; if (l > mx) mx = l;
  }
  return mx - mn;
};

// Wall = opaque object pixel (saturated, dark, or textured).
let wall = new Uint8Array(N);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const i = y * W + x;
  if (A(i) < 8) continue;
  if (sat(i) > SAT_W || lum(i) < DARK || localContrast(x, y) > CONTRAST) wall[i] = 1;
}
// Dilate the wall to seal hairline gaps between textured strokes.
for (let r = 0; r < DILATE; r++) {
  const next = wall.slice();
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (wall[y*W+x]) continue;
    const i = y*W+x;
    if ((x>0&&wall[i-1])||(x<W-1&&wall[i+1])||(y>0&&wall[i-W])||(y<H-1&&wall[i+W])) next[i]=1;
  }
  wall = next;
}

// Flood the smooth sand from the border, walled by the textured objects.
const visited = new Uint8Array(N), removed = new Uint8Array(N), stack = [];
const seed = (x, y) => {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = y * W + x;
  if (visited[i] || wall[i]) return;
  visited[i] = 1; if (A(i) > 0) removed[i] = 1; stack.push(i);
};
for (let x = 0; x < W; x++) { seed(x, 0); seed(x, H - 1); }
for (let y = 0; y < H; y++) { seed(0, y); seed(W - 1, y); }
while (stack.length) {
  const i = stack.pop();
  const x = i % W, y = (i - x) / W;
  seed(x+1,y); seed(x-1,y); seed(x,y+1); seed(x,y-1);
}
let cleared = 0;
for (let i = 0; i < N; i++) if (removed[i]) { px[i*4+3] = 0; cleared++; }
for (let i = 0; i < N; i++) if (px[i*4+3] < 6) px[i*4+3] = 0;
console.log(`calm-beach: cleared ${cleared} (${(100*cleared/N).toFixed(1)}%) sand px`);

if (debug) {
  const dbg = Buffer.from(data);
  for (let i = 0; i < N; i++) if (removed[i]) { dbg[i*4]=255; dbg[i*4+1]=0; dbg[i*4+2]=255; }
  await sharp(dbg, { raw: { width: W, height: H, channels: 4 } }).resize(440).png().toFile('landmarks/_knock-calm-beach-removed.png');
  console.log('wrote _knock-calm-beach-removed.png');
} else {
  await sharp(px, { raw: { width: W, height: H, channels: 4 } }).png({ compressionLevel: 9 }).toFile('landmarks/calm-beach.png');
  console.log('wrote landmarks/calm-beach.png');
}
