import { Container, Graphics, Text } from "pixi.js";
import type { ThemePackConfig, ThemePalette, ZoneInstance, ZoneKey } from "../types";
import { TILE_H, TILE_W } from "./constants";
import { hexNum, shade } from "./iso";

/**
 * Per-zone landmark art in a Wind Waker register: bold dark outlines, flat
 * vivid fills with a light highlight + dark shadow (cel shading), and
 * structures that read as real landmarks (not tiny tokens). Programmatic now,
 * swappable for atlas art later behind the same builder.
 *
 * Local origin (0,0) is the footprint center; art rises upward (negative y).
 */
export interface ZoneScene {
  container: Container;
  setHover: (hovered: boolean) => void;
  /** Gentle idle animation (called each frame with elapsed seconds). */
  animate?: (t: number) => void;
}

/** Bold cel outline color used across all art. */
const INK = 0x23201c;

export function buildZoneScene(
  zone: ZoneInstance,
  theme: ThemePackConfig,
  hideLabels: boolean,
): ZoneScene {
  const { palette } = theme;
  const container = new Container();
  const halfW = (zone.footprint.w * TILE_W) / 2;
  const halfH = (zone.footprint.h * TILE_H) / 2;

  const art = new Container();
  container.addChild(art);

  // Ground patch with a bold outline, cel-shaded to the biome.
  const ground = new Graphics();
  const gw = halfW - 3;
  const gh = halfH - 2;
  const groundColor = ZONE_GROUND[zone.key](palette);
  ground.poly([0, -gh, gw, 0, 0, gh, -gw, 0]).fill(groundColor).stroke({ width: 3, color: INK, alpha: 0.5 });
  ground.poly([0, -gh, gw * 0.5, -gh * 0.5, 0, 0, -gw * 0.5, -gh * 0.5]).fill({ color: hexNum(shade(groundColor, 0.16)), alpha: 0.5 });
  art.addChild(ground);

  // Landmark structure — LARGE (dominates its clearing).
  const structure = new Graphics();
  ZONE_PAINT[zone.key](structure, palette);
  const s = STRUCTURE_SCALE[zone.key] ?? 2.7;
  structure.scale.set(s);
  art.addChild(structure);

  // Gentle per-zone idle detail (disabled under reduced motion by the caller).
  let animate: ((t: number) => void) | undefined;
  switch (zone.key) {
    case "lighthouse_point": {
      const beam = new Graphics();
      beam.poly([0, 0, 96, -20, 96, 20]).fill({ color: 0xfff3b0, alpha: 0.4 });
      beam.position.set(0, -86 * s);
      art.addChild(beam); // on top so the rotating beam is clearly visible
      animate = (t) => { beam.rotation = t * 1.1; };
      break;
    }
    case "treehouse_hideaway": {
      animate = (t) => { structure.rotation = Math.sin(t * 0.5) * 0.025; };
      break;
    }
    case "campfire_circle":
      break; // flame is animated by the renderer
    case "art_hut": {
      const pal = new Graphics();
      pal.ellipse(0, 0, 4, 3).fill(0xffffff).stroke({ width: 2, color: INK });
      pal.circle(-1.5, -0.5, 1).fill(hexNum(palette.accent));
      pal.circle(1.5, 0.5, 1).fill(0x4aa6c9);
      const px = -23 * s, py = -22 * s;
      art.addChild(pal);
      animate = (t) => { pal.position.set(px, py + Math.sin(t * 2.2) * 3); };
      break;
    }
    case "arcade_cove": {
      const l1 = new Graphics(); l1.circle(0, 0, 2.6).fill(0xfff1a8); l1.position.set(-9.5 * s, -26 * s);
      const l2 = new Graphics(); l2.circle(0, 0, 2.6).fill(0x9be7ff); l2.position.set(9.5 * s, -26 * s);
      art.addChild(l1, l2);
      animate = (t) => { l1.alpha = Math.sin(t * 6) > 0 ? 1 : 0.25; l2.alpha = Math.sin(t * 6 + 1.6) > 0 ? 1 : 0.25; };
      break;
    }
    case "welcome_dock": {
      const glow = new Graphics();
      glow.circle(0, 0, 7).fill({ color: 0xfff1a8, alpha: 0.9 });
      glow.position.set(-19.5 * s, -20 * s);
      art.addChild(glow);
      animate = (t) => { glow.alpha = 0.35 + 0.5 * (0.5 + 0.5 * Math.sin(t * 5)); };
      break;
    }
    case "calm_beach": {
      animate = (t) => { structure.rotation = Math.sin(t * 0.6) * 0.03; };
      break;
    }
  }

  if (!zone.unlocked) {
    art.alpha = 0.6;
    const lock = new Graphics();
    lock.roundRect(-9, -24, 18, 14, 3).fill(0xf4d36b).stroke({ width: 3, color: INK });
    lock.rect(-5, -31, 10, 8).stroke({ width: 3, color: INK });
    art.addChild(lock);
  }

  if (!hideLabels) {
    const label = new Text({
      text: zone.unlocked ? zone.displayName : `${zone.displayName} (locked)`,
      style: {
        fontFamily: "system-ui, sans-serif",
        fontSize: 15,
        fontWeight: "800",
        fill: 0xffffff,
        stroke: { color: INK, width: 4 },
        align: "center",
      },
    });
    label.anchor.set(0.5, 1);
    label.position.set(0, -halfH - 10);
    container.addChild(label);
  }

  return {
    container,
    setHover: (hovered: boolean) => art.scale.set(hovered ? 1.05 : 1),
    animate,
  };
}

