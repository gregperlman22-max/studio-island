import type { ThemePackConfig } from "../types";

export const sproutPack: ThemePackConfig = {
  key: "sprout",
  displayName: "Sprout",
  register: "sprout",
  tilesetKey: "sprout/v1",
  audioKey: "sprout/v1",
  palette: {
    skyTop: "#ffe7c2",
    skyBottom: "#ffd2a0",
    water: "#7ec9d6",
    waterShimmer: "#bde7ee",
    land: "#a8d878",
    landAlt: "#e9d18b",
    foliage: "#5fb35a",
    foliageShadow: "#3a7f4a",
    accent: "#ff8aa3",
    ink: "#3b2a1a",
  },
  zoneSkins: {
    calm_cove: { skinName: "Bubble Cove", decorationHints: ["bubble-rock", "soft-shell"] },
    build_beach: { skinName: "Sandcastle Shore", decorationHints: ["bucket", "driftwood"] },
    campfire: { skinName: "Marshmallow Ring", decorationHints: ["log-seat"] },
    worry_hollow: { skinName: "Whisper Hollow", decorationHints: ["mossy-stone"] },
    garden: { skinName: "Carrot Patch", decorationHints: ["sprout", "watering-can"] },
    field_guide_meadow: { skinName: "Clover Meadow", decorationHints: ["clover", "butterfly"] },
  },
};
