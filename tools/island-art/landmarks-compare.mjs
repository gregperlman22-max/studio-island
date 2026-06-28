import sharp from 'sharp';

const S = 22, PW = 380;
const onChecker = async (file) => {
  const { width: W, height: H } = await sharp(file).metadata();
  const base = Buffer.alloc(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    const c = (((x / S) | 0) + ((y / S) | 0)) & 1 ? 200 : 244;
    base[i] = c; base[i+1] = c; base[i+2] = c; base[i+3] = 255;
  }
  const composed = await sharp(base, { raw: { width: W, height: H, channels: 4 } })
    .composite([{ input: file }]).png().toBuffer();
  return sharp(composed).resize(PW).png().toBuffer();
};

for (const name of ['art-hut', 'arcade', 'calm-beach']) {
  const before = await onChecker(`landmarks/_orig-${name}.png`);
  const after = await onChecker(`landmarks/${name}.png`);
  const label = (txt, color) => Buffer.from(
    `<svg width="${PW}" height="26"><rect width="100%" height="100%" fill="${color}"/>` +
    `<text x="10" y="19" font-family="sans-serif" font-size="16" font-weight="bold" fill="white">${txt}</text></svg>`);
  const gap = 12;
  const canvasW = PW * 2 + gap;
  await sharp({ create: { width: canvasW, height: PW + 26, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } } })
    .composite([
      { input: label('BEFORE (original)', '#b0413e'), left: 0, top: 0 },
      { input: label('AFTER (smudge removed)', '#2f7d4f'), left: PW + gap, top: 0 },
      { input: before, left: 0, top: 26 },
      { input: after, left: PW + gap, top: 26 },
    ]).png().toFile(`landmarks/_compare-${name}.png`);
}
console.log('comparisons written');
