import sharp from 'sharp';
import { readFileSync, writeFileSync } from 'node:fs';
const reg=JSON.parse(readFileSync('m2-grid.json','utf8'));
const cls=JSON.parse(readFileSync('m3-class.json','utf8'));
const {ART_SCALE:S,Tx,Ty,GRID_W,GRID_H,cells}=reg;
const TILE_W=64,TILE_H=32;
const landSet=new Set(cells.map(c=>`${c.x},${c.y}`));
const at=(x,y)=>cls[`${x},${y}`];
const land=(x,y)=>landSet.has(`${x},${y}`);
const tree=(x,y)=>at(x,y)==='T'||at(x,y)==='o';
const rock=(x,y)=>at(x,y)==='o';
const grass=(x,y)=>at(x,y)==='.';
const used=new Set();
const blk=(gx,gy,w,h)=>{for(let dx=-1;dx<=w;dx++)for(let dy=-1;dy<=h;dy++)if(used.has(`${gx+dx},${gy+dy}`))return true;return false;};
const allLand=(gx,gy,w,h)=>{for(let dx=0;dx<w;dx++)for(let dy=0;dy<h;dy++)if(!land(gx+dx,gy+dy))return false;return true;};
const gN=(gx,gy,w,h)=>{let n=0;for(let dx=0;dx<w;dx++)for(let dy=0;dy<h;dy++)if(grass(gx+dx,gy+dy))n++;return n;};
const tN=(gx,gy,w,h)=>{let n=0;for(let dx=0;dx<w;dx++)for(let dy=0;dy<h;dy++)if(tree(gx+dx,gy+dy))n++;return n;};
const rN=(gx,gy,w,h)=>{let n=0;for(let dx=0;dx<w;dx++)for(let dy=0;dy<h;dy++)if(rock(gx+dx,gy+dy))n++;return n;};
const core2=(gx,gy,w,h)=>{for(let dx=0;dx<=w-2;dx++)for(let dy=0;dy<=h-2;dy++){let ok=true;for(let a=0;a<2&&ok;a++)for(let b=0;b<2&&ok;b++)if(tree(gx+dx+a,gy+dy+b)||!land(gx+dx+a,gy+dy+b))ok=false;if(ok)return true;}return false;};
function commit(p,w,h){if(!p)return;for(let dx=-1;dx<=w;dx++)for(let dy=-1;dy<=h;dy++)used.add(`${p.x+dx},${p.y+dy}`);}
function snap(cx,cy,w,h,valid,maxR=12){const gx0=Math.round(cx-w/2),gy0=Math.round(cy-h/2);
  for(let R=0;R<=maxR;R++){let best=null,bs=-1e9;
    for(let dy=-R;dy<=R;dy++)for(let dx=-R;dx<=R;dx++){if(Math.max(Math.abs(dx),Math.abs(dy))!==R)continue;
      const gx=gx0+dx,gy=gy0+dy;if(gx<1||gy<1||gx+w>=GRID_W||gy+h>=GRID_H)continue;
      if(blk(gx,gy,w,h)||!valid(gx,gy,w,h))continue;
      const d=Math.hypot(gx+w/2-cx,gy+h/2-cy);const s=gN(gx,gy,w,h)*2-d;
      if(s>bs){bs=s;best={x:gx,y:gy};}}
    if(best)return best;}
  return null;}

const P={};const pin=(k,x,y,w,h)=>{P[k]={gridPosition:{x,y},footprint:{w,h}};commit({x,y},w,h);};
pin('campfire_circle',15,21,4,4);pin('calm_beach',5,31,6,4);pin('welcome_dock',43,37,6,4);
const place=(k,w,h,p)=>{if(p){P[k]={gridPosition:p,footprint:{w,h}};commit(p,w,h);}return p;};

const grassClearing=(gx,gy,w,h)=>allLand(gx,gy,w,h)&&tN(gx,gy,w,h)===0&&rN(gx,gy,w,h)===0&&gN(gx,gy,w,h)>=Math.ceil(w*h*0.55);
const openGround=(gx,gy,w,h)=>allLand(gx,gy,w,h)&&tN(gx,gy,w,h)===0;      // sand ok (cove)
const forestPocket=(gx,gy,w,h)=>allLand(gx,gy,w,h)&&rN(gx,gy,w,h)===0&&tN(gx,gy,w,h)<=8&&core2(gx,gy,w,h)&&gN(gx,gy,w,h)>=8;

