import sharp from 'sharp';
import { readFileSync, writeFileSync } from 'node:fs';
const reg = JSON.parse(readFileSync('m2-grid.json','utf8'));
const cls = JSON.parse(readFileSync('m3-class.json','utf8'));
const { ART_SCALE:S, Tx, Ty, cells } = reg;
const TILE_W=64, TILE_H=32;
const landSet=new Set(cells.map(c=>`${c.x},${c.y}`));
const at=(x,y)=>cls[`${x},${y}`];
const grass=(x,y)=>at(x,y)==='.';
const isLand=(x,y)=>landSet.has(`${x},${y}`);
const grassN=(gx,gy,w,h)=>{let n=0;for(let dx=0;dx<w;dx++)for(let dy=0;dy<h;dy++)if(grass(gx+dx,gy+dy))n++;return n;};
const landN=(gx,gy,w,h)=>{let n=0;for(let dx=0;dx<w;dx++)for(let dy=0;dy<h;dy++)if(isLand(gx+dx,gy+dy))n++;return n;};

// Final pinned placements (spread across the whole island, all on open grass;
// the two coastal features intentionally overhang the waterline).
const placements = {
  lighthouse_point:   { gridPosition:{x:30,y:4},  footprint:{w:4,h:4} }, // top point
  art_hut:            { gridPosition:{x:24,y:15}, footprint:{w:4,h:4} }, // upper-center clearing
  treehouse_hideaway: { gridPosition:{x:13,y:22}, footprint:{w:5,h:5} }, // western forest edge
  campfire_circle:    { gridPosition:{x:28,y:25}, footprint:{w:4,h:4} }, // lower-center meadow hub
  arcade_cove:        { gridPosition:{x:38,y:26}, footprint:{w:5,h:4} }, // lower-right cove
  calm_beach:         { gridPosition:{x:5,y:31},  footprint:{w:6,h:4} }, // west shore
  welcome_dock:       { gridPosition:{x:43,y:37}, footprint:{w:6,h:4} }, // front prow
};
const spawn = { x:44, y:33 }; // grass just inland (up-screen) of the dock

const order=['lighthouse_point','art_hut','treehouse_hideaway','campfire_circle','arcade_cove','calm_beach','welcome_dock'];
console.log('=== Final placements ===');
for(const k of order){const v=placements[k],{x,y}=v.gridPosition,{w,h}=v.footprint;
  console.log(`${k.padEnd(20)} pos=(${x},${y}) ${w}x${h} center=(${(x+(w-1)/2).toFixed(1)},${(y+(h-1)/2).toFixed(1)}) grass=${grassN(x,y,w,h)} land=${landN(x,y,w,h)}/${w*h}`);}
console.log(`spawnPoint           (${spawn.x},${spawn.y}) class=${at(spawn.x,spawn.y)}`);
// spacing + overlap audit
let mind=1e9,mp='';const cen=k=>({x:placements[k].gridPosition.x+placements[k].footprint.w/2,y:placements[k].gridPosition.y+placements[k].footprint.h/2});
for(let i=0;i<order.length;i++)for(let j=i+1;j<order.length;j++){const a=cen(order[i]),b=cen(order[j]);const d=Math.hypot(a.x-b.x,a.y-b.y);if(d<mind){mind=d;mp=`${order[i]}<->${order[j]}`;}}
console.log(`closest pair: ${mp} = ${mind.toFixed(1)} cells (min center spacing)`);
// overlap check
const occ=new Set();let overlap=false;
for(const k of order){const{x,y}=placements[k].gridPosition,{w,h}=placements[k].footprint;for(let dx=0;dx<w;dx++)for(let dy=0;dy<h;dy++){const key=`${x+dx},${y+dy}`;if(occ.has(key))overlap=true;occ.add(key);}}
console.log('overlap:',overlap);
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
