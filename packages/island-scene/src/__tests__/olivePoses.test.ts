import { describe, expect, it } from "vitest";
import { OLIVE_POSES, oliveFile, olivePoseUrl } from "../render/oliveCatalog";
import { PIVOT_OVERRIDES } from "../render/avatarTexture";
import { olivePoseFor } from "../quest/questTableModel";

/**
 * Olive's poses — the contract that keeps her still when her pose changes.
 *
 * The three exports share a bbox centre of exactly 0.5 (the exporter centred
 * each cutout), so anchoring on the measured bbox centre would line up the
 * BOXES and move the BIRD — the encouraging pose's feet sit 56 px left of the
 * others'. PIVOT_OVERRIDES carries the measured FOOT centres instead. These
 * numbers were measured from the shipped files at the repo's own alpha
 * threshold (16); see tools/island-art/source/olive-poses-2026-09-18/RETAINED.md.
 */
describe("Olive's poses", () => {
  it("resolve to the runtime files under public/guides/olive/", () => {
    expect(OLIVE_POSES).toEqual(["neutral", "encouraging", "listening"]);
    for (const p of OLIVE_POSES) {
      expect(olivePoseUrl(p)).toMatch(new RegExp(`/guides/olive/olive-${p}\\.webp$`));
      expect(olivePoseUrl(p)).not.toContain("%2F"); // the folder separator survives
    }
  });

  it("pin every pose on its measured FEET, not on the bbox centre", () => {
    const feet: Record<string, number> = { neutral: 0.5104, encouraging: 0.3948, listening: 0.4813 };
    for (const p of OLIVE_POSES) {
      const o = PIVOT_OVERRIDES[oliveFile(p)];
      expect(o, `${p} has no pivot override — she will hop sideways`).toBeTruthy();
      expect(o.centerX).toBeCloseTo(feet[p], 4);
      expect(o.centerX).not.toBeCloseTo(0.5, 2); // the bbox centre is the wrong answer
    }
  });

  it("are chosen by what she is doing in the beat", () => {
    expect(olivePoseFor(null)).toBe("listening");     // the question is open
    expect(olivePoseFor("walk-over")).toBe("encouraging");
    expect(olivePoseFor("wave")).toBe("encouraging");
  });
});
