import { Container, Graphics, Text } from "pixi.js";
import type { ThemePackConfig, ThemePalette, ZoneInstance } from "../types";
import { TILE_H, TILE_W } from "./constants";
import { hexNum, shade } from "./iso";

/**
 * Per-zone "place" art. Each zone gets a distinct ground patch + a few
 * characterful programmatic props so it reads as somewhere (a pond, an
 * orchard, a campfire) rather than a flat colored square. Programmatic now,
 * swappable for atlas art later behind the same builder.
 *
 * Local origin (0,0) is the footprint center; art is drawn around it.
 */
export interface ZoneScene {
  container: Container;
  setHover: (hovered: boolean) => void;
}

export function buildZoneScene(
  zone: ZoneInstance,
  theme: ThemePackConfig,
  hideLabels: boolean,
): ZoneScene {
  const { palette } = theme;
  const container = new Container();
  const halfW = (zone.footprint.w * TILE_W) / 2;
  const halfH = (zone.footprint.h * TILE_H) / 2;

  // Inner art container so hover scaling pivots on the footprint center.
  const art = new Container();
  container.addChild(art);

  const diamond = (g: Graphics, hw: number, hh: number) =>
    g.poly([0, -hh, hw, 0, 0, hh, -hw, 0]);

  // ── Ground patch (zone-specific) ──
  const ground = new Graphics();
  const gw = halfW - 4;
  const gh = halfH - 2;

  switch (zone.key) {
    case "calm_cove":
      paintPond(ground, gw, gh, palette);
      break;
    case "build_beach":
      paintBeach(ground, gw, gh, palette);
      break;
    case "campfire":
      paintCampfire(ground, gw, gh, palette);
      break;
    case "worry_hollow":
      paintHollow(ground, gw, gh, palette);
      break;
    case "garden":
      paintGarden(ground, gw, gh, palette);
      break;
    case "field_guide_meadow":
      paintMeadow(ground, gw, gh, palette);
      break;
  }
  art.addChild(ground);

  // Soft edge ring to seat the patch on the grass.
  const ring = new Graphics();
  diamond(ring, gw, gh).stroke({
    width: 2,
    color: hexNum(shade(palette.foliage, -0.15)),
    alpha: 0.3,
  });
  art.addChild(ring);

  // ── Locked state: dim + lock badge ──
  if (!zone.unlocked) {
    art.alpha = 0.6;
    const lock = new Graphics();
    lock.roundRect(-8, -22, 16, 13, 3).fill({ color: hexNum(palette.ink), alpha: 0.6 });
    lock.rect(-5, -28, 10, 7).stroke({ width: 2.5, color: hexNum(palette.ink), alpha: 0.6 });
    art.addChild(lock);
  }

  // ── Name label ──
  if (!hideLabels) {
    const label = new Text({
      text: zone.unlocked ? zone.skinName : `${zone.skinName} (locked)`,
      style: {
        fontFamily: "system-ui, sans-serif",
        fontSize: 14,
        fontWeight: "700",
        fill: hexNum(palette.ink),
        stroke: { color: 0xffffff, width: 3 },
        align: "center",
      },
    });
    label.anchor.set(0.5, 1);
    label.position.set(0, -halfH - 8);
    container.addChild(label);
  }

  return {
    container,
    setHover: (hovered: boolean) => {
      art.scale.set(hovered ? 1.05 : 1);
    },
  };
}

// ── Per-zone painters ──────────────────────────────────────────────

