import sharp from 'sharp';
const cb = (W,H,S=10)=>{const b=Buffer.alloc(W*H*4);for(let y=0;y<H;y++)for(let x=0;x<W;x++){const i=(y*W+x)*4;const c=(((x/S|0)+(y/S|0))&1)?190:240;b[i]=c;b[i+1]=c;b[i+2]=c;b[i+3]=255;}return {raw:b,W,H};};
// Crop regions around the coast, upscale 3x for inspection.
const regions = {
  'edge-left':   {left:40,  top:380, w:160, h:160},
  'edge-bottom': {left:520, top:760, w:200, h:160},
  'edge-topright':{left:980,top:120, w:200, h:160},
};
for (const [name,r] of Object.entries(regions)) {
  const crop = await sharp('home-island.png').extract({left:r.left,top:r.top,width:r.w,height:r.h}).resize(r.w*3,r.h*3,{kernel:'nearest'}).png().toBuffer();
  const {raw,W,H}=cb(r.w*3,r.h*3);
  await sharp(raw,{raw:{width:W,height:H,channels:4}}).composite([{input:crop}]).png().toFile(`check-${name}.png`);
}
console.log('wrote check-*.png');
