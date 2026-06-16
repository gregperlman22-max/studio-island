import sharp from 'sharp';
import { readFileSync, writeFileSync } from 'node:fs';
const reg = JSON.parse(readFileSync('m2-grid.json','utf8'));
const cls = JSON.parse(readFileSync('m3-class.json','utf8'));
const { ART_SCALE:S, Tx, Ty, GRID_W, GRID_H, cells } = reg;
const TILE_W=64, TILE_H=32;
const landSet=new Set(cells.map(c=>`${c.x},${c.y}`));
const at=(x,y)=>cls[`${x},${y}`];
const isLand=(x,y)=>landSet.has(`${x},${y}`);
const isWater=(x,y)=>!isLand(x,y);
const openLand=(x,y)=>{const c=at(x,y);return c==='.'||c===':'||c==='X';};
const grass=(x,y)=>at(x,y)==='.';
const treeRock=(x,y)=>{const c=at(x,y);return c==='T'||c==='o';};
const used=new Set();
const blocked=(gx,gy,w,h)=>{for(let dx=0;dx<w;dx++)for(let dy=0;dy<h;dy++)if(used.has(`${gx+dx},${gy+dy}`))return true;return false;};
const grassN=(gx,gy,w,h)=>{let n=0;for(let dx=0;dx<w;dx++)for(let dy=0;dy<h;dy++)if(grass(gx+dx,gy+dy))n++;return n;};
const landN=(gx,gy,w,h)=>{let n=0;for(let dx=0;dx<w;dx++)for(let dy=0;dy<h;dy++)if(isLand(gx+dx,gy+dy))n++;return n;};
const hasTreeRock=(gx,gy,w,h)=>{for(let dx=0;dx<w;dx++)for(let dy=0;dy<h;dy++)if(treeRock(gx+dx,gy+dy))return true;return false;};
const waterAnyEdge=(gx,gy,w,h)=>{for(let dx=-1;dx<=w;dx++){if(isWater(gx+dx,gy-1)||isWater(gx+dx,gy+h))return true;}for(let dy=-1;dy<=h;dy++){if(isWater(gx-1,gy+dy)||isWater(gx+w,gy+dy))return true;}return false;};
const waterFront=(gx,gy,w,h)=>{for(let dx=-1;dx<=w;dx++)if(isWater(gx+dx,gy+h)||isWater(gx+dx,gy+h-1))return true;return false;};

// island prow (frontmost land = max x+y)
let prow={x:0,y:0,s:-1}; for(const c of cells){if(c.x+c.y>prow.s){prow={x:c.x,y:c.y,s:c.x+c.y};}}

function search(w,h,valid,score){
  let best=null,bestS=-1e9;
  for(let gy=1;gy<GRID_H-h;gy++)for(let gx=1;gx<GRID_W-w;gx++){
    if(blocked(gx,gy,w,h)||!valid(gx,gy,w,h))continue;
    const s=score(gx,gy); if(s>bestS){bestS=s;best={x:gx,y:gy};}
  }
  return best;
}
function commit(p,w,h){if(!p)return;for(let dx=-1;dx<=w;dx++)for(let dy=-1;dy<=h;dy++)used.add(`${p.x+dx},${p.y+dy}`);}
const near=(gx,gy,w,h,cx,cy)=>-(Math.hypot(gx+w/2-cx,gy+h/2-cy));
const allLandOpen=(gx,gy,w,h)=>!hasTreeRock(gx,gy,w,h)&&landN(gx,gy,w,h)===w*h;
const coastal=(gx,gy,w,h)=>!hasTreeRock(gx,gy,w,h)&&landN(gx,gy,w,h)>=Math.ceil(w*h*0.5)&&waterAnyEdge(gx,gy,w,h);

const placements={};
const put=(key,w,h,valid,score)=>{const p=search(w,h,valid,score);placements[key]={gridPosition:p,footprint:{w,h}};commit(p,w,h);return p;};

