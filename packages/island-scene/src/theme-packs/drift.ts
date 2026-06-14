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
    lighthouse_point: { skinName: "Moonlit Beacon" },
    treehouse_hideaway: { skinName: "Owl Treehouse" },
    campfire_circle: { skinName: "Ember Circle" },
    art_hut: { skinName: "Lantern Studio" },
    arcade_cove: { skinName: "Neon Cove" },
    welcome_dock: { skinName: "Night Dock" },
    calm_beach: { skinName: "Still Shore" },
  },
};
