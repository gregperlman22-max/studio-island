// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
  applyBuildEvent,
  canPlace,
  deserializeBuildState,
  nextRotation,
  placementCells,
  planPlacementUpdate,
  serializeBuildState,
} from "../build-engine/engine";
import { clearSlot, listSaveSlots, loadFromSlot, saveToSlot } from "../build-engine/saves";
import { EMPTY_BUILD_STATE, type BuildRegion, type BuildState, type Placement } from "../build-engine/types";
import { getBuildItem } from "../content/buildItems";

/** Session 5 — pure engine core: placement rules, reducer, diff, saves. */

const region: BuildRegion = { buildable: (x, y) => x >= 0 && y >= 0 && x < 10 && y < 10 };

const place = (id: string, itemId: string, x: number, y: number, rotation: 0 | 1 | 2 | 3 = 0): Placement => ({
  id, itemId, cell: { x, y }, rotation,
});

const state = (...placements: Placement[]): BuildState => ({ version: 1, placements });

describe("placement rules (canPlace)", () => {
  it("places inside the region, rejects outside / overlapping", () => {
    const bench = place("a", "comfort.bench", 2, 2); // 2x1
    expect(canPlace(EMPTY_BUILD_STATE, bench, region)).toBe(true);
    expect(canPlace(EMPTY_BUILD_STATE, place("b", "comfort.bench", 9, 9), region)).toBe(false); // 2nd cell off-region
    const s = applyBuildEvent(EMPTY_BUILD_STATE, { type: "place", placement: bench }, region);
    expect(canPlace(s, place("c", "nature.rock", 3, 2), region)).toBe(false); // overlaps bench's 2nd cell
    expect(canPlace(s, place("c", "nature.rock", 4, 2), region)).toBe(true);
  });

  it("rotation swaps the footprint (2x1 bench occupies vertically at r=1)", () => {
    const bench = place("a", "comfort.bench", 5, 5, 1);
    const cells = placementCells(bench, getBuildItem("comfort.bench")!);
    expect(cells).toEqual([{ x: 5, y: 5 }, { x: 5, y: 6 }]);
  });

  it("stacking: lantern only on a free surface, never on ground or occupied surface", () => {
    const lanternOnGround = place("l", "comfort.lantern", 1, 1);
    expect(canPlace(EMPTY_BUILD_STATE, lanternOnGround, region)).toBe(false);
    let s = applyBuildEvent(EMPTY_BUILD_STATE, { type: "place", placement: place("t", "comfort.table", 1, 1) }, region);
    expect(canPlace(s, place("l", "comfort.lantern", 1, 1), region)).toBe(true);
    s = applyBuildEvent(s, { type: "place", placement: place("l", "comfort.lantern", 1, 1) }, region);
    // Surface taken — a second lantern on the same table cell (or the other
    // table cell backed by the same table) is refused: no towers, one rider.
    expect(canPlace(s, place("l2", "comfort.lantern", 1, 1), region)).toBe(false);
    expect(canPlace(s, place("l2", "comfort.lantern", 2, 1), region)).toBe(false);
  });

  it("a stackable does not block ground placement (it floats on its surface)", () => {
    let s = applyBuildEvent(EMPTY_BUILD_STATE, { type: "place", placement: place("t", "comfort.table", 1, 1) }, region);
    s = applyBuildEvent(s, { type: "place", placement: place("l", "comfort.lantern", 1, 1) }, region);
    // Ground next to the table is still free even though the lantern "covers" (1,1).
    expect(canPlace(s, place("r", "nature.rock", 1, 2), region)).toBe(true);
  });
});