put('campfire_circle',  4,4, allLandOpen, (x,y)=>grassN(x,y,4,4)*3+near(x,y,4,4,26,17)*1.6);
put('lighthouse_point', 4,4, allLandOpen, (x,y)=>grassN(x,y,4,4)*1.5+near(x,y,4,4,32,6)*2.4+(waterAnyEdge(x,y,4,4)?5:0));
put('treehouse_hideaway',5,5, allLandOpen, (x,y)=>grassN(x,y,5,5)*2+near(x,y,5,5,14,21)*1.8);
put('arcade_cove',      5,4, allLandOpen, (x,y)=>grassN(x,y,5,4)*2+near(x,y,5,4,41,27)*2.2+(waterAnyEdge(x,y,5,4)?3:0));
put('art_hut',          4,4, allLandOpen, (x,y)=>grassN(x,y,4,4)*2.4+near(x,y,4,4,20,11)*2.4);
// Coastal: calm beach on the SW shore (touch water, mostly sand), dock at the front prow.
put('calm_beach',       6,4, coastal, (x,y)=>landN(x,y,6,4)*1.0+near(x,y,6,4,8,26)*1.6 - x*0.2);
put('welcome_dock',     6,4, coastal, (x,y)=>(waterFront(x,y,6,4)?80:0)+(x+y)*0.7 - Math.abs((x+3)-prow.x)*1.3);

const dock=placements['welcome_dock'].gridPosition; let spawn=null;
for(let r=1;r<=10&&!spawn;r++)for(let dy=-r;dy<=0&&!spawn;dy++)for(let dx=-r;dx<=r&&!spawn;dx++){
  const x=(dock?dock.x+3:25)+dx,y=(dock?dock.y-2:28)+dy; if(grass(x,y)&&!used.has(`${x},${y}`))spawn={x,y};
}
if(!spawn)spawn={x:dock.x+3,y:dock.y-3};

console.log('prow (frontmost land) =',prow);
console.log('=== Proposed placements ===');
for(const[k,v]of Object.entries(placements)){const{x,y}=v.gridPosition,{w,h}=v.footprint;
  console.log(`${k.padEnd(20)} pos=(${x},${y}) ${w}x${h}  center=(${(x+(w-1)/2).toFixed(1)},${(y+(h-1)/2).toFixed(1)})  grass=${grassN(x,y,w,h)} land=${landN(x,y,w,h)}/${w*h}  waterEdge=${waterAnyEdge(x,y,w,h)}`);}
console.log(`spawnPoint           (${spawn.x},${spawn.y})`);
writeFileSync('m3-placements.json', JSON.stringify({placements,spawn},null,2));

const cellToArt=(gx,gy)=>{const ox=gx-Tx,oy=gy-Ty;return{ax:((ox-oy)*(TILE_W/2))/S,ay:(((ox+oy)*(TILE_H/2))+TILE_H/2)/S};};
const fpoly=(gx,gy,w,h)=>[cellToArt(gx,gy),cellToArt(gx+w,gy),cellToArt(gx+w,gy+h),cellToArt(gx,gy+h)].map(p=>`${p.ax.toFixed(1)},${p.ay.toFixed(1)}`).join(' ');
const COLORS={campfire_circle:'#ff5a3c',lighthouse_point:'#ffd400',treehouse_hideaway:'#39d98a',art_hut:'#c77dff',arcade_cove:'#4cc9f0',calm_beach:'#f7b267',welcome_dock:'#ff4d6d'};
const meta=await sharp('home-island.png').metadata();const W=meta.width,H=meta.height;
let svg=`<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">`;
for(const[k,v]of Object.entries(placements)){const{x,y}=v.gridPosition,{w,h}=v.footprint,col=COLORS[k];
  svg+=`<polygon points="${fpoly(x,y,w,h)}" fill="${col}" fill-opacity="0.42" stroke="${col}" stroke-width="3"/>`;
  const c=cellToArt(x+w/2,y+h/2);
  svg+=`<text x="${c.ax.toFixed(1)}" y="${c.ay.toFixed(1)}" fill="#111" font-size="15" font-weight="bold" text-anchor="middle" stroke="#fff" stroke-width="0.8" paint-order="stroke">${k.replace(/_/g,' ')}</text>`;}
{const c=cellToArt(spawn.x+0.5,spawn.y+0.5);svg+=`<circle cx="${c.ax.toFixed(1)}" cy="${c.ay.toFixed(1)}" r="8" fill="#fff" stroke="#000" stroke-width="2"/><text x="${c.ax.toFixed(1)}" y="${(c.ay-12).toFixed(1)}" fill="#fff" font-size="13" font-weight="bold" text-anchor="middle" stroke="#000" stroke-width="0.8" paint-order="stroke">spawn</text>`;}
svg+='</svg>';
const bg=await sharp({create:{width:W,height:H,channels:4,background:{r:24,g:30,b:42,alpha:1}}}).png().toBuffer();
await sharp(bg).composite([{input:'home-island.png'},{input:Buffer.from(svg)}]).png().toFile('m3-placements.png');
console.log('wrote m3-placements.png');
