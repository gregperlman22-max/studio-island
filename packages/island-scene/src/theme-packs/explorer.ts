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
    lighthouse_point: { skinName: "Old Beacon Cliff", decorationHints: ["rock", "rope-coil"] },
    treehouse_hideaway: { skinName: "Ranger Treehouse", decorationHints: ["tree", "lookout"] },
    campfire_circle: { skinName: "Trailhead Fire", decorationHints: ["log-pile", "kettle"] },
    art_hut: { skinName: "Maker's Cabin", decorationHints: ["easel", "crate"] },
    arcade_cove: { skinName: "Boardwalk Cove", decorationHints: ["awning", "lantern"] },
    welcome_dock: { skinName: "Harbor Dock", decorationHints: ["boat", "barrel"] },
    calm_beach: { skinName: "Quiet Shore", decorationHints: ["shell", "driftwood"] },
  },
};
