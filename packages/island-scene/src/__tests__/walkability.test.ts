import { describe, expect, it } from "vitest";
import { sampleLayout, sampleZones } from "../defaultLayout";
import { findPath, nearestWalkable } from "../render/pathfind";
import { buildWalkGrid } from "../render/walkgrid";

/**
 * The traversal contract behind the arrival flow and every zone tap: from the
 * dock spawn, the avatar must be able to reach a walkable entrance next to
 * every one of the 9 landmarks. This is exactly what SceneRenderer's
 * tap-to-visit path does (buildWalkGrid → nearestWalkable → findPath).
 */
describe("walkability invariants", () => {
  const grid = buildWalkGrid(sampleLayout, sampleZones);
  const spawn = sampleLayout.spawnPoint;
  const seed = grid.walkable(spawn.x, spawn.y)
    ? spawn
    : nearestWalkable(grid, spawn)!;

  it("spawn (or its nearest walkable cell) is on the grid", () => {
    expect(seed).toBeTruthy();
    expect(grid.walkable(seed.x, seed.y)).toBe(true);
  });

  it.each(sampleZones.map((z) => [z.key, z] as const))(
    "%s has a reachable entrance from spawn",
    (_key, zone) => {
      const center = {
        x: Math.floor(zone.gridPosition.x + zone.footprint.w / 2),
        y: Math.floor(zone.gridPosition.y + zone.footprint.h / 2),
      };
      const entrance = nearestWalkable(grid, center, 12, seed);
      expect(entrance, "entrance resolves").toBeTruthy();
      const path = findPath(grid, seed, entrance!);
      expect(path, "path from spawn exists").toBeTruthy();
      expect(path!.length).toBeGreaterThan(0);
    },
  );

  it("zone footprints themselves are not walkable (avatar can't stand in a landmark)", () => {
    for (const z of sampleZones) {
      for (let dx = 0; dx < z.footprint.w; dx++) {
        for (let dy = 0; dy < z.footprint.h; dy++) {
          expect(grid.walkable(z.gridPosition.x + dx, z.gridPosition.y + dy)).toBe(false);
        }
      }
    }
  });

  it("ocean cells outside the sand are not walkable", () => {
    expect(grid.walkable(0, 0)).toBe(false);
    expect(grid.walkable(55, 43)).toBe(false);
    expect(grid.walkable(-1, -1)).toBe(false);
  });
});
