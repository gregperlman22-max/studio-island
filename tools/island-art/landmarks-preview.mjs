import sharp from 'sharp';
import { readdirSync } from 'fs';

const files = readdirSync('landmarks').filter(f => f.endsWith('.png') && !f.startsWith('_')).sort();
const S = 24; // checker square

const onBg = async (file, bg, out) => {
  const { width: W, height: H } = await sharp(file).metadata();
  const base = Buffer.alloc(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    let c;
    if (bg === 'checker') c = (((x / S) | 0) + ((y / S) | 0)) & 1 ? 205 : 245;
    if (bg === 'checker') { base[i] = c; base[i+1] = c; base[i+2] = c; base[i+3] = 255; }
    else { base[i] = 255; base[i+1] = 0; base[i+2] = 255; base[i+3] = 255; }
  }
  const composed = await sharp(base, { raw: { width: W, height: H, channels: 4 } })
    .composite([{ input: file }])
    .png().toBuffer();
  await sharp(composed).resize(440).png().toFile(out);
};

for (const f of files) {
  const name = f.replace('.png', '');
  await onBg(`landmarks/${f}`, 'checker', `landmarks/_preview-${name}-checker.png`);
  await onBg(`landmarks/${f}`, 'magenta', `landmarks/_preview-${name}-magenta.png`);
}
console.log('previews written');
