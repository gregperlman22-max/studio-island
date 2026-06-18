import sharp from 'sharp';

// boat.png ships on an opaque cream background with a soft cast ground shadow.
// The sail is ALSO cream, so a global colour key would erase it — instead flood
// from the border through "ground" pixels (cream bg + soft shadow: low
// saturation AND light), walled in by the saturated/dark boat. The sail is
// enclosed by the boat's rigging/outline, so the flood can't reach it.
// Raw source is boat.png as committed on main (cream bg). Back it up first:
//   cp landmarks/boat.png landmarks/_orig-boat.png   (then run this)
const SRC = 'landmarks/_orig-boat.png';
const SAT = 92;   // ground is desaturated; boat wood/teal is well above this
const LUM = 150;  // ground stays light; dark outlines (low lum) act as walls
const debug = process.argv.includes('--debug');

const { data, info } = await sharp(SRC).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const { width: W, height: H, channels: C } = info; // C === 4 after ensureAlpha
const N = W * H;
const px = Buffer.from(data);
const R = i => px[i*4], G = i => px[i*4+1], B = i => px[i*4+2];
const isGround = (i) => {
  const r = R(i), g = G(i), b = B(i);
  const lum = Math.max(r, g, b), sat = lum - Math.min(r, g, b);
  return sat < SAT && lum > LUM;
};

const visited = new Uint8Array(N);
const removed = new Uint8Array(N);
const stack = [];
const seed = (x, y) => {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = y * W + x;
  if (visited[i] || !isGround(i)) return;
  visited[i] = 1; removed[i] = 1; stack.push(i);
};
for (let x = 0; x < W; x++) { seed(x, 0); seed(x, H - 1); }
for (let y = 0; y < H; y++) { seed(0, y); seed(W - 1, y); }
let cleared = 0;
while (stack.length) {
  const i = stack.pop(); cleared++;
  const x = i % W, y = (i - x) / W;
  seed(x+1,y); seed(x-1,y); seed(x,y+1); seed(x,y-1);
}
for (let i = 0; i < N; i++) if (removed[i]) px[i*4+3] = 0;
// tidy
for (let i = 0; i < N; i++) if (px[i*4+3] < 6) px[i*4+3] = 0;

console.log(`cleared ${cleared} (${(100*cleared/N).toFixed(1)}%) ground px`);

if (debug) {
  // Red overlay of removed pixels on the original, to inspect leakage.
  const dbg = Buffer.from(data);
  for (let i = 0; i < N; i++) if (removed[i]) { dbg[i*4]=255; dbg[i*4+1]=0; dbg[i*4+2]=255; }
  await sharp(dbg, { raw: { width: W, height: H, channels: 4 } }).resize(420).png().toFile('landmarks/_boat-removed.png');
  console.log('wrote _boat-removed.png');
} else {
  await sharp(px, { raw: { width: W, height: H, channels: 4 } }).png({ compressionLevel: 9 }).toFile('landmarks/boat.png');
  console.log('wrote cleaned landmarks/boat.png');
}