const art=place("art_hut",4,4, snap(31,21,4,4,openGround,8));
const arc=place('arcade_cove',5,4, snap(44,25,5,4,openGround,9));
const tree5=place('treehouse_hideaway',5,5, snap(10,19,5,5,forestPocket,8));
// lighthouse: upper-right INLAND grass clearing (gy in 5..12), else keep coastal point
const lhValid=(gx,gy,w,h)=>gy>=9&&gy<=15&&gx>=22&&grassClearing(gx,gy,w,h);
let lh=snap(28,7,4,4,lhValid,12),lhFallback=false;
if(!lh){lh={x:30,y:4};lhFallback=true;}
place('lighthouse_point',4,4,lh);

const spawn={x:44,y:33};
const order=['lighthouse_point','treehouse_hideaway','art_hut','campfire_circle','arcade_cove','calm_beach','welcome_dock'];
console.log('=== placements ===');
for(const k of order){const v=P[k];if(!v){console.log(`${k} -> NONE`);continue;}const{x,y}=v.gridPosition,{w,h}=v.footprint;
  console.log(`${k.padEnd(20)} pos=(${x},${y}) ${w}x${h} center=(${(x+(w-1)/2).toFixed(1)},${(y+(h-1)/2).toFixed(1)}) grass=${gN(x,y,w,h)} trees=${tN(x,y,w,h)} rock=${rN(x,y,w,h)}`);}
console.log('lighthouse fallback?',lhFallback);
let mind=1e9,mp='';const cen=k=>({x:P[k].gridPosition.x+P[k].footprint.w/2,y:P[k].gridPosition.y+P[k].footprint.h/2});
for(let i=0;i<order.length;i++)for(let j=i+1;j<order.length;j++){const a=cen(order[i]),b=cen(order[j]);const d=Math.hypot(a.x-b.x,a.y-b.y);if(d<mind){mind=d;mp=`${order[i]}<->${order[j]}`;}}
console.log(`closest pair: ${mp} = ${mind.toFixed(1)}`);
const occ=new Set();let ov=false;for(const k of order){const{x,y}=P[k].gridPosition,{w,h}=P[k].footprint;for(let dx=0;dx<w;dx++)for(let dy=0;dy<h;dy++){const key=`${x+dx},${y+dy}`;if(occ.has(key))ov=true;occ.add(key);}}
console.log('overlap:',ov);
writeFileSync('m3-placements.json', JSON.stringify({placements:P,spawn},null,2));

const cellToArt=(gx,gy)=>{const ox=gx-Tx,oy=gy-Ty;return{ax:((ox-oy)*(TILE_W/2))/S,ay:(((ox+oy)*(TILE_H/2))+TILE_H/2)/S};};
const fp=(gx,gy,w,h)=>[cellToArt(gx,gy),cellToArt(gx+w,gy),cellToArt(gx+w,gy+h),cellToArt(gx,gy+h)].map(p=>`${p.ax.toFixed(1)},${p.ay.toFixed(1)}`).join(' ');
const COL={campfire_circle:'#ff5a3c',lighthouse_point:'#ffd400',treehouse_hideaway:'#39d98a',art_hut:'#c77dff',arcade_cove:'#4cc9f0',calm_beach:'#f7b267',welcome_dock:'#ff4d6d'};
const meta=await sharp('home-island.png').metadata();const W=meta.width,H=meta.height;
let svg=`<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">`;
for(const[k,v]of Object.entries(P)){const{x,y}=v.gridPosition,{w,h}=v.footprint,c2=COL[k];svg+=`<polygon points="${fp(x,y,w,h)}" fill="${c2}" fill-opacity="0.42" stroke="${c2}" stroke-width="3"/>`;const c=cellToArt(x+w/2,y+h/2);svg+=`<text x="${c.ax.toFixed(1)}" y="${c.ay.toFixed(1)}" fill="#111" font-size="15" font-weight="bold" text-anchor="middle" stroke="#fff" stroke-width="0.8" paint-order="stroke">${k.replace(/_/g,' ')}</text>`;}
{const c=cellToArt(spawn.x+0.5,spawn.y+0.5);svg+=`<circle cx="${c.ax.toFixed(1)}" cy="${c.ay.toFixed(1)}" r="8" fill="#fff" stroke="#000" stroke-width="2"/>`;}
svg+='</svg>';
const bg=await sharp({create:{width:W,height:H,channels:4,background:{r:24,g:30,b:42,alpha:1}}}).png().toBuffer();
await sharp(bg).composite([{input:'home-island.png'},{input:Buffer.from(svg)}]).png().toFile('m3-placements.png');
console.log('wrote m3-placements.png');
