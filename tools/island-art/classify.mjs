import sharp from 'sharp';
import { readFileSync, writeFileSync } from 'node:fs';
const reg = JSON.parse(readFileSync('m2-grid.json','utf8'));
const { ART_SCALE:S, Tx, Ty, GRID_W, GRID_H, cells } = reg;
const TILE_W=64, TILE_H=32;
const cellToArt=(gx,gy)=>{ const ox=gx-Tx, oy=gy-Ty; return { ax:((ox-oy)*(TILE_W/2))/S, ay:(((ox+oy)*(TILE_H/2))+TILE_H/2)/S }; };
const { data, info } = await sharp('home-island.png').raw().toBuffer({ resolveWithObject:true });
const { width:W, height:H } = info;

const landSet = new Set(cells.map(c=>`${c.x},${c.y}`));
const cls = new Map();
for (const c of cells) {
  const { ax, ay } = cellToArt(c.x, c.y);
  let n=0, s=0, ss=0, sr=0,sg=0,sb=0;
  const Rp=11;
  for (let dy=-Rp; dy<=Rp; dy++) for (let dx=-Rp; dx<=Rp; dx++) {
    const x=Math.round(ax+dx), y=Math.round(ay+dy);
    if (x<0||y<0||x>=W||y>=H) continue;
    const i=(y*W+x)*4; if (data[i+3]<60) continue;
    const r=data[i],g=data[i+1],b=data[i+2];
    const lum=0.3*r+0.59*g+0.11*b; n++; s+=lum; ss+=lum*lum; sr+=r;sg+=g;sb+=b;
  }
  if (n<8){ cls.set(`${c.x},${c.y}`,'X'); continue; }
  const mean=s/n, std=Math.sqrt(Math.max(0,ss/n-mean*mean));
  const mr=sr/n,mg=sg/n,mb=sb/n;
  let ch;
  if (std > 30) ch = (mg>mr-4 && mb<130) ? 'T' : 'o';   // high texture = tree/rock
  else ch = (mb>120 && mr>=mg-14) ? ':' : '.';          // flat = sand/path or grass
  cls.set(`${c.x},${c.y}`, ch);
}

let out='';
for (let y=0;y<GRID_H;y++){ let row='';
  for (let x=0;x<GRID_W;x++){ row += landSet.has(`${x},${y}`) ? cls.get(`${x},${y}`) : ' '; }
  out += row.replace(/\s+$/,'') + '\n';
}
console.log('legend: . grass   : sand/path   T tree   o rock   X edge');
console.log(out);
writeFileSync('m3-class.json', JSON.stringify(Object.fromEntries(cls)));

const COL={'.':[60,225,90],':':[225,190,120],'T':[220,40,40],'o':[230,90,200],'X':[120,120,120]};
const buf=Buffer.from(data);
for (let y=0;y<H;y++) for (let x=0;x<W;x++){
  const wx=x*S,wy=y*S,hw=TILE_W/2,hh=TILE_H/2; const u=wx/hw,v=(wy-hh)/hh;
  const ogx=Math.round((v+u)/2),ogy=Math.round((v-u)/2); const c=cls.get(`${ogx+Tx},${ogy+Ty}`); const col=c&&COL[c];
  const i=(y*W+x)*4;
  if(col){buf[i]=Math.round(buf[i]*0.45+col[0]*0.55);buf[i+1]=Math.round(buf[i+1]*0.45+col[1]*0.55);buf[i+2]=Math.round(buf[i+2]*0.45+col[2]*0.55);buf[i+3]=Math.max(buf[i+3],170);}
}
const bg=await sharp({create:{width:W,height:H,channels:4,background:{r:24,g:30,b:42,alpha:1}}}).png().toBuffer();
await sharp(bg).composite([{input:await sharp(buf,{raw:{width:W,height:H,channels:4}}).png().toBuffer()}]).png().toFile('m3-classify.png');
console.log('wrote m3-classify.png  (red=tree, magenta=rock, green=grass, tan=path)');
