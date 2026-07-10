import { describe, expect, it } from "vitest";
import { planZoneUpdate, zoneGeometrySig, zoneRenderSig } from "../render/sceneDiff";
import { sampleZones } from "../defaultLayout";
import type { ZoneInstance } from "../types";

/**
 * X6/F6 — the prop-diffing contract, pure half. planZoneUpdate is exactly the
 * work SceneRenderer.setZones performs; these tests pin that a prop change
 * translates into the SMALLEST update, and that a same-content array (the
 * memo-bust case every React host produces) is a strict no-op.
 */

const clone = (): ZoneInstance[] => JSON.parse(JSON.stringify(sampleZones));

describe("planZoneUpdate", () => {
  it("a new array with identical content is a strict no-op", () => {
    const plan = planZoneUpdate(sampleZones, clone());
    expect(plan.isNoop).toBe(true);
    expect(plan.rebuildScenes).toEqual([]);
    expect(plan.removeScenes).toEqual([]);
    expect(plan.rebuildLabels).toBe(false);
    expect(plan.updateGrid).toBe(false);
    expect(plan.updateScatter).toBe(false);
    expect(plan.updateFireflies).toBe(false);
  });

  it("a skinName-only change is a no-op (tooltip metadata, never rendered)", () => {
    const next = clone();
    next[0].skinName = "Totally Different Skin";
    expect(planZoneUpdate(sampleZones, next).isNoop).toBe(true);
  });

  it("an unlocked flip rebuilds ONLY that zone's scene + the labels", () => {
    const next = clone();
    const flipped = next.find((z) => z.key === "lighthouse_point")!;
    flipped.unlocked = false;
    const plan = planZoneUpdate(sampleZones, next);
    expect(plan.rebuildScenes).toEqual(["lighthouse_point"]);
    expect(plan.removeScenes).toEqual([]);
    expect(plan.rebuildLabels).toBe(true);
    expect(plan.updateGrid).toBe(false);
    expect(plan.updateScatter).toBe(false);
    expect(plan.updateFireflies).toBe(false);
    expect(plan.isNoop).toBe(false);
  });

  it("a displayName change rebuilds only that zone's scene + labels", () => {
    const next = clone();
    next.find((z) => z.key === "arcade_cove")!.displayName = "Game Cove";
    const plan = planZoneUpdate(sampleZones, next);
    expect(plan.rebuildScenes).toEqual(["arcade_cove"]);
    expect(plan.updateGrid).toBe(false);
  });

  it("moving a zone also re-derives the grid + scatter (but not fireflies)", () => {
    const next = clone();
    const moved = next.find((z) => z.key === "campfire_circle")!;
    moved.gridPosition = { x: moved.gridPosition.x + 1, y: moved.gridPosition.y };
    const plan = planZoneUpdate(sampleZones, next);
    expect(plan.rebuildScenes).toEqual(["campfire_circle"]);
    expect(plan.updateGrid).toBe(true);
    expect(plan.updateScatter).toBe(true);
    expect(plan.updateFireflies).toBe(false);
  });

  it("moving the treehouse additionally rebuilds the firefly cloud", () => {
    const next = clone();
    const tree = next.find((z) => z.key === "treehouse_hideaway")!;
    tree.gridPosition = { x: tree.gridPosition.x, y: tree.gridPosition.y + 1 };
    const plan = planZoneUpdate(sampleZones, next);
    expect(plan.updateFireflies).toBe(true);
    expect(plan.updateGrid).toBe(true);
  });

  it("a removed zone tears down its bundle and re-derives geometry", () => {
    const next = clone().filter((z) => z.key !== "lazy_lagoon");
    const plan = planZoneUpdate(sampleZones, next);
    expect(plan.removeScenes).toEqual(["lazy_lagoon"]);
    expect(plan.rebuildScenes).toEqual([]);
    expect(plan.rebuildLabels).toBe(true);
    expect(plan.updateGrid).toBe(true);
    expect(plan.updateScatter).toBe(true);
  });

  it("an added zone builds its bundle and re-derives geometry", () => {
    const prev = clone().filter((z) => z.key !== "lazy_lagoon");
    const plan = planZoneUpdate(prev, clone());
    expect(plan.rebuildScenes).toEqual(["lazy_lagoon"]);
    expect(plan.updateGrid).toBe(true);
  });

  it("signatures separate render-relevant fields from geometry", () => {
    const z = clone()[0];
    const unlockedFlip = { ...z, unlocked: !z.unlocked };
    expect(zoneRenderSig(z)).not.toBe(zoneRenderSig(unlockedFlip));
    expect(zoneGeometrySig(z)).toBe(zoneGeometrySig(unlockedFlip));
  });
});