function paintPond(g: Graphics, hw: number, hh: number, p: ThemePalette) {
  const water = shade(p.water, -0.05);
  g.poly([0, -hh, hw, 0, 0, hh, -hw, 0]).fill(water);
  g.poly([0, -hh, hw, 0, 0, hh, -hw, 0]).fill({ color: hexNum(shade(p.water, 0.18)), alpha: 0.25 });
  // ripples
  for (let i = 0; i < 3; i++) {
    g.ellipse(-hw * 0.2 + i * 6, -hh * 0.1 + i * 5, 10 - i * 2, 4 - i).stroke({
      width: 1.5, color: hexNum(p.waterShimmer), alpha: 0.5,
    });
  }
  // lily pads
  for (const [lx, ly] of [[hw * 0.35, hh * 0.1], [-hw * 0.4, hh * 0.3], [hw * 0.05, -hh * 0.35]]) {
    g.ellipse(lx, ly, 7, 4).fill(hexNum(shade(p.foliage, 0.05)));
    g.circle(lx + 2, ly - 1, 1.6).fill(hexNum(p.accent));
  }
  // reeds
  for (const rx of [-hw * 0.55, hw * 0.5]) {
    g.moveTo(rx, hh * 0.1).lineTo(rx, hh * 0.1 - 14).stroke({ width: 2, color: hexNum(shade(p.foliage, -0.1)) });
    g.moveTo(rx + 4, hh * 0.12).lineTo(rx + 4, hh * 0.12 - 10).stroke({ width: 2, color: hexNum(p.foliage) });
  }
}

function paintBeach(g: Graphics, hw: number, hh: number, p: ThemePalette) {
  const sand = shade(p.landAlt, 0.05);
  g.poly([0, -hh, hw, 0, 0, hh, -hw, 0]).fill(sand);
  // speckles
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    g.circle(Math.cos(a) * hw * 0.5, Math.sin(a) * hh * 0.5, 1.2).fill({ color: hexNum(shade(p.landAlt, -0.2)), alpha: 0.5 });
  }
  // sandcastle
  g.roundRect(-10, -20, 20, 12, 2).fill(hexNum(shade(p.landAlt, -0.12)));
  g.rect(-10, -26, 5, 7).fill(hexNum(shade(p.landAlt, -0.18)));
  g.rect(5, -26, 5, 7).fill(hexNum(shade(p.landAlt, -0.18)));
  g.moveTo(0, -20).lineTo(0, -30).stroke({ width: 1.5, color: hexNum(p.accent) });
  g.poly([0, -30, 7, -28, 0, -26]).fill(hexNum(p.accent));
  // bucket + driftwood
  g.roundRect(hw * 0.45, -6, 7, 7, 1.5).fill(hexNum(p.accent));
  g.roundRect(-hw * 0.6, 2, 16, 3, 1.5).fill(hexNum(shade(p.land, -0.4)));
}

function paintCampfire(g: Graphics, hw: number, hh: number, p: ThemePalette) {
  const dirt = shade("#9a7b52", 0);
  g.poly([0, -hh, hw, 0, 0, hh, -hw, 0]).fill(dirt);
  g.poly([0, -hh, hw, 0, 0, hh, -hw, 0]).fill({ color: hexNum(shade("#7a5f3c", 0)), alpha: 0.25 });
  // stone ring
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    g.ellipse(Math.cos(a) * 16, Math.sin(a) * 8, 4, 3).fill(hexNum(shade(p.landAlt, -0.25)));
  }
  // logs
  g.roundRect(-9, -3, 18, 4, 2).fill(hexNum(shade(p.land, -0.45)));
  g.roundRect(-3, -10, 4, 12, 2).fill(hexNum(shade(p.land, -0.4)));
  // flame
  g.poly([0, -26, 6, -12, -6, -12]).fill(0xff8a3d);
  g.poly([0, -20, 3.5, -12, -3.5, -12]).fill(0xffd23d);
  // log seats
  g.roundRect(hw * 0.45, -2, 9, 5, 2).fill(hexNum(shade(p.land, -0.4)));
}

