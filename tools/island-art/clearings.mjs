import { readFileSync } from 'node:fs';
const reg = JSON.parse(readFileSync('m2-grid.json','utf8'));
const cls = JSON.parse(readFileSync('m3-class.json','utf8'));
const { GRID_W, GRID_H } = reg;
const at=(x,y)=>cls[`${x},${y}`];
const open=(x,y)=>{const c=at(x,y);return c==='.'||c===':';};
const grass=(x,y)=>at(x,y)==='.';

// Connected components of grass clearings (4-conn)
const seen=new Set(); const comps=[];
for (let y=0;y<GRID_H;y++) for(let x=0;x<GRID_W;x++){
  if(!grass(x,y)||seen.has(`${x},${y}`))continue;
  const st=[[x,y]]; seen.add(`${x},${y}`); const cc=[];
  while(st.length){const [a,b]=st.pop();cc.push([a,b]);
    for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){const k=`${a+dx},${b+dy}`; if(grass(a+dx,b+dy)&&!seen.has(k)){seen.add(k);st.push([a+dx,b+dy]);}}}
  if(cc.length>=10) comps.push(cc);
}
comps.sort((a,b)=>b.length-a.length);
console.log(`grass clearings (>=10 cells): ${comps.length}`);
for (let i=0;i<comps.length;i++){
  const cc=comps[i]; let sx=0,sy=0,minx=99,miny=99,maxx=0,maxy=0;
  for(const[x,y]of cc){sx+=x;sy+=y;minx=Math.min(minx,x);miny=Math.min(miny,y);maxx=Math.max(maxx,x);maxy=Math.max(maxy,y);}
  console.log(`#${i}  size=${String(cc.length).padStart(3)}  centroid=(${Math.round(sx/cc.length)},${Math.round(sy/cc.length)})  bbox x[${minx}-${maxx}] y[${miny}-${maxy}]`);
}

// Largest clear (open, no T/o) axis-aligned footprint fitting at a spot:
// helper to test a footprint fully-open
globalThis.fits=(gx,gy,w,h)=>{for(let dx=0;dx<w;dx++)for(let dy=0;dy<h;dy++){if(!open(gx+dx,gy+dy))return false;}return true;};
// For each zone footprint, count grass cells under it (quality)
const grassUnder=(gx,gy,w,h)=>{let n=0;for(let dx=0;dx<w;dx++)for(let dy=0;dy<h;dy++)if(grass(gx+dx,gy+dy))n++;return n;};
globalThis.grassUnder=grassUnder;
console.log('\n(use node -e for footprint checks)');
