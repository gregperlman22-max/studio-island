import type { GridPosition, LayoutConfig, ZoneInstance } from "./types";

/**
 * Home Island — the finished illustrated terrain. The walkable grid, zone
 * positions, spawn and dock are all conformed to the painted art
 * (tools/island-art/home-island.png). See tools/island-art/README.md for the
 * registration math: grid cell (gx,gy) projects to world pixels via iso.ts,
 * and the art sprite is pinned with the same ART_SCALE + world origin so the
 * invisible walk-grid lines up with the painted coastline.
 */

const GRID_W = 56;
const GRID_H = 44;

// Land footprint as per-row inclusive x-ranges, derived by sampling the painted
// island's opacity through the iso projection (tools/island-art/derive-grid.mjs).
const LAND_ROWS: Array<[number, Array<[number, number]>]> = [
  [2, [[34,34]]],
  [3, [[30,39]]],
  [4, [[26,39]]],
  [5, [[23,40]]],
  [6, [[19,41]]],
  [7, [[12,12], [15,41]]],
  [8, [[8,8], [10,42], [44,44]]],
  [9, [[6,44]]],
  [10, [[5,44]]],
  [11, [[4,45]]],
  [12, [[4,47]]],
  [13, [[4,46]]],
  [14, [[3,48]]],
  [15, [[3,47]]],
  [16, [[2,47]]],
  [17, [[2,47]]],
  [18, [[2,47], [49,49]]],
  [19, [[3,47], [49,50]]],
  [20, [[2,49]]],
  [21, [[2,50]]],
  [22, [[2,50]]],
  [23, [[2,51]]],
  [24, [[2,51]]],
  [25, [[2,51]]],
  [26, [[2,53]]],
  [27, [[2,51], [53,53]]],
  [28, [[2,51], [53,53]]],
  [29, [[3,51], [53,53]]],
  [30, [[3,51]]],
  [31, [[3,51]]],
  [32, [[4,52]]],
  [33, [[5,50]]],
  [34, [[11,49]]],
  [35, [[10,49]]],
  [36, [[11,48]]],
  [37, [[11,47]]],
  [38, [[11,46]]],
  [39, [[13,13], [15,15], [17,17], [20,33], [35,44], [46,46]]],
  [40, [[19,21], [25,32], [35,38], [40,41], [44,44]]],
  [41, [[25,25], [27,27], [30,30], [38,39], [41,41]]],
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
  { key: "lighthouse_point", displayName: "Lighthouse Point", skinName: "Beacon Point", gridPosition: { x: 30, y: 4 }, footprint: { w: 4, h: 4 }, unlocked: true },
  { key: "treehouse_hideaway", displayName: "Treehouse Hideaway", skinName: "Treetop Hideaway", gridPosition: { x: 4, y: 20 }, footprint: { w: 5, h: 5 }, unlocked: true },
  { key: "art_hut", displayName: "Art Hut", skinName: "Paint Cabin", gridPosition: { x: 28, y: 20 }, footprint: { w: 4, h: 4 }, unlocked: true },
  { key: "campfire_circle", displayName: "Campfire Circle", skinName: "Marshmallow Ring", gridPosition: { x: 15, y: 21 }, footprint: { w: 4, h: 4 }, unlocked: true },
  { key: "arcade_cove", displayName: "Arcade Cove", skinName: "Arcade Cove", gridPosition: { x: 42, y: 24 }, footprint: { w: 5, h: 4 }, unlocked: true },
  { key: "calm_beach", displayName: "Calm Beach", skinName: "Calm Beach", gridPosition: { x: 5, y: 31 }, footprint: { w: 6, h: 4 }, unlocked: true },
  { key: "welcome_dock", displayName: "Welcome Dock", skinName: "Welcome Dock", gridPosition: { x: 43, y: 37 }, footprint: { w: 6, h: 4 }, unlocked: true },
];

// Spawn just inland (up-screen) of the welcome dock — the arrival sequence
// drops the avatar here after the boat pulls up.
const spawnPoint: GridPosition = { x: 44, y: 33 };

export const sampleLayout: LayoutConfig = {
  grid: { w: GRID_W, h: GRID_H },
  landCells,
  spawnPoint,
  // Reserved invisible anchor (future picture-frame video dock).
  pictureFrameAnchor: { x: 27, y: 23 },
  // The illustration is the scenery — no procedural decoration scatter.
  decorations: [],
  // Illustrated ground sprite, pinned to the grid via the registration math.
  terrainImage: {
    url: new URL("./assets/home-island.png", import.meta.url).href,
    originX: -1056,
    originY: 112,
    scale: 1.5,
  },
};