function paintHollow(g: Graphics, hw: number, hh: number, p: ThemePalette) {
  const moss = shade(p.foliage, -0.18);
  g.poly([0, -hh, hw, 0, 0, hh, -hw, 0]).fill(moss);
  g.poly([0, -hh, hw, 0, 0, hh, -hw, 0]).fill({ color: 0x000000, alpha: 0.12 });
  // smooth stones
  for (const [sx, sy, r] of [[-hw * 0.35, hh * 0.15, 9], [hw * 0.4, -hh * 0.1, 7], [hw * 0.1, hh * 0.35, 6]]) {
    g.ellipse(sx, sy + 2, r, r * 0.5).fill({ color: 0x000000, alpha: 0.15 });
    g.ellipse(sx, sy, r, r * 0.7).fill(hexNum(shade(p.landAlt, -0.3)));
    g.ellipse(sx - r * 0.3, sy - r * 0.25, r * 0.4, r * 0.3).fill(hexNum(shade(p.landAlt, -0.1)));
  }
  // ferns
  for (const fx of [-hw * 0.5, hw * 0.55]) {
    for (let k = -2; k <= 2; k++) {
      g.moveTo(fx, 4).lineTo(fx + k * 3, 4 - 14 + Math.abs(k) * 2).stroke({ width: 1.5, color: hexNum(shade(p.foliage, 0.05)) });
    }
  }
}

function paintGarden(g: Graphics, hw: number, hh: number, p: ThemePalette) {
  const soil = shade("#8a5a36", 0.05);
  g.poly([0, -hh, hw, 0, 0, hh, -hw, 0]).fill(soil);
  // tilled rows (parallel to one diamond axis)
  for (let i = -2; i <= 2; i++) {
    g.moveTo(-hw * 0.7 + i * 6, i * 4 - hh * 0.1)
      .lineTo(hw * 0.7 + i * 6, i * 4 + hh * 0.1)
      .stroke({ width: 2, color: hexNum(shade("#6e4528", 0)), alpha: 0.6 });
  }
  // sprouts + carrots
  for (let i = 0; i < 6; i++) {
    const sx = -hw * 0.5 + (i % 3) * hw * 0.5;
    const sy = -hh * 0.2 + Math.floor(i / 3) * hh * 0.4;
    g.moveTo(sx, sy).lineTo(sx - 2, sy - 6).stroke({ width: 1.5, color: hexNum(p.foliage) });
    g.moveTo(sx, sy).lineTo(sx + 2, sy - 6).stroke({ width: 1.5, color: hexNum(p.foliage) });
    if (i % 2 === 0) g.poly([sx, sy + 4, sx - 2, sy, sx + 2, sy]).fill(0xf08a3c);
  }
  // a couple flowers
  for (const [fx, fy] of [[hw * 0.4, -hh * 0.3], [-hw * 0.45, hh * 0.3]]) {
    flower(g, fx, fy, hexNum(p.accent));
  }
}

function paintMeadow(g: Graphics, hw: number, hh: number, p: ThemePalette) {
  const grass = shade(p.land, 0.08);
  g.poly([0, -hh, hw, 0, 0, hh, -hw, 0]).fill(grass);
  // grass tufts
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    const tx = Math.cos(a) * hw * 0.55;
    const ty = Math.sin(a) * hh * 0.55;
    g.moveTo(tx, ty).lineTo(tx - 2, ty - 7).stroke({ width: 1.5, color: hexNum(shade(p.foliage, 0.05)) });
    g.moveTo(tx, ty).lineTo(tx + 2, ty - 7).stroke({ width: 1.5, color: hexNum(shade(p.foliage, -0.05)) });
  }
  // flowers
  const cols = [hexNum(p.accent), 0xfff0a0, 0xffffff, 0xb98aff];
  for (let i = 0; i < 7; i++) {
    const fx = -hw * 0.55 + (i / 6) * hw * 1.1;
    const fy = -hh * 0.3 + Math.sin(i * 1.7) * hh * 0.3;
    flower(g, fx, fy, cols[i % cols.length]);
  }
  // butterfly
  g.ellipse(hw * 0.3, -hh * 0.5, 3, 2).fill(hexNum(p.accent));
  g.ellipse(hw * 0.3 + 4, -hh * 0.5, 3, 2).fill(hexNum(p.accent));
}

function flower(g: Graphics, x: number, y: number, color: number) {
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2;
    g.circle(x + Math.cos(a) * 2.2, y + Math.sin(a) * 2.2, 1.6).fill(color);
  }
  g.circle(x, y, 1.4).fill(0xffe14d);
}
