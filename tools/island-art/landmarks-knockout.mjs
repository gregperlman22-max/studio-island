import sharp from 'sharp';

// Remove the soft baked ground smudge from a landmark PNG. The smudge is warm +
// light + SEMI-TRANSPARENT (same palette as the art), pooling on the ground and
// connected to the image border; the object body is OPAQUE. So opacity is the
// discriminator: flood from the border through everything that is not solidly
// opaque (the smudge + AA halo), walled in by the opaque object, and knock it
// to clear. The object and its self-shadow (opaque shading ON the object) stay;
// interior soft pixels (windows, gaps enclosed by the body) are never reached.
// This mirrors process.mjs's border flood, minus its cool/dark colour test
// (which doesn't apply — this smudge is warm).
const OPAQUE_WALL = 210; // alpha >= this is solid object (the flood wall)

const targets = process.argv.slice(2);
if (!targets.length) { console.error('usage: node landmarks-knockout.mjs <name...>'); process.exit(1); }

for (const name of targets) {
  const src = `landmarks/_orig-${name}.png`;
  const { data, info } = await sharp(src).raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H, channels: C } = info;
  const N = W * H;
  const px = Buffer.from(data);
  const A = i => px[i * C + C - 1];

  // Flood-fill from the border through non-opaque pixels; the opaque object
  // body walls it in. Every reached pixel is exterior smudge/halo -> clear it.
  const visited = new Uint8Array(N);
  const stack = [];
  let cleared = 0;
  const seed = (x, y) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const i = y * W + x;
    if (visited[i] || A(i) >= OPAQUE_WALL) return;
    visited[i] = 1;
    if (A(i) > 0) { px[i * C + C - 1] = 0; cleared++; }
    stack.push(i);
  };
  for (let x = 0; x < W; x++) { seed(x, 0); seed(x, H - 1); }
  for (let y = 0; y < H; y++) { seed(0, y); seed(W - 1, y); }
  while (stack.length) {
    const i = stack.pop();
    const x = i % W, y = (i - x) / W;
    seed(x + 1, y); seed(x - 1, y); seed(x, y + 1); seed(x, y - 1);
  }

  // Tidy near-zero alpha.
  for (let i = 0; i < N; i++) if (px[i * C + C - 1] < 6) px[i * C + C - 1] = 0;

  await sharp(px, { raw: { width: W, height: H, channels: C } })
    .png({ compressionLevel: 9 }).toFile(`landmarks/${name}.png`);
  console.log(`${name}: cleared ${cleared} smudge px (${(100*cleared/N).toFixed(2)}%)`);
}
