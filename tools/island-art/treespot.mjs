import { readFileSync } from 'node:fs';
const reg=JSON.parse(readFileSync('m2-grid.json','utf8'));
const cls=JSON.parse(readFileSync('m3-class.json','utf8'));
const {GRID_W,cells}=reg;
const landSet=new Set(cells.map(c=>`${c.x},${c.y}`));
const at=(x,y)=>cls[`${x},${y}`];
const land=(x,y)=>landSet.has(`${x},${y}`);
const tree=(x,y)=>{const c=at(x,y);return c==='T'||c==='o';};
const openG=(x,y)=>land(x,y)&&!tree(x,y);
const w=5,h=5;
const lighthouse={x:31.5,y:5.5}, arthut={x:25.5,y:16.5};
const cands=[];
for(let gy=4;gy<=13;gy++)for(let gx=2;gx<GRID_W-w;gx++){
  // footprint must be fully walkable land (trees allowed under a treehouse)
  let allLand=true; for(let dx=0;dx<w&&allLand;dx++)for(let dy=0;dy<h&&allLand;dy++)if(!land(gx+dx,gy+dy))allLand=false;
  if(!allLand)continue;
  // need a standable open core: some 2x2 of open ground inside the footprint
  let core=false;
  for(let dx=0;dx<=w-2&&!core;dx++)for(let dy=0;dy<=h-2&&!core;dy++)
    if(openG(gx+dx,gy+dy)&&openG(gx+dx+1,gy+dy)&&openG(gx+dx,gy+dy+1)&&openG(gx+dx+1,gy+dy+1))core=true;
  if(!core)continue;
  // forest density in a 3-cell ring around it
  let ring=0,ringN=0;
  for(let dx=-3;dx<w+3;dx++)for(let dy=-3;dy<h+3;dy++){ if(dx>=0&&dx<w&&dy>=0&&dy<h)continue; ringN++; if(tree(gx+dx,gy+dy))ring++; }
  const treesUnder=(()=>{let n=0;for(let dx=0;dx<w;dx++)for(let dy=0;dy<h;dy++)if(tree(gx+dx,gy+dy))n++;return n;})();
  const cx=gx+w/2, cy=gy+h/2;
  const dL=Math.hypot(cx-lighthouse.x,cy-lighthouse.y), dA=Math.hypot(cx-arthut.x,cy-arthut.y);
  if(dL<8||dA<8)continue;
  const score=ring/ringN*100 + treesUnder*3 - cy*1.5; // nestled + canopy + nearer top
  cands.push({gx,gy,cx,cy,forest:(ring/ringN*100|0),under:treesUnder,dL:+dL.toFixed(1),dA:+dA.toFixed(1),score:+score.toFixed(1)});
}
cands.sort((a,b)=>b.score-a.score);
console.log('treehouse 5x5 candidates (all-walkable, open 2x2 core), ranked nestled+top:');
for(const c of cands.slice(0,14)) console.log(`  pos=(${c.gx},${c.gy}) center=(${c.cx},${c.cy}) forestRing=${c.forest}% treesUnder=${c.under} dLight=${c.dL} dArt=${c.dA}`);
console.log(`total: ${cands.length}`);

console.log('\n--- balanced: open pocket (treesUnder<=7) ringed by forest, nearer top ---');
const bal=cands.filter(c=>c.under<=7).sort((a,b)=> (b.forest - a.forest*0) - 0 || 0).sort((a,b)=> (b.forest - b.cy*2) - (a.forest - a.cy*2));
for(const c of bal.slice(0,10)) console.log(`  pos=(${c.gx},${c.gy}) center=(${c.cx},${c.cy}) forestRing=${c.forest}% treesUnder=${c.under} dLight=${c.dL} dArt=${c.dA}`);