describe("reducer (applyBuildEvent)", () => {
  it("invalid events return the SAME state reference", () => {
    const s = state(place("a", "nature.rock", 1, 1));
    expect(applyBuildEvent(s, { type: "place", placement: place("b", "nature.rock", 1, 1) }, region)).toBe(s);
    expect(applyBuildEvent(s, { type: "remove", id: "ghost" }, region)).toBe(s);
    expect(applyBuildEvent(s, { type: "rotate", id: "a", rotation: 0 }, region)).toBe(s);
  });

  it("rotate re-validates swept cells and refuses collisions", () => {
    // bench at (0,0) r=0 occupies (0,0)+(1,0); rock at (0,1) blocks r=1.
    let s = state(place("b", "comfort.bench", 0, 0), place("r", "nature.rock", 0, 1));
    const refused = applyBuildEvent(s, { type: "rotate", id: "b", rotation: 1 }, region);
    expect(refused).toBe(s);
    s = state(place("b", "comfort.bench", 0, 0));
    const turned = applyBuildEvent(s, { type: "rotate", id: "b", rotation: 1 }, region);
    expect(turned.placements[0].rotation).toBe(1);
  });

  it("removing a surface removes its rider too (no floating lanterns)", () => {
    let s = applyBuildEvent(EMPTY_BUILD_STATE, { type: "place", placement: place("t", "comfort.table", 1, 1) }, region);
    s = applyBuildEvent(s, { type: "place", placement: place("l", "comfort.lantern", 1, 1) }, region);
    s = applyBuildEvent(s, { type: "remove", id: "t" }, region);
    expect(s.placements).toEqual([]);
  });

  it("nextRotation cycles the four quarter-turns", () => {
    expect([0, 1, 2, 3].map((r) => nextRotation(r as 0 | 1 | 2 | 3))).toEqual([1, 2, 3, 0]);
  });
});

describe("planPlacementUpdate (the sceneDiff pattern)", () => {
  const a = place("a", "nature.rock", 1, 1);
  const b = place("b", "comfort.bench", 3, 3);

  it("same-content next state is a strict no-op", () => {
    const plan = planPlacementUpdate([a, b], JSON.parse(JSON.stringify([a, b])));
    expect(plan.isNoop).toBe(true);
    expect(plan.add).toEqual([]);
    expect(plan.remove).toEqual([]);
    expect(plan.update).toEqual([]);
  });

  it("detects exactly the added / removed / changed placements", () => {
    const bTurned = { ...b, rotation: 1 as const };
    const c = place("c", "figures.dragon", 5, 5);
    const plan = planPlacementUpdate([a, b], [bTurned, c]);
    expect(plan.remove).toEqual(["a"]);
    expect(plan.add.map((p) => p.id)).toEqual(["c"]);
    expect(plan.update.map((p) => p.id)).toEqual(["b"]);
    expect(plan.isNoop).toBe(false);
  });
});

describe("saves (three local-storage slots)", () => {
  it("round-trips a build through each slot; corrupt data reads as empty", () => {
    localStorage.clear();
    const s = state(place("a", "figures.dragon", 2, 2, 3), place("t", "comfort.table", 6, 6));
    expect(saveToSlot(1, s)).toBe(true);
    expect(saveToSlot(2, EMPTY_BUILD_STATE, "Beach Day")).toBe(true);
    expect(loadFromSlot(1)).toEqual(s);
    expect(loadFromSlot(3)).toBeNull();
    const slots = listSaveSlots();
    expect(slots.map((x) => [x.slot, x.name, x.itemCount])).toEqual([
      [1, "My Island 1", 2],
      [2, "Beach Day", 0],
    ]);
    localStorage.setItem("engage-island.build.slot3", "{corrupt");
    expect(loadFromSlot(3)).toBeNull();
    clearSlot(1);
    expect(loadFromSlot(1)).toBeNull();
  });

  it("deserialization drops unknown items / dupes / malformed cells, keeps the rest", () => {
    const raw = JSON.stringify({
      version: 1,
      placements: [
        place("ok", "nature.rock", 1, 1),
        place("ok", "nature.rock", 2, 2), // dupe id — dropped
        place("bad-item", "nature.unicorn", 3, 3), // unknown item — dropped
        { id: "bad-cell", itemId: "nature.rock", cell: { x: 1.5, y: 2 }, rotation: 0 },
        place("ok2", "comfort.swing", 4, 4, 2),
      ],
    });
    const s = deserializeBuildState(raw);
    expect(s.placements.map((p) => p.id)).toEqual(["ok", "ok2"]);
    expect(deserializeBuildState(serializeBuildState(s))).toEqual(s);
    expect(deserializeBuildState("not json")).toEqual(EMPTY_BUILD_STATE);
  });
});
