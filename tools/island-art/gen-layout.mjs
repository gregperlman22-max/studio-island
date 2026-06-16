import { readFileSync, writeFileSync } from 'node:fs';
const reg=JSON.parse(readFileSync('m2-grid.json','utf8'));
const {GRID_W,GRID_H,ART_SCALE,SPRITE_WORLD_X,SPRITE_WORLD_Y,cells}=reg;
const landSet=new Set(cells.map(c=>`${c.x},${c.y}`));

// row-range encode landCells
const rows=[];
for(let y=0;y<GRID_H;y++){
  const xs=[];for(let x=0;x<GRID_W;x++)if(landSet.has(`${x},${y}`))xs.push(x);
  if(!xs.length)continue;
  const ranges=[];let s=xs[0],p=xs[0];
  for(let i=1;i<xs.length;i++){if(xs[i]===p+1){p=xs[i];}else{ranges.push([s,p]);s=p=xs[i];}}
  ranges.push([s,p]);
  rows.push([y,ranges]);
}
// picture frame anchor: a central land cell
let cx=0,cy=0;for(const c of cells){cx+=c.x;cy+=c.y;}cx=Math.round(cx/cells.length);cy=Math.round(cy/cells.length);
if(!landSet.has(`${cx},${cy}`)){outer:for(let r=1;r<6;r++)for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++)if(landSet.has(`${cx+dx},${cy+dy}`)){cx+=dx;cy+=dy;break outer;}}

const ZONES=[
  ['lighthouse_point','Lighthouse Point','Beacon Point',30,4,4,4],
  ['treehouse_hideaway','Treehouse Hideaway','Treetop Hideaway',4,20,5,5],
  ['art_hut','Art Hut','Paint Cabin',28,20,4,4],
  ['campfire_circle','Campfire Circle','Marshmallow Ring',15,21,4,4],
  ['arcade_cove','Arcade Cove','Arcade Cove',42,24,5,4],
  ['calm_beach','Calm Beach','Calm Beach',5,31,6,4],
  ['welcome_dock','Welcome Dock','Welcome Dock',43,37,6,4],
];
const SPAWN={x:44,y:33};

const rowsLit=rows.map(([y,r])=>`  [${y}, [${r.map(([a,b])=>`[${a},${b}]`).join(', ')}]],`).join('\n');
const zonesLit=ZONES.map(([k,dn,sn,x,y,w,h])=>`  { key: "${k}", displayName: "${dn}", skinName: "${sn}", gridPosition: { x: ${x}, y: ${y} }, footprint: { w: ${w}, h: ${h} }, unlocked: true },`).join('\n');

const out=`import type { GridPosition, LayoutConfig, ZoneInstance } from "./types";

/**
 * Home Island — the finished illustrated terrain. The walkable grid, zone
 * positions, spawn and dock are all conformed to the painted art
 * (tools/island-art/home-island.png). See tools/island-art/README.md for the
 * registration math: grid cell (gx,gy) projects to world pixels via iso.ts,
 * and the art sprite is pinned with the same ART_SCALE + world origin so the
 * invisible walk-grid lines up with the painted coastline.
 */

const GRID_W = ${GRID_W};
const GRID_H = ${GRID_H};

// Land footprint as per-row inclusive x-ranges, derived by sampling the painted
// island's opacity through the iso projection (tools/island-art/derive-grid.mjs).
const LAND_ROWS: Array<[number, Array<[number, number]>]> = [
${rowsLit}
];

const landCells: GridPosition[] = (() => {
  const cells: GridPosition[] = [];
  for (const [y, ranges] of LAND_ROWS) {
    for (const [x0, x1] of ranges) {
      for (let x = x0; x <= x1; x++) cells.push({ x, y });
    }
  }
  return cells;
})();

// Seven landmark zones, snapped onto open clearings in the illustration.
export const sampleZones: ZoneInstance[] = [
${zonesLit}
];

// Spawn just inland (up-screen) of the welcome dock — the arrival sequence
// drops the avatar here after the boat pulls up.
const spawnPoint: GridPosition = { x: ${SPAWN.x}, y: ${SPAWN.y} };

export const sampleLayout: LayoutConfig = {
  grid: { w: GRID_W, h: GRID_H },
  landCells,
  spawnPoint,
  // Reserved invisible anchor (future picture-frame video dock).
  pictureFrameAnchor: { x: ${cx}, y: ${cy} },
  // The illustration is the scenery — no procedural decoration scatter.
  decorations: [],
  // Illustrated ground sprite, pinned to the grid via the registration math.
  terrainImage: {
    url: new URL("./assets/home-island.png", import.meta.url).href,
    originX: ${SPRITE_WORLD_X},
    originY: ${SPRITE_WORLD_Y},
    scale: ${ART_SCALE},
  },
};
`;
writeFileSync('../../packages/island-scene/src/defaultLayout.ts', out);
console.log(`wrote defaultLayout.ts: ${cells.length} land cells, ${rows.length} rows, pictureFrameAnchor (${cx},${cy})`);
console.log(`registration: ART_SCALE=${ART_SCALE} origin=(${SPRITE_WORLD_X},${SPRITE_WORLD_Y})`);
