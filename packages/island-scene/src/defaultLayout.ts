import type {
  DecorationPlacement,
  GridPosition,
  LayoutConfig,
  ZoneInstance,
} from "./types";

/**
 * Sample island used by the demo harness. A large, organic (blob-shaped)
 * island — a world to explore rather than a single board tile. Hosts pass
 * their own LayoutConfig (mirrors islands.layout_config); this is just a
 * representative default.
 */

const GRID_W = 44;
const GRID_H = 30;
const CX = 22;
const CY = 15;
const RX = 19;
const RY = 12.5;

// Deterministic island silhouette: an ellipse with a little coastal wobble.
function isLandCell(x: number, y: number): boolean {
  const nx = (x - CX) / RX;
  const ny = (y - CY) / RY;
  const wobble = 0.05 * Math.sin(x * 0.7) + 0.05 * Math.sin(y * 0.6 + 1.3);
  return nx * nx + ny * ny <= 1.04 + wobble;
}

const landCells: GridPosition[] = (() => {
  const cells: GridPosition[] = [];
  for (let y = 0; y < GRID_H; y++) {
    for (let x = 0; x < GRID_W; x++) {
      if (isLandCell(x, y)) cells.push({ x, y });
    }
  }
  return cells;
})();

export const sampleZones: ZoneInstance[] = [
  { key: "calm_cove",          displayName: "Calm Cove",          skinName: "Bubble Cove",        gridPosition: { x: 8,  y: 8 },  footprint: { w: 5, h: 4 }, unlocked: true  },
  { key: "campfire",           displayName: "Campfire",           skinName: "Marshmallow Ring",   gridPosition: { x: 20, y: 6 },  footprint: { w: 4, h: 4 }, unlocked: true  },
  { key: "build_beach",        displayName: "Build Beach",        skinName: "Sandcastle Shore",   gridPosition: { x: 31, y: 9 },  footprint: { w: 5, h: 4 }, unlocked: true  },
  { key: "worry_hollow",       displayName: "Worry Hollow",       skinName: "Whisper Hollow",     gridPosition: { x: 8,  y: 19 }, footprint: { w: 5, h: 4 }, unlocked: false },
  { key: "field_guide_meadow", displayName: "Field Guide Meadow", skinName: "Clover Meadow",      gridPosition: { x: 19, y: 20 }, footprint: { w: 5, h: 4 }, unlocked: true  },
  { key: "garden",             displayName: "Garden",             skinName: "Carrot Patch",       gridPosition: { x: 31, y: 19 }, footprint: { w: 5, h: 4 }, unlocked: true  },
];

const spawnPoint: GridPosition = { x: 21, y: 14 };

// Scatter trees and rocks across the open land, avoiding zones + spawn.
const decorations: DecorationPlacement[] = (() => {
  const blocked = new Set<string>();
  for (const z of sampleZones) {
    for (let dx = -1; dx <= z.footprint.w; dx++) {
      for (let dy = -1; dy <= z.footprint.h; dy++) {
        blocked.add(`${z.gridPosition.x + dx},${z.gridPosition.y + dy}`);
      }
    }
  }
  blocked.add(`${spawnPoint.x},${spawnPoint.y}`);

  const land = new Set(landCells.map((c) => `${c.x},${c.y}`));
  // Simple LCG for a stable scatter.
  let seed = 1337;
  const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;

  const out: DecorationPlacement[] = [];
  let id = 0;
  for (let i = 0; i < 240 && out.length < 34; i++) {
    const x = 2 + Math.floor(rnd() * (GRID_W - 4));
    const y = 2 + Math.floor(rnd() * (GRID_H - 4));
    const key = `${x},${y}`;
    if (!land.has(key) || blocked.has(key)) continue;
    // Keep an interior away from the very coast so props sit on solid ground.
    if (!isLandCell(x + 1, y) || !isLandCell(x, y + 1)) continue;
    blocked.add(key);
    const kind = rnd() < 0.62 ? "tree" : "rock";
    out.push({ id: `${kind}-${id++}`, kind, position: { x, y }, scale: 0.9 + rnd() * 0.5 });
  }
  return out;
})();

export const sampleLayout: LayoutConfig = {
  grid: { w: GRID_W, h: GRID_H },
  landCells,
  spawnPoint,
  pictureFrameAnchor: { x: 21, y: 11 },
  decorations,
};
