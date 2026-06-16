import sharp from 'sharp';

const SRC = 'source/home-island-raw.png';
const OUT = 'home-island.png';

const { data, info } = await sharp(SRC).raw().toBuffer({ resolveWithObject: true });
const { width: W, height: H, channels: C } = info;
if (C !== 4) throw new Error('expected RGBA');
const N = W * H;
const px = Buffer.from(data); // mutable copy

const R = i => px[i*4], G = i => px[i*4+1], B = i => px[i*4+2], A = i => px[i*4+3];

// Flood-fill from the border. Traverse (and delete) a pixel if it is part of
// the exterior water/vignette: anything not-fully-opaque whose hue is cool
// (green/teal, G>=R) or very dark. Warm sand (R>G) and opaque foliage (A>=250)
// act as walls, so the painted foam ring and coastal trees are preserved.
const visited = new Uint8Array(N);
const stack = [];
const push = (x, y) => {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const idx = y * W + x;
  if (visited[idx]) return;
  visited[idx] = 1;
  const a = A(idx), r = R(idx), g = G(idx);
  const lum = Math.max(r, g, B(idx));
  const cool = g >= r - 3;            // teal/green water (not warm sand)
  const dark = lum < 90;              // black vignette
  const removable = a < 250 && (cool || dark);
  if (removable) {
    px[idx*4+3] = 0;                  // knock to transparent
    stack.push(idx);
  }
};
// Seed every border pixel.
for (let x = 0; x < W; x++) { push(x, 0); push(x, H - 1); }
for (let y = 0; y < H; y++) { push(0, y); push(W - 1, y); }
while (stack.length) {
  const idx = stack.pop();
  const x = idx % W, y = (idx - x) / W;
  push(x + 1, y); push(x - 1, y); push(x, y + 1); push(x, y - 1);
}

// Tidy: any stray near-zero alpha -> fully clear.
let kept = 0, cleared = 0;
for (let i = 0; i < N; i++) {
  if (px[i*4+3] < 6) { px[i*4+3] = 0; }
  if (px[i*4+3] === 0) cleared++; else kept++;
}

await sharp(px, { raw: { width: W, height: H, channels: 4 } })
  .png({ compressionLevel: 9 }).toFile(OUT);

// Diagnostics: composite over magenta and a checkerboard so the cutout is visible.
const magenta = await sharp({ create: { width: W, height: H, channels: 4, background: { r: 255, g: 0, b: 255, alpha: 1 } } }).png().toBuffer();
await sharp(magenta).composite([{ input: OUT }]).png().toFile('preview-on-magenta.png');

// Checkerboard
const cb = Buffer.alloc(N * 4);
const S = 24;
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const i = (y*W+x)*4; const c = ((x/S|0)+(y/S|0))&1 ? 210 : 245;
  cb[i]=c; cb[i+1]=c; cb[i+2]=c; cb[i+3]=255;
}
await sharp(cb, { raw: { width: W, height: H, channels: 4 } }).composite([{ input: OUT }]).png().toFile('preview-on-checker.png');

console.log(`done. kept=${kept} cleared=${cleared} (${(100*kept/N).toFixed(1)}% opaque-ish)`);
console.log('wrote', OUT, ', preview-on-magenta.png, preview-on-checker.png');
