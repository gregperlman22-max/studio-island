import { describe, expect, it } from "vitest";
import { sampleLayout, sampleZones } from "../defaultLayout";
import type { GridPosition } from "../types";

/**
 * STANDING CONSTRAINT №1: the landmark coordinates in defaultLayout.ts are
 * PERMANENTLY LOCKED. This suite is the lock. If any expectation here fails,
 * the layout was modified — revert the layout, do NOT update the test,
 * unless Greg has explicitly unlocked a coordinate in writing.
 */

/** Order-independent checksum of a cell set (same formula the lock was baked with). */
const checksum = (cells: readonly GridPosition[]): number => {
  let h = 0;
  for (const c of cells) h = (h + ((c.x * 73856093) ^ (c.y * 19349663))) >>> 0;
  return h;
};

// [key, gridPosition.x, gridPosition.y, footprint.w, footprint.h] — locked.
const LOCKED_ZONES: ReadonlyArray<readonly [string, number, number, number, number]> = [
  ["campfire_circle", 26, 22, 4, 4],
  ["treehouse_hideaway", 11, 18, 5, 5],
  ["art_hut", 14, 8, 4, 4],
  ["arcade_cove", 34, 18, 5, 4],
  ["star_market", 18, 28, 4, 4],
  ["lighthouse_point", 30, 6, 4, 4],
  ["welcome_dock", 44, 38, 6, 4],
  ["calm_beach", 25, 37, 6, 4],
  ["lazy_lagoon", 45, 26, 5, 4],
];

describe("defaultLayout — locked coordinates", () => {
  it("has exactly the 9 locked zones at their locked positions", () => {
    expect(
      sampleZones.map((z) => [z.key, z.gridPosition.x, z.gridPosition.y, z.footprint.w, z.footprint.h]),
    ).toEqual(LOCKED_ZONES.map((z) => [...z]));
  });

  it("keeps the locked grid, spawn and picture-frame anchor", () => {
    expect(sampleLayout.grid).toEqual({ w: 56, h: 44 });
    expect(sampleLayout.spawnPoint).toEqual({ x: 41, y: 37 });
    expect(sampleLayout.pictureFrameAnchor).toEqual({ x: 27, y: 23 });
  });

  it("keeps the generated cell tables byte-for-byte (count + checksum)", () => {
    expect(sampleLayout.landCells).toHaveLength(1549);
    expect(checksum(sampleLayout.landCells)).toBe(2566133344);
    expect(sampleLayout.walkableCells).toHaveLength(1222);
    expect(checksum(sampleLayout.walkableCells!)).toBe(884167528);
    expect(sampleLayout.obstacleCells).toHaveLength(329);
    expect(checksum(sampleLayout.obstacleCells!)).toBe(3532179180);
  });

  it("keeps all zones unlocked and inside the grid", () => {
    for (const z of sampleZones) {
      expect(z.unlocked).toBe(true);
      expect(z.gridPosition.x).toBeGreaterThanOrEqual(0);
      expect(z.gridPosition.y).toBeGreaterThanOrEqual(0);
      expect(z.gridPosition.x + z.footprint.w).toBeLessThanOrEqual(sampleLayout.grid.w);
      expect(z.gridPosition.y + z.footprint.h).toBeLessThanOrEqual(sampleLayout.grid.h);
    }
  });
});
