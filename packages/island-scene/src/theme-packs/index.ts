export { sproutPack } from "./sprout";
export { explorerPack } from "./explorer";
export { driftPack } from "./drift";

import { sproutPack } from "./sprout";
import { explorerPack } from "./explorer";
import { driftPack } from "./drift";
import type { ThemePackConfig, ThemePackKey } from "../types";

export const themePacks: Record<ThemePackKey, ThemePackConfig> = {
  sprout: sproutPack,
  explorer: explorerPack,
  drift: driftPack,
};
