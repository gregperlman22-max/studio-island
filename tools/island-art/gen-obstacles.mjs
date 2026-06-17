import sharp from 'sharp';
import { readFileSync } from 'node:fs';
const reg=JSON.parse(readFileSync('m2-grid.json','utf8'));
const cls=JSON.parse(readFileSync('m3-class.json','utf8'));
const {ART_SCALE:S,Tx,Ty,GRID_W,GRID_H,cells}=reg;
const TILE_W=64,TILE_H=32;
const MIN_CLUSTER=Number(process.env.MIN??4);
const landSet=new Set(cells.map(c=>`${c.x},${c.y}`));
const at=(x,y)=>cls[`${x},${y}`];
const land=(x,y)=>landSet.has(`${x},${y}`);
const treeRock=(x,y)=>{const c=at(x,y);return c==='T'||c==='o';};

// zones + spawn (final, approved)
const ZONES=[['lighthouse_point',30,4,4,4],['treehouse_hideaway',4,20,5,5],['art_hut',28,20,4,4],['campfire_circle',15,21,4,4],['arcade_cove',42,24,5,4],['calm_beach',5,31,6,4],['welcome_dock',43,37,6,4]];
const SPAWN={x:44,y:33};
const zoneCells=new Set();
for(const[,x,y,w,h]of ZONES)for(let dx=-1;dx<=w;dx++)for(let dy=-1;dy<=h;dy++)zoneCells.add(`${x+dx},${y+dy}`); // footprint + 1-cell halo kept clear

// candidate obstacle cells: T/o, on land, not in/near a zone, not spawn
const cand=[];
for(const c of cells){
  if(!treeRock(c.x,c.y))continue;
  const k=`${c.x},${c.y}`;
  if(zoneCells.has(k))continue;
  if(c.x===SPAWN.x&&c.y===SPAWN.y)continue;
  cand.push([c.x,c.y]);
}
const candSet=new Set(cand.map(([x,y])=>`${x},${y}`));
// 8-connected clusters; keep only masses >= MIN_CLUSTER (drop scattered bushes/pebbles)
const seen=new Set();const blocked=new Set();const sizes=[];
for(const[sx,sy]of cand){const k0=`${sx},${sy}`;if(seen.has(k0))continue;
  const st=[[sx,sy]];seen.add(k0);const comp=[];
  while(st.length){const[x,y]=st.pop();comp.push([x,y]);
    for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++){if(!dx&&!dy)continue;const k=`${x+dx},${y+dy}`;if(candSet.has(k)&&!seen.has(k)){seen.add(k);st.push([x+dx,y+dy]);}}}
  sizes.push(comp.length);
  if(comp.length>=MIN_CLUSTER)for(const[x,y]of comp)blocked.add(`${x},${y}`);
}

// walk grid (mirror of SceneRenderer.buildGrid): land - obstacles - zone footprints
const zoneFoot=new Set();for(const[,x,y,w,h]of ZONES)for(let dx=0;dx<w;dx++)for(let dy=0;dy<h;dy++)zoneFoot.add(`${x+dx},${y+dy}`);
const walkable=(x,y)=>land(x,y)&&!blocked.has(`${x},${y}`)&&!zoneFoot.has(`${x},${y}`);
const nearestWalkable=(tx,ty,maxR=14)=>{if(walkable(tx,ty))return[tx,ty];for(let r=1;r<=maxR;r++)for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++){if(Math.abs(dx)!==r&&Math.abs(dy)!==r)continue;if(walkable(tx+dx,ty+dy))return[tx+dx,ty+dy];}return null;};
// BFS reachable set from spawn
const bfs=(sx,sy)=>{const seen=new Set([`${sx},${sy}`]);const q=[[sx,sy]];while(q.length){const[x,y]=q.shift();for(const[dx,dy]of[[1,0],[-1,0],[0,1],[0,-1]]){const nx=x+dx,ny=y+dy,k=`${nx},${ny}`;if(walkable(nx,ny)&&!seen.has(k)){seen.add(k);q.push([nx,ny]);}}}return seen;};
const reach=bfs(SPAWN.x,SPAWN.y);
// connectivity checks
const targets=[];
for(const[key,x,y,w,h]of ZONES){const c=[Math.floor(x+w/2),Math.floor(y+h/2)];const e=nearestWalkable(c[0],c[1]);targets.push([key,e]);}
const dockFront=nearestWalkable(46,40);
targets.push(['dock_front',dockFront]);
let allReach=true;const report=[];
for(const[key,e]of targets){const ok=e&&reach.has(`${e[0]},${e[1]}`);if(!ok)allReach=false;report.push(`  ${key.padEnd(20)} entrance=${e?`(${e[0]},${e[1]})`:'NONE'} reachable=${ok}`);}

let walk=0;for(const c of cells)if(walkable(c.x,c.y))walk++;
console.log(`MIN_CLUSTER=${MIN_CLUSTER}`);
console.log(`candidate T/o cells: ${cand.length}; clusters: ${sizes.length} (sizes ${[...sizes].sort((a,b)=>b-a).slice(0,12).join(',')}...)`);
console.log(`blocked obstacle cells: ${blocked.size}`);
console.log(`walkable land cells: ${walk}/${cells.length}`);
console.log('connectivity from spawn:');console.log(report.join('\n'));
console.log('ALL REACHABLE:',allReach);

// overlay: blocked=red, walkable land=faint green, zone footprints=blue
const cellToArt=(gx,gy)=>{const ox=gx-Tx,oy=gy-Ty;return{ax:((ox-oy)*(TILE_W/2))/S,ay:(((ox+oy)*(TILE_H/2))+TILE_H/2)/S};};
const {data,info}=await sharp('home-island.png').raw().toBuffer({resolveWithObject:true});
const W=info.width,H=info.height;const buf=Buffer.from(data);
for(let y=0;y<H;y++)for(let x=0;x<W;x++){const wx=x*S,wy=y*S,hw=TILE_W/2,hh=TILE_H/2;const u=wx/hw,v=(wy-hh)/hh;const ogx=Math.round((v+u)/2),ogy=Math.round((v-u)/2);const fx=ogx+Tx,fy=ogy+Ty;const k=`${fx},${fy}`;
  let col=null;if(blocked.has(k))col=[230,40,40];else if(zoneFoot.has(k))col=[60,120,240];else if(land(fx,fy))col=[60,210,90];
  if(col){const i=(y*W+x)*4;buf[i]=Math.round(buf[i]*0.5+col[0]*0.5);buf[i+1]=Math.round(buf[i+1]*0.5+col[1]*0.5);buf[i+2]=Math.round(buf[i+2]*0.5+col[2]*0.5);buf[i+3]=Math.max(buf[i+3],150);}}
const bg=await sharp({create:{width:W,height:H,channels:4,background:{r:24,g:30,b:42,alpha:1}}}).png().toBuffer();
await sharp(bg).composite([{input:await sharp(buf,{raw:{width:W,height:H,channels:4}}).png().toBuffer()}]).png().toFile(`m5-obstacles-min${MIN_CLUSTER}.png`);
console.log(`wrote m5-obstacles-min${MIN_CLUSTER}.png (red=blocked, green=walkable, blue=zones)`);