// ── Ground tone per zone ────────────────────────────────────────────
const STRUCTURE_SCALE: Record<ZoneKey, number> = {
  lighthouse_point: 3.4,
  treehouse_hideaway: 3.2,
  campfire_circle: 3.0,
  art_hut: 2.8,
  arcade_cove: 2.8,
  calm_beach: 2.4,
  welcome_dock: 3.0,
};

const ZONE_GROUND: Record<ZoneKey, (p: ThemePalette) => number> = {
  lighthouse_point: (p) => shade(p.landAlt, -0.12),
  treehouse_hideaway: (p) => shade(p.foliage, -0.1),
  campfire_circle: () => 0x9a7b52,
  art_hut: (p) => shade(p.land, 0.08),
  arcade_cove: (p) => shade(p.landAlt, 0.05),
  calm_beach: (p) => shade(p.landAlt, 0.08),
  welcome_dock: (p) => shade(p.water, -0.05),
};

// Cel-shaded box helper: flat fill + bold outline + soft top highlight.
function celBox(g: Graphics, x: number, y: number, w: number, h: number, r: number, color: number | string): void {
  g.roundRect(x, y, w, h, r).fill(color).stroke({ width: 3, color: INK });
  g.roundRect(x + 2, y + 2, w - 4, Math.max(2, h * 0.35), r).fill({ color: hexNum(shade(color, 0.2)), alpha: 0.55 });
}

/** Draw a zone's landmark structure (used by both the world map + interior). */
export function paintZoneStructure(g: Graphics, key: ZoneKey, p: ThemePalette): void {
  ZONE_PAINT[key](g, p);
}

/** Background wash color per zone interior. */
export const INTERIOR_BG: Record<ZoneKey, string> = {
  lighthouse_point: "#cfe6f2",
  treehouse_hideaway: "#c9e8c0",
  campfire_circle: "#f4d9b0",
  art_hut: "#f3d6e6",
  arcade_cove: "#c9d2ff",
  calm_beach: "#d6f0ee",
  welcome_dock: "#bfe6ee",
};

