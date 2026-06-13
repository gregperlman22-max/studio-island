import type {
  DecorationPlacement,
  GridPosition,
  LayoutConfig,
  ZoneInstance,
} from "./types";
import { biomeAt, landContext } from "./render/biome";

/**
 * Sample island used by the demo harness — a large, organic open-world island
 * with natural biomes (forest, mountain, meadow, beach shore). Hosts pass
 * their own LayoutConfig (mirrors islands.layout_config); this is a
 * representative default.
 */

const GRID_W = 54;
const GRID_H = 36;
const CX = 27;
const CY = 18;
const RX = 24;
const RY = 16;

// Organic silhouette: ellipse with multi-frequency coastal wobble for bays
// and headlands (no hard edges, no square corners).
function isLandCell(x: number, y: number): boolean {
  const ang = Math.atan2(y - CY, x - CX);
  const wobble =
    0.06 * Math.sin(ang * 3 + 0.5) +
    0.05 * Math.sin(ang * 5 + 2.1) +
    0.04 * Math.sin(x * 0.5) * Math.cos(y * 0.4);
  const nx = (x - CX) / RX;
  const ny = (y - CY) / RY;
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
  { key: "campfire",           displayName: "Campfire",           skinName: "Marshmallow Ring",   gridPosition: { x: 13, y: 9 },  footprint: { w: 4, h: 4 }, unlocked: true  },
  { key: "build_beach",        displayName: "Build Beach",        skinName: "Sandcastle Shore",   gridPosition: { x: 28, y: 7 },  footprint: { w: 5, h: 4 }, unlocked: true  },
  { key: "calm_cove",          displayName: "Calm Cove",          skinName: "Bubble Cove",        gridPosition: { x: 9,  y: 21 }, footprint: { w: 5, h: 4 }, unlocked: true  },
  { key: "worry_hollow",       displayName: "Worry Hollow",       skinName: "Whisper Hollow",     gridPosition: { x: 41, y: 14 }, footprint: { w: 5, h: 4 }, unlocked: false },
  { key: "field_guide_meadow", displayName: "Field Guide Meadow", skinName: "Clover Meadow",      gridPosition: { x: 24, y: 26 }, footprint: { w: 5, h: 4 }, unlocked: true  },
  { key: "garden",             displayName: "Garden",             skinName: "Carrot Patch",       gridPosition: { x: 38, y: 24 }, footprint: { w: 5, h: 4 }, unlocked: true  },
];

const spawnPoint: GridPosition = { x: 27, y: 18 };

// Biome-aware scatter: dense trees in the forest, rocks on the mountain,
// mushrooms in shade, shells along the beach, sparse elsewhere.
const decorations: DecorationPlacement[] = (() => {
  const ctx = landContext({ w: GRID_W, h: GRID_H }, landCells);
  const blocked = new Set<string>();
  for (const z of sampleZones) {
    for (let dx = -1; dx <= z.footprint.w; dx++) {
      for (let dy = -1; dy <= z.footprint.h; dy++) {
        blocked.add(`${z.gridPosition.x + dx},${z.gridPosition.y + dy}`);
      }
    }
  }
  blocked.add(`${spawnPoint.x},${spawnPoint.y}`);

  let seed = 9281;
  const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;

  const out: DecorationPlacement[] = [];
  let id = 0;
  for (const c of landCells) {
    const key = `${c.x},${c.y}`;
    if (blocked.has(key)) continue;
    // Keep props off the very coast so they sit on solid ground.
    if (!isLandCell(c.x + 1, c.y) || !isLandCell(c.x, c.y + 1) || !isLandCell(c.x - 1, c.y)) continue;

    const biome = biomeAt(c.x, c.y, ctx);
    const r = rnd();
    let kind: string | null = null;
    if (biome === "forest") kind = r < 0.5 ? "tree" : r < 0.6 ? "mushroom" : null;
    else if (biome === "mountain") kind = r < 0.45 ? "rock" : null;
    else if (biome === "beach") kind = r < 0.08 ? "shell" : null;
    else if (biome === "meadow") kind = r < 0.08 ? "tree" : null;
    else kind = r < 0.12 ? (r < 0.08 ? "tree" : "rock") : null;
    if (!kind) continue;

    blocked.add(key);
    out.push({ id: `${kind}-${id++}`, kind, position: { x: c.x, y: c.y }, scale: 0.85 + rnd() * 0.5 });
  }
  return out;
})();

export const sampleLayout: LayoutConfig = {
  grid: { w: GRID_W, h: GRID_H },
  landCells,
  spawnPoint,
  pictureFrameAnchor: { x: 27, y: 14 },
  decorations,
};
