import type { ThemePackConfig } from "../types";

/**
 * Drift — stub configuration only. Art for this pack is intentionally
 * not built in Milestone 1. Selecting it should render with the palette
 * but reuse base programmatic shapes.
 */
export const driftPack: ThemePackConfig = {
  key: "drift",
  displayName: "Drift",
  register: "drift",
  tilesetKey: "drift/v1",
  audioKey: "drift/v1",
  palette: {
    skyTop: "#1f2746",
    skyBottom: "#3a4a7a",
    water: "#1a3a55",
    waterShimmer: "#5d8cb3",
    land: "#5a6c8a",
    landAlt: "#8895b3",
    foliage: "#3f5d7a",
    foliageShadow: "#1f2f44",
    accent: "#c9a8ff",
    ink: "#eef2ff",
  },
  zoneSkins: {
    calm_cove: { skinName: "Moon Cove" },
    build_beach: { skinName: "Tide Workshop" },
    campfire: { skinName: "Ember Circle" },
    worry_hollow: { skinName: "Still Hollow" },
    garden: { skinName: "Night Garden" },
    field_guide_meadow: { skinName: "Star Meadow" },
  },
};
