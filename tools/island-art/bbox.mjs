import sharp from 'sharp';
const img = sharp('home-island.png');
const meta = await img.metadata();
const tr = await img.trim({ threshold: 1 }).metadata().catch(()=>null);
const { data, info } = await sharp('home-island.png').raw().toBuffer({ resolveWithObject: true });
const { width:W, height:H } = info;
let minX=W,minY=H,maxX=0,maxY=0,op=0;
for (let y=0;y<H;y++) for (let x=0;x<W;x++){ if(data[(y*W+x)*4+3]>16){op++; if(x<minX)minX=x; if(x>maxX)maxX=x; if(y<minY)minY=y; if(y>maxY)maxY=y; } }
console.log('output dims:', meta.width+'x'+meta.height, meta.channels+'ch', meta.hasAlpha?'alpha':'no-alpha');
console.log('opaque content bbox: x['+minX+'..'+maxX+'] y['+minY+'..'+maxY+']  ->  w='+(maxX-minX+1)+' h='+(maxY-minY+1));
console.log('content center px: ('+Math.round((minX+maxX)/2)+', '+Math.round((minY+maxY)/2)+')');
