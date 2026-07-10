import { describe, expect, it } from "vitest";
import {
  BUILD_CATEGORIES,
  BUILD_ITEM_ID_RE,
  buildItemsVersion,
  getBuildItem,
  getBuildItems,
  getBuildItemsByCategory,
} from "../content/buildItems";

/** Session 5 — the build palette loads and validates from build-items.json. */
describe("build-item catalog", () => {
  const items = getBuildItems();

  it("loads the full palette with unique, well-formed ids", () => {
    expect(buildItemsVersion).toBe(1);
    expect(items.length).toBe(31);
    const ids = items.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const i of items) {
      expect(i.id, i.id).toMatch(BUILD_ITEM_ID_RE);
      expect(i.id.split(".")[0], i.id).toBe(i.category);
      expect(i.footprint.w, i.id).toBeGreaterThanOrEqual(1);
      expect(i.footprint.h, i.id).toBeGreaterThanOrEqual(1);
    }
  });

  it("covers all four sandtray categories with the pack's anchors", () => {
    for (const c of BUILD_CATEGORIES) {
      expect(getBuildItemsByCategory(c).length, c).toBeGreaterThanOrEqual(6);
    }
    // Named anchors from the sprint pack.
    for (const id of [
      "structures.small-house", "structures.tent", "nature.pond",
      "figures.knight", "figures.dragon", "comfort.lantern", "comfort.table",
    ]) {
      expect(getBuildItem(id), id).toBeTruthy();
    }
  });

  it("enforces the no-towers schema rule: nothing is both stackable and a surface", () => {
    for (const i of items) {
      expect(i.stackable && i.surfaceType !== null, i.id).toBe(false);
    }
    // The canonical pair: lantern stacks, table is a surface.
    expect(getBuildItem("comfort.lantern")!.stackable).toBe(true);
    expect(getBuildItem("comfort.table")!.surfaceType).toBe("table");
  });
});
