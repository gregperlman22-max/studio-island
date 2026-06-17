import { readFileSync } from 'node:fs';
const reg=JSON.parse(readFileSync('m2-grid.json','utf8'));
const cls=JSON.parse(readFileSync('m3-class.json','utf8'));
const {GRID_W,GRID_H,cells}=reg;
const landSet=new Set(cells.map(c=>`${c.x},${c.y}`));
const at=(x,y)=>cls[`${x},${y}`];
const grass=(x,y)=>at(x,y)==='.';
const treeRock=(x,y)=>{const c=at(x,y);return c==='T'||c==='o';};
const isLand=(x,y)=>landSet.has(`${x},${y}`);
const valid=(gx,gy,w,h)=>{for(let dx=0;dx<w;dx++)for(let dy=0;dy<h;dy++){if(!isLand(gx+dx,gy+dy)||treeRock(gx+dx,gy+dy))return false;}return true;};
const grassN=(gx,gy,w,h)=>{let n=0;for(let dx=0;dx<w;dx++)for(let dy=0;dy<h;dy++)if(grass(gx+dx,gy+dy))n++;return n;};
function list(w,h,box,label){
  const out=[];
  for(let gy=box.y0;gy<=box.y1;gy++)for(let gx=box.x0;gx<=box.x1;gx++){
    if(gx+w>=GRID_W||gy+h>=GRID_H)continue;
    if(valid(gx,gy,w,h)) out.push({x:gx,y:gy,g:grassN(gx,gy,w,h)});
  }
  out.sort((a,b)=>b.g-a.g||(a.x+a.y)-(b.x+b.y));
  console.log(`\n${label}: ${out.length} valid ${w}x${h} all-grass/open spots (top 8 by grass):`);
  for(const s of out.slice(0,8)) console.log(`  pos=(${s.x},${s.y}) center=(${(s.x+(w-1)/2).toFixed(1)},${(s.y+(h-1)/2).toFixed(1)}) grass=${s.g}/${w*h}`);
}
// campfire 4x4 lower-center
list(4,4,{x0:20,y0:18,x1:34,y1:26},'CAMPFIRE lower-center');
// art_hut 4x4 right-center / right
list(4,4,{x0:33,y0:13,x1:46,y1:24},'ART_HUT right side');
// treehouse 5x5 left
list(5,5,{x0:8,y0:14,x1:20,y1:26},'TREEHOUSE left');

console.log('\n--- refined regions ---');
list(4,4,{x0:19,y0:11,x1:27,y1:16},'ART_HUT upper-center');
list(4,4,{x0:25,y0:20,x1:33,y1:26},'CAMPFIRE lower-center (hub)');
list(5,5,{x0:9,y0:19,x1:16,y1:27},'TREEHOUSE lower-left forest');
