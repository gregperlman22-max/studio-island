import sharp from 'sharp';
import { readdirSync } from 'fs';

const files = readdirSync('landmarks').filter(f => f.endsWith('.png')).sort();

for (const f of files) {
  const { data, info } = await sharp(`landmarks/${f}`).raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H, channels: C } = info;
  const A = i => data[i * C + (C - 1)];

  // Alpha histogram buckets.
  let fullyClear = 0, fullyOpaque = 0, soft = 0; // soft = partial alpha (1..249)
  // Bounding boxes for "any alpha > threshold".
  let bbOpaque = { x0: W, y0: H, x1: 0, y1: 0 };  // alpha >= 250
  let bbAny = { x0: W, y0: H, x1: 0, y1: 0 };       // alpha >= 8
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const a = A(y * W + x);
      if (a < 8) { fullyClear++; continue; }
      if (a >= 250) {
        fullyOpaque++;
        if (x < bbOpaque.x0) bbOpaque.x0 = x; if (x > bbOpaque.x1) bbOpaque.x1 = x;
        if (y < bbOpaque.y0) bbOpaque.y0 = y; if (y > bbOpaque.y1) bbOpaque.y1 = y;
      } else soft++;
      if (x < bbAny.x0) bbAny.x0 = x; if (x > bbAny.x1) bbAny.x1 = x;
      if (y < bbAny.y0) bbAny.y0 = y; if (y > bbAny.y1) bbAny.y1 = y;
    }
  }
  const N = W * H;
  // A baked ground smudge shows up as a halo of SOFT pixels extending well below
  // the opaque object — measure how far "any alpha" extends past the opaque bbox
  // at the bottom, and the soft-pixel fraction.
  const bottomHalo = bbAny.y1 - bbOpaque.y1;
  const sideHaloL = bbOpaque.x0 - bbAny.x0;
  const sideHaloR = bbAny.x1 - bbOpaque.x1;
  console.log(`\n${f}  ${W}x${H}`);
  console.log(`  alpha: clear=${(100*fullyClear/N).toFixed(1)}%  soft=${(100*soft/N).toFixed(2)}%  opaque=${(100*fullyOpaque/N).toFixed(1)}%`);
  console.log(`  opaque bbox: x[${bbOpaque.x0}..${bbOpaque.x1}] y[${bbOpaque.y0}..${bbOpaque.y1}]`);
  console.log(`  any-alpha bbox: x[${bbAny.x0}..${bbAny.x1}] y[${bbAny.y0}..${bbAny.y1}]`);
  console.log(`  halo beyond opaque: bottom=${bottomHalo}px  left=${sideHaloL}px  right=${sideHaloR}px`);
}
