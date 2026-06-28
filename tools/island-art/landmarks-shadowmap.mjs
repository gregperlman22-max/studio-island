import sharp from 'sharp';

// Highlight semi-transparent (soft alpha) pixels in RED over a white card so we
// can see exactly where each image's soft ground smudge sits vs. the object.
for (const name of ['art-hut', 'arcade', 'calm-beach', 'campfire', 'lighthouse']) {
  const { data, info } = await sharp(`landmarks/${name}.png`).raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H, channels: C } = info;
  const out = Buffer.alloc(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    const a = data[i * C + (C - 1)];
    const r = data[i * C], g = data[i * C + 1], b = data[i * C + 2];
    let R, G, B;
    if (a < 8) { R = G = B = 255; }                       // transparent -> white
    else if (a >= 250) { R = r; G = g; B = b; }            // opaque -> show art
    else {                                                  // soft -> red by strength
      const k = a / 250;
      R = 255; G = Math.round(60 * (1 - k)); B = Math.round(60 * (1 - k));
    }
    out[i*4] = R; out[i*4+1] = G; out[i*4+2] = B; out[i*4+3] = 255;
  }
  await sharp(out, { raw: { width: W, height: H, channels: 4 } })
    .resize(440).png().toFile(`landmarks/_shadowmap-${name}.png`);
}
console.log('shadow maps written');
