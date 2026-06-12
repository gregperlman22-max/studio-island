import type { ThemePackConfig } from "../types";

export const explorerPack: ThemePackConfig = {
  key: "explorer",
  displayName: "Explorer",
  register: "explorer",
  tilesetKey: "explorer/v1",
  audioKey: "explorer/v1",
  palette: {
    skyTop: "#d9c9a1",
    skyBottom: "#c1a679",
    water: "#3e7f8a",
    waterShimmer: "#7bb0b8",
    land: "#7a9b5a",
    landAlt: "#bfa46a",
    foliage: "#3f7544",
    foliageShadow: "#22442a",
    accent: "#e8a050",
    ink: "#2a1f12",
  },
  zoneSkins: {
    calm_cove: { skinName: "Lantern Cove", decorationHints: ["lantern", "rope-coil"] },
    build_beach: { skinName: "Workshop Beach", decorationHints: ["crate", "plank"] },
    campfire: { skinName: "Trailhead Fire", decorationHints: ["log-pile", "kettle"] },
    worry_hollow: { skinName: "Quiet Grove", decorationHints: ["fern", "stone-cairn"] },
    garden: { skinName: "Field Garden", decorationHints: ["trellis", "spade"] },
    field_guide_meadow: { skinName: "Field Guide Clearing", decorationHints: ["journal-stump", "compass-rose"] },
  },
};