// ── Landmark painters (large, bold-outlined) ────────────────────────
const ZONE_PAINT: Record<ZoneKey, (g: Graphics, p: ThemePalette) => void> = {
  lighthouse_point: (g) => {
    // Rocky base + tall tapered tower with red/white bands + lantern light.
    g.ellipse(0, 2, 26, 11).fill(0x8d8475).stroke({ width: 3, color: INK });
    g.poly([-12, 0, 12, 0, 8, -64, -8, -64]).fill(0xfafafa).stroke({ width: 4, color: INK });
    // bands
    g.poly([-11, -6, 11, -6, 10.4, -18, -10.4, -18]).fill(0xe23b3b);
    g.poly([-9.2, -30, 9.2, -30, 8.6, -42, -8.6, -42]).fill(0xe23b3b);
    g.poly([-12, 0, 12, 0, 8, -64, -8, -64]).stroke({ width: 4, color: INK });
    // lantern room
    celBox(g, -10, -80, 20, 16, 3, 0x4a3b2c);
    g.roundRect(-7, -78, 14, 11, 2).fill(0xfff1a8).stroke({ width: 2.5, color: INK });
    g.poly([-12, -80, 12, -80, 0, -92]).fill(0xe23b3b).stroke({ width: 4, color: INK });
    // beam glow
    g.ellipse(0, -72, 22, 9).fill({ color: 0xfff1a8, alpha: 0.25 });
  },
  treehouse_hideaway: (g, p) => {
    // Big expressive tree + wooden platform house + ladder.
    const trunk = 0x7a5230;
    g.roundRect(-9, -56, 18, 60, 6).fill(trunk).stroke({ width: 4, color: INK });
    g.roundRect(-5, -52, 5, 52, 3).fill({ color: hexNum(shade(trunk, 0.18)), alpha: 0.5 });
    // platform + cabin
    g.roundRect(-26, -60, 52, 8, 3).fill(0x9a6b40).stroke({ width: 4, color: INK });
    celBox(g, -16, -84, 32, 24, 4, 0xb07a44);
    g.poly([-20, -84, 20, -84, 0, -100]).fill(shade(p.foliage, -0.2)).stroke({ width: 4, color: INK });
    g.roundRect(-5, -76, 10, 16, 2).fill(0x4a3b2c).stroke({ width: 2.5, color: INK });
    g.roundRect(6, -80, 7, 7, 1.5).fill(0xfff1a8).stroke({ width: 2, color: INK });
    // epic canopy
    g.circle(0, -52, 30).fill(hexNum(p.foliage)).stroke({ width: 4, color: INK });
    g.circle(-16, -62, 18).fill(hexNum(p.foliage)).stroke({ width: 4, color: INK });
    g.circle(17, -60, 17).fill(hexNum(p.foliage)).stroke({ width: 4, color: INK });
    g.circle(-8, -66, 12).fill({ color: hexNum(shade(p.foliage, 0.22)), alpha: 0.7 });
    // ladder
    g.roundRect(10, -52, 4, 50, 1).fill(trunk).stroke({ width: 2, color: INK });
  },
  campfire_circle: (g, p) => {
    // Big stone ring + bold flame.
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      g.ellipse(Math.cos(a) * 24, Math.sin(a) * 12, 6, 4).fill(shade(p.landAlt, -0.2)).stroke({ width: 2.5, color: INK });
    }
    g.roundRect(-14, -4, 28, 6, 2).fill(0x6e4a2a).stroke({ width: 3, color: INK });
    g.roundRect(-5, -16, 6, 16, 2).fill(0x7a5230).stroke({ width: 3, color: INK });
    g.poly([0, -44, 13, -14, -13, -14]).fill(0xff7a2d).stroke({ width: 4, color: INK });
    g.poly([0, -34, 7, -14, -7, -14]).fill(0xffd23d);
    g.poly([0, -24, 3.5, -14, -3.5, -14]).fill(0xfff1a8);
  },
  art_hut: (g, p) => {
    // Colorful hut with a propped canvas + warm window.
    celBox(g, -20, -34, 40, 34, 4, hexNum(p.accent));
    g.poly([-24, -34, 24, -34, 0, -52]).fill(0x4aa6c9).stroke({ width: 4, color: INK });
    g.roundRect(-7, -22, 14, 22, 2).fill(0x4a3b2c).stroke({ width: 3, color: INK }); // door
    g.roundRect(9, -28, 9, 9, 1.5).fill(0xfff1a8).stroke({ width: 2.5, color: INK }); // window
    // easel + canvas
    g.moveTo(-26, 2).lineTo(-22, -20).moveTo(-14, 2).lineTo(-18, -20).stroke({ width: 3, color: 0x6e4a2a });
    celBox(g, -28, -28, 14, 12, 1.5, 0xffffff);
    g.circle(-23, -23, 2.4).fill(hexNum(p.accent));
    g.rect(-26, -19, 8, 2).fill(0x4aa6c9);
  },
  arcade_cove: (g, p) => {
    // Bright arcade machines under a striped awning.
    celBox(g, -16, -34, 13, 34, 2, 0x4a5bd0);
    celBox(g, 3, -34, 13, 34, 2, 0xe2456b);
    g.roundRect(-13, -30, 7, 9, 1).fill(0x9be7ff).stroke({ width: 2, color: INK });
    g.roundRect(6, -30, 7, 9, 1).fill(0xffe14d).stroke({ width: 2, color: INK });
    // awning
    for (let i = 0; i < 6; i++) {
      g.poly([-20 + i * 6.5, -36, -13.5 + i * 6.5, -36, -16.5 + i * 6.5, -45]).fill(i % 2 ? 0xffffff : hexNum(p.accent));
    }
    g.poly([-20, -36, 19, -36, 16, -45, -17, -45]).stroke({ width: 3, color: INK });
    g.circle(-9.5, -25, 1.6).fill(0xfff1a8);
    g.circle(9.5, -25, 1.6).fill(0xfff1a8);
  },
  calm_beach: (g, p) => {
    // Quiet sandy cove: umbrella, smooth stones, gentle wave line.
    g.ellipse(-2, 6, 30, 8).fill({ color: hexNum(p.waterShimmer), alpha: 0.5 });
    g.moveTo(14, 2).lineTo(14, -26).stroke({ width: 3, color: 0x6e4a2a });
    g.poly([14, -34, 0, -22, 28, -22]).fill(hexNum(p.accent)).stroke({ width: 4, color: INK });
    g.poly([14, -34, 14, -22, 28, -22]).fill({ color: 0xffffff, alpha: 0.35 });
    g.ellipse(-16, 2, 9, 5).fill(0x9a9080).stroke({ width: 3, color: INK });
    g.ellipse(-6, 6, 6, 3.5).fill(0xb6ac9c).stroke({ width: 2.5, color: INK });
    g.circle(-20, -2, 2).fill(hexNum(p.accent)); // shell
  },
  welcome_dock: (g, p) => {
    // Wooden dock extending toward the viewer (into the water).
    const wood = 0x9a6b40;
    g.poly([-22, -6, 22, -6, 30, 26, -30, 26]).fill(shade(p.water, -0.08)).stroke({ width: 3, color: INK, alpha: 0.4 });
    for (let i = 0; i < 6; i++) {
      celBox(g, -20 + i * 7, -8, 6, 32, 1, i % 2 ? wood : shade(wood, 0.1));
    }
    g.roundRect(-24, -10, 52, 5, 2).fill(shade(wood, -0.1)).stroke({ width: 3, color: INK });
    // mooring posts + lantern
    g.roundRect(-22, -16, 5, 12, 1).fill(0x6e4a2a).stroke({ width: 2.5, color: INK });
    g.roundRect(17, -16, 5, 12, 1).fill(0x6e4a2a).stroke({ width: 2.5, color: INK });
    g.circle(-19.5, -20, 4).fill(0xfff1a8).stroke({ width: 2, color: INK });
  },
};
