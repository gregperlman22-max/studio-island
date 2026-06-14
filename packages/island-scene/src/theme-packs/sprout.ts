import type { ThemePackConfig } from "../types";

export const sproutPack: ThemePackConfig = {
  key: "sprout",
  displayName: "Sprout",
  register: "sprout",
  tilesetKey: "sprout/v1",
  audioKey: "sprout/v1",
  palette: {
    skyTop: "#ffe9bf",
    skyBottom: "#ffce8f",
    water: "#46c6d8",
    waterShimmer: "#b6eff3",
    land: "#79c24b",
    landAlt: "#ecd590",
    foliage: "#3fa24a",
    foliageShadow: "#27713a",
    accent: "#ff6f97",
    ink: "#3a2616",
  },
  zoneSkins: {
    lighthouse_point: { skinName: "Beacon Point", decorationHints: ["rock", "gull"] },
    treehouse_hideaway: { skinName: "Treetop Hideaway", decorationHints: ["tree", "rope-ladder"] },
    campfire_circle: { skinName: "Marshmallow Ring", decorationHints: ["log-seat", "stone"] },
    art_hut: { skinName: "Paint Cabin", decorationHints: ["easel", "flower"] },
    arcade_cove: { skinName: "Arcade Cove", decorationHints: ["awning", "lantern"] },
    welcome_dock: { skinName: "Welcome Dock", decorationHints: ["boat", "plank"] },
    calm_beach: { skinName: "Calm Beach", decorationHints: ["shell", "starfish"] },
  },
};
