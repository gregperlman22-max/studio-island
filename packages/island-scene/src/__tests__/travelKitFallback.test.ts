// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The travel kit's destination when the pair is INCOMPLETE — review
 * correction 1, corridor/arrival side. Same rule as the map: the whole
 * back/front pair, or the whole master alone; never the cut back by itself,
 * never a front fragment. The corridor and the arrival stage draw whatever
 * `destination` / `destinationFront` say, so this is the representation they
 * consume.
 */
vi.mock("pixi.js", () => ({
  Texture: { from: (img: { src: string }) => ({ url: img.src, width: 1024, height: 1024 }) },
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
let failing: string[] = [];
class FakeImage {
  naturalWidth = 0; naturalHeight = 0; crossOrigin = "";
  onload: (() => void) | null = null; onerror: (() => void) | null = null;
  private _src = "";
  get src() { return this._src; }
  set src(u: string) {
    this._src = u;
    queueMicrotask(() => (failing.some((f) => u.includes(f)) ? this.onerror?.() : this.onload?.()));
  }
}
const { loadKit, DESTINATION_URL, DESTINATION_FRONT_URL, DESTINATION_FULL_URL } = await import("../travel/travelKit");

beforeEach(() => { vi.stubGlobal("Image", FakeImage); vi.spyOn(console, "warn").mockImplementation(() => {}); failing = []; });
afterEach(() => { vi.unstubAllGlobals(); });
const url = (t: Any) => String(t?.url ?? "");

describe("travel kit destination — complete pair or complete master", () => {
  it("loads the pair when both halves load", async () => {
    const k: Any = await loadKit();
    expect(url(k.destination)).toBe(DESTINATION_URL);
    expect(url(k.destinationFront)).toBe(DESTINATION_FRONT_URL);
  });

  it("front fails → the complete master alone, no front", async () => {
    failing = ["treehouse-front.webp"];
    const k: Any = await loadKit();
    expect(url(k.destination), "the cut back layer must not be the destination").toBe(DESTINATION_FULL_URL);
    expect(k.destinationFront).toBeUndefined();
  });

  it("back fails → the complete master alone; the front fragment never escapes", async () => {
    failing = ["landmarks/treehouse.webp"];
    const k: Any = await loadKit();
    expect(url(k.destination)).toBe(DESTINATION_FULL_URL);
    expect(k.destinationFront).toBeUndefined();
  });

  it("front and master both fail → the kit refuses, so no half-built journey", async () => {
    failing = ["treehouse-front.webp", "treehouse-full.webp"];
    await expect(loadKit()).rejects.toThrow(/treehouse-full/);
  });
});
