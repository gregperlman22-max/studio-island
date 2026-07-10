import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { sampleZones } from "../defaultLayout";
import { AVATARS } from "../render/avatarCatalog";
import { GUIDES } from "../render/guideCatalog";
import type { ZoneKey } from "../types";

/**
 * STANDING CONSTRAINT №2: the 9 guide characters are locked. This suite pins
 * the roster (name + animal + zone) and verifies every referenced art file
 * actually ships. A failure means either the roster was edited (revert it)
 * or an asset went missing from public/.
 */

const PUBLIC_DIR = join(__dirname, "../../public");

// zone → [guide name, animal] — locked roster.
const LOCKED_GUIDES: Record<ZoneKey, [string, string]> = {
  calm_beach: ["Shelly", "Turtle"],
  treehouse_hideaway: ["Olive", "Owl"],
  lighthouse_point: ["Wally", "Whale"],
  star_market: ["Rascal", "Raccoon"],
  arcade_cove: ["Mango", "Monkey"],
  art_hut: ["Fern", "Fox"],
  campfire_circle: ["Bruno", "Bear"],
  lazy_lagoon: ["Finn", "Frog"],
  welcome_dock: ["Captain Pete", "Pelican"],
};

describe("zone/guide registry", () => {
  it("sampleZones and GUIDES cover exactly the same 9 zone keys", () => {
    const zoneKeys = sampleZones.map((z) => z.key).sort();
    const guideKeys = (Object.keys(GUIDES) as ZoneKey[]).sort();
    expect(zoneKeys).toHaveLength(9);
    expect(guideKeys).toEqual(zoneKeys);
  });

  it("every zone has its locked guide (name + animal)", () => {
    for (const [zone, [name, animal]] of Object.entries(LOCKED_GUIDES)) {
      const g = GUIDES[zone as ZoneKey];
      expect(g, zone).toBeDefined();
      expect(g.name, zone).toBe(name);
      expect(g.animal, zone).toBe(animal);
      expect(g.zone, zone).toBe(zone);
      // Greeting text lives in the content pipeline now — content.test.ts
      // pins the exact strings.
    }
  });

  it("every guide art file exists in public/guides", () => {
    for (const g of Object.values(GUIDES)) {
      expect(existsSync(join(PUBLIC_DIR, "guides", g.file)), g.file).toBe(true);
    }
  });

  it("the avatar catalog has 16 entries whose art files exist in public/avatars", () => {
    expect(AVATARS).toHaveLength(16);
    for (const a of AVATARS) {
      expect(existsSync(join(PUBLIC_DIR, "avatars", a.file)), a.file).toBe(true);
    }
  });
});
