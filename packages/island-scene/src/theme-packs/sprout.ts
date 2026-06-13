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
    calm_cove: { skinName: "Bubble Cove", decorationHints: ["bubble-rock", "soft-shell"] },
    build_beach: { skinName: "Sandcastle Shore", decorationHints: ["bucket", "driftwood"] },
    campfire: { skinName: "Marshmallow Ring", decorationHints: ["log-seat"] },
    worry_hollow: { skinName: "Whisper Hollow", decorationHints: ["mossy-stone"] },
    garden: { skinName: "Carrot Patch", decorationHints: ["sprout", "watering-can"] },
    field_guide_meadow: { skinName: "Clover Meadow", decorationHints: ["clover", "butterfly"] },
  },
};
