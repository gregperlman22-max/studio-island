import sharp from 'sharp';

// Sample soft-alpha pixels by region to calibrate a shadow-vs-keep rule.
for (const name of ['art-hut', 'arcade', 'calm-beach']) {
  const { data, info } = await sharp(`landmarks/${name}.png`).raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H, channels: C } = info;
  const A = i => data[i * C + C - 1], R = i => data[i*C], G = i => data[i*C+1], B = i => data[i*C+2];

  // Find opaque bbox.
  let y1 = 0, y0 = H, x0 = W, x1 = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (A(y*W+x) >= 250) { if(y>y1)y1=y; if(y<y0)y0=y; if(x<x0)x0=x; if(x>x1)x1=x; }
  }

  // Bucket soft pixels: bottom band (likely shadow) vs top band (likely smoke/flags).
  const acc = (pred) => {
    let n=0, sr=0, sg=0, sb=0, sa=0, lumLo=0, lumHi=0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y*W+x, a = A(i);
      if (a < 8 || a >= 250) continue;
      if (!pred(x,y)) continue;
      const r=R(i),g=G(i),b=B(i); const lum=Math.max(r,g,b);
      n++; sr+=r; sg+=g; sb+=b; sa+=a; if(lum<110)lumLo++; else lumHi++;
    }
    if(!n) return 'none';
    const max=Math.round(Math.max(sr,sg,sb)/n), min=Math.round(Math.min(sr,sg,sb)/n);
    return `n=${n} avgRGB=(${Math.round(sr/n)},${Math.round(sg/n)},${Math.round(sb/n)}) avgA=${Math.round(sa/n)} sat=${max-min} dark%=${Math.round(100*lumLo/n)}`;
  };

  console.log(`\n${name}  opaque y[${y0}..${y1}]`);
  console.log(`  soft in bottom 18% band (y>${Math.round(y1-(y1-y0)*0.18)}): ${acc((x,y)=>y>y1-(y1-y0)*0.18)}`);
  console.log(`  soft above object top (y<${y0+8}):                ${acc((x,y)=>y<y0+8)}`);
  console.log(`  soft ALL:                                          ${acc(()=>true)}`);
}
