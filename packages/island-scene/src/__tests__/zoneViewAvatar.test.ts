// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";

/**
 * Issue #6 regression — the child's chosen Island Friend in Mode 2.
 *
 * Before S-89, `ZoneView.build()` always called `buildAvatarSprite(cfg)`, the
 * programmatic Wind-Waker compositor, which draws a code-built animal from
 * species / bodyColor / accessoryKey. So a child who picked Ollie the Otter
 * walked into any of the eight zone interiors and found a different animal
 * standing in for them — with the demo's default config, a pink bunny.
 *
 * The art was never the problem: `buildImageAvatarSprite` already existed and
 * already anchored correctly. The Mode-2 contract simply had no way to carry a
 * resolved Texture, so the renderer's cache was out of reach.
 *
 * These tests pin the fix at the seam: given a texture, every zone draws the
 * chosen art; given none, every zone still falls back to the compositor rather
 * than drawing nothing. The fallback half matters as much as the fix — art can
 * fail to load, and a child must never walk into an empty zone.
 */

const built: { kind: "image" | "programmatic"; zone: string }[] = [];
let currentZone = "";

vi.mock("pixi.js", () => {
  class Pt {
    x = 0; y = 0;
    set(x: number, y?: number) { this.x = x; this.y = y ?? x; }
  }
  class Node {
    children: Node[] = [];
    position = new Pt();
    scale = (() => { const p = new Pt(); p.set(1, 1); return p; })();
    anchor = new Pt();
    visible = true;
    alpha = 1;
    width = 0; height = 0;
    style: Record<string, unknown> = {};
    text = "";
    addChild(...cs: Node[]) { this.children.push(...cs); return cs[0]; }
    removeChildren() { const c = this.children; this.children = []; return c; }
    destroy() {}
    rect() { return this; } roundRect() { return this; } circle() { return this; }
    ellipse() { return this; } poly() { return this; } arc() { return this; }
    moveTo() { return this; } lineTo() { return this; }
    bezierCurveTo() { return this; } quadraticCurveTo() { return this; }
    fill() { return this; } stroke() { return this; } clear() { return this; }
  }
  return { Container: Node, Graphics: Node, Sprite: Node, Text: Node, Texture: Node };
});

// Record which builder the zone view reached for, without caring what either
// one draws — that is avatar.ts's business and is already covered.
vi.mock("../render/avatar", () => ({
  buildAvatarSprite: () => {
    built.push({ kind: "programmatic", zone: currentZone });
    return { container: { scale: { set() {} } }, setSelected() {} };
  },
  buildImageAvatarSprite: () => {
    built.push({ kind: "image", zone: currentZone });
    return { container: { scale: { set() {} } }, setSelected() {} };
  },
}));

const { ZoneView } = await import("../render/ZoneView");
const { sproutPack } = await import("../theme-packs");

/** Every zone that uses the side-scrolling interior — i.e. all but Treehouse,
 *  which is a painted room and is covered by questTable.test.ts. */
const ZONE_VIEW_ZONES = [
  "lighthouse_point", "campfire_circle", "art_hut", "arcade_cove",
  "welcome_dock", "calm_beach", "star_market", "lazy_lagoon",
] as const;

const CFG = {
  species: "bunny",
  bodyColor: "#f3c1d6",
  accessoryKey: "scarf",
  displayColor: "#c47b9a",
} as const;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mk = (): any => new (ZoneView as never as new (o: unknown) => unknown)({ reducedMotion: false });

function enter(zone: string, tex?: unknown): typeof built {
  built.length = 0;
  currentZone = zone;
  mk().enter(zone, sproutPack.palette, { ...CFG }, 1440, 900, tex);
  return built;
}

describe("the chosen Island Friend appears in every zone interior (issue #6)", () => {
  it.each(ZONE_VIEW_ZONES)("draws the chosen art in %s when a texture is available", (zone) => {
    const drawn = enter(zone, { width: 480, height: 640 });
    expect(drawn.length, `${zone} drew no character at all`).toBe(1);
    expect(drawn[0].kind, `${zone} fell back to the code-drawn animal`).toBe("image");
  });

  it.each(ZONE_VIEW_ZONES)("still draws someone in %s when the art hasn't loaded", (zone) => {
    const drawn = enter(zone);
    expect(drawn.length, `${zone} drew no character at all`).toBe(1);
    expect(drawn[0].kind).toBe("programmatic");
  });

  it("takes a late-arriving texture through restyle without re-entering", () => {
    built.length = 0;
    currentZone = "campfire_circle";
    const view = mk();
    view.enter("campfire_circle", sproutPack.palette, { ...CFG }, 1440, 900);
    expect(built.at(-1)?.kind).toBe("programmatic");
    view.restyle(sproutPack.palette, { ...CFG }, { width: 480, height: 640 });
    expect(built.at(-1)?.kind).toBe("image");
  });

  it("keeps the chosen art across a resize", () => {
    built.length = 0;
    currentZone = "art_hut";
    const view = mk();
    view.enter("art_hut", sproutPack.palette, { ...CFG }, 1440, 900, { width: 480, height: 640 });
    view.resize(390, 844);
    expect(built.at(-1)?.kind).toBe("image");
  });

  it("draws nobody when there is neither a texture nor a config", () => {
    built.length = 0;
    currentZone = "calm_beach";
    mk().enter("calm_beach", sproutPack.palette, null, 1440, 900);
    expect(built).toEqual([]);
  });
});
