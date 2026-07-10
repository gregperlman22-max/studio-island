import { describe, expect, it } from "vitest";
import { footprintCenter, screenToTile, tileCenter, tileToScreen } from "../render/iso";

describe("iso projection", () => {
  it("screenToTile inverts tileCenter across the whole grid", () => {
    for (let gx = 0; gx < 56; gx += 5) {
      for (let gy = 0; gy < 44; gy += 5) {
        const c = tileCenter(gx, gy);
        expect(screenToTile(c.x, c.y)).toEqual({ x: gx, y: gy });
      }
    }
  });

  it("tileToScreen projects the origin to (0, 0)", () => {
    expect(tileToScreen(0, 0)).toEqual({ x: 0, y: 0 });
  });

  it("footprintCenter of a 1x1 footprint is the tile center", () => {
    expect(footprintCenter({ x: 10, y: 12 }, 1, 1)).toEqual(tileCenter(10, 12));
  });
});
