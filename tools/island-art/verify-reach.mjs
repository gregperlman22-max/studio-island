import { readFileSync } from 'node:fs';
const TILE_W=64,TILE_H=32,CLIFF=14;
const t2s=(gx,gy)=>({x:(gx-gy)*32,y:(gx+gy)*16});
const src=readFileSync('../../packages/island-scene/src/defaultLayout.ts','utf8');
const grab=n=>src.match(new RegExp('const '+n+'[\\s\\S]*?= \\[([\\s\\S]*?)\\n\\];'))[1];
const expand=b=>{const a=eval('['+b+']');const c=[];for(const[y,r]of a)for(const[x0,x1]of r)for(let x=x0;x<=x1;x++)c.push({x,y});return c;};
const walkableCells=expand(grab('WALK_ROWS'));
const spawn=(()=>{const m=src.match(/spawnPoint: GridPosition = \{ x: (\d+), y: (\d+) \}/);return{x:+m[1],y:+m[2]};})();
// zones with keys
const zones=[];{const zRe=/key: "([a-z_]+)"[^}]*?gridPosition: \{ x: (\d+), y: (\d+) \}, footprint: \{ w: (\d+), h: (\d+) \}/g;let zm;while((zm=zRe.exec(src)))zones.push({key:zm[1],x:+zm[2],y:+zm[3],w:+zm[4],h:+zm[5]});}
// buildGrid mirror: base = walkableCells minus zone footprints (no obstacles), flood-fill 8-dir anti-corner from spawn
const walk=new Set(walkableCells.map(c=>c.x+','+c.y));
const blocked=new Set();for(const z of zones)for(let dx=0;dx<z.w;dx++)for(let dy=0;dy<z.h;dy++)blocked.add((z.x+dx)+','+(z.y+dy));
const base=(x,y)=>walk.has(x+','+y)&&!blocked.has(x+','+y);
const near=(tx,ty,mr=14)=>{if(base(tx,ty))return[tx,ty];for(let r=1;r<=mr;r++)for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++){if(Math.abs(dx)!==r&&Math.abs(dy)!==r)continue;if(base(tx+dx,ty+dy))return[tx+dx,ty+dy];}return null;};
const seed=base(spawn.x,spawn.y)?[spawn.x,spawn.y]:near(spawn.x,spawn.y);
const reach=new Set();{const st=[seed];reach.add(seed[0]+','+seed[1]);while(st.length){const[x,y]=st.pop();for(const[dx,dy]of[[1,0],[-1,0],[0,1],[0,-1]]){const nx=x+dx,ny=y+dy,k=nx+','+ny;if(base(nx,ny)&&!reach.has(k)){reach.add(k);st.push([nx,ny]);}}for(const[dx,dy]of[[1,1],[1,-1],[-1,1],[-1,-1]]){const nx=x+dx,ny=y+dy,k=nx+','+ny;if(base(nx,ny)&&base(x+dx,y)&&base(x,y+dy)&&!reach.has(k)){reach.add(k);st.push([nx,ny]);}}}}
console.log(`spawn(${spawn.x},${spawn.y}) reachable set size = ${reach.size}`);
let ok=true;
for(const z of zones){const e=near(Math.floor(z.x+z.w/2),Math.floor(z.y+z.h/2));const r=e&&reach.has(e[0]+','+e[1]);if(!r)ok=false;console.log(`  ${z.key.padEnd(20)} entrance ${e?('('+e[0]+','+e[1]+')'):'NONE'} -> ${r?'REACHABLE ✓':'UNREACHABLE ✗'}`);}
const df=near(46,40);const dok=df&&reach.has(df[0]+','+df[1]);console.log(`  ${'dock_front(46,40)'.padEnd(20)} entrance ${df?('('+df[0]+','+df[1]+')'):'NONE'} -> ${dok?'REACHABLE ✓':'UNREACHABLE ✗'}`);
console.log(ok&&dok?'\nALL ZONES + DOCK REACHABLE ✓':'\nREACHABILITY FAILED ✗');
