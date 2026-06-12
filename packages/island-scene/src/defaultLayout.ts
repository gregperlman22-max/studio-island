import type { LayoutConfig, ZoneInstance } from "./types";

/**
 * Sample 16x12 island used by the demo harness. Hosts can pass their own
 * LayoutConfig that conforms to the schema (mirrors islands.layout_config).
 */
export const sampleLayout: LayoutConfig = {
  grid: { w: 16, h: 12 },
  landCells: Array.from({ length: 14 * 10 }, (_, i) => ({
    x: 1 + (i % 14),
    y: 1 + Math.floor(i / 14),
  })),
  spawnPoint: { x: 8, y: 6 },
  pictureFrameAnchor: { x: 14, y: 2 },
  decorations: [
    { id: "tree-1", kind: "tree", position: { x: 3, y: 3 } },
    { id: "tree-2", kind: "tree", position: { x: 12, y: 4 } },
    { id: "rock-1", kind: "rock", position: { x: 6, y: 9 } },
  ],
};

export const sampleZones: ZoneInstance[] = [
  { key: "calm_cove",          displayName: "Calm Cove",          skinName: "Bubble Cove",        gridPosition: { x: 1, y: 1 },  footprint: { w: 3, h: 3 }, unlocked: true  },
  { key: "build_beach",        displayName: "Build Beach",        skinName: "Sandcastle Shore",   gridPosition: { x: 12, y: 1 }, footprint: { w: 3, h: 3 }, unlocked: true  },
  { key: "campfire",           displayName: "Campfire",           skinName: "Marshmallow Ring",   gridPosition: { x: 7, y: 1 },  footprint: { w: 3, h: 3 }, unlocked: true  },
  { key: "worry_hollow",       displayName: "Worry Hollow",       skinName: "Whisper Hollow",     gridPosition: { x: 1, y: 8 },  footprint: { w: 3, h: 3 }, unlocked: false },
  { key: "garden",             displayName: "Garden",             skinName: "Carrot Patch",       gridPosition: { x: 7, y: 8 },  footprint: { w: 3, h: 3 }, unlocked: true  },
  { key: "field_guide_meadow", displayName: "Field Guide Meadow", skinName: "Clover Meadow",      gridPosition: { x: 12, y: 8 }, footprint: { w: 3, h: 3 }, unlocked: true  },
];
