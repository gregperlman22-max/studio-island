import { Container, Graphics } from "pixi.js";
import type { ThemePalette, ZoneKey } from "../types";
import { hexNum, lerpHex, shade } from "./iso";
import { paintZoneStructure } from "./zones";

/**
 * Mode 2 — third-person zone environments. Each zone is faked as three 2D
 * parallax layers (no true 3D):
 *
 *   sky    — static gradient backdrop (infinitely far, never scrolls)
 *   far    — distant silhouettes (tree line, hills, ocean) — scrolls 20%
 *   mid    — the zone's main landmark structure — scrolls 50%
 *   ground — the terrain strip filling the bottom ~40% — scrolls 100%
 *
 * Builders draw into the supplied layer Containers using SCREEN-y coordinates
 * (only x scrolls per layer) and return the world geometry the ZoneView needs:
 * how wide the explorable world is, where the character spawns, and where the
 * activity beacon + exit live. Programmatic now, swappable for atlas art later
 * behind the same builder signature.
 *
 * M1 ships the Campfire Circle fully; the other six fall back to a generic
 * environment (M2 replaces each with a bespoke one).
 */

const INK = 0x23201c;

/** Parallax scroll factors, shared by every zone (the depth illusion). */
export const PARALLAX = { far: 0.2, mid: 0.5, ground: 1 } as const;

export interface EnvLayers {
  sky: Graphics;
  far: Container;
  mid: Container;
  ground: Container;
  /** The animated beacon glow (mid layer, in front of the landmark). */
  beaconGlow: Graphics;
}

export interface ZoneEnv {
  /** Total explorable width in ground-plane px (wider than the screen). */
  worldWidth: number;
  /** Character's starting ground-x (left of the beacon, facing it). */
  spawnX: number;
  /** Activity beacon, in ground-plane world coords (where the character walks
   *  to). `r` is the glow radius used for the proximity test in later phases. */
  beacon: { x: number; y: number; r: number };
  /** The beacon glow's x in MID-layer-local px, so the renderer can map it to a
   *  live screen position (beaconMidX + mid.position.x) for tap hit-testing. */
  beaconMidX: number;
  /** Zone-appropriate warm colour for the "You found it!" discovery overlay. */
  tint: number;
  /** Exit path/door, ground-plane world-x (left edge). */
  exitX: number;
  /** Per-frame idle animation: elapsed seconds + beacon proximity (0..1). */
  animate?: (t: number, prox: number) => void;
}

// ── Shared painters ────────────────────────────────────────────────

/** Stacked-band vertical gradient (robust across Pixi minor versions). */
function paintSky(sky: Graphics, w: number, h: number, top: string, bottom: string): void {
  sky.clear();
  const bands = 24;
  for (let i = 0; i < bands; i++) {
    sky.rect(0, (h * i) / bands, w, h / bands + 1).fill(lerpHex(top, bottom, i / (bands - 1)));
  }
}

/** A repeating silhouette tree line for the FAR layer. */
function treeLine(
  g: Graphics, width: number, baseY: number, color: number | string, step: number, hMin: number, hMax: number, seed: number,
): void {
  const rnd = mulberry(seed);
  for (let x = -step; x < width + step; x += step) {
    const th = hMin + rnd() * (hMax - hMin);
    const tw = step * (0.5 + rnd() * 0.25);
    const cx = x + rnd() * step * 0.4;
    // chunky pine: stacked triangles
    g.poly([cx - tw / 2, baseY, cx + tw / 2, baseY, cx, baseY - th]).fill(color);
    g.poly([cx - tw * 0.42, baseY - th * 0.42, cx + tw * 0.42, baseY - th * 0.42, cx, baseY - th * 0.9]).fill(color);
  }
}

/** Deterministic 0..1 PRNG so terrain speckle is stable across rebuilds. */
function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Cel-shaded rounded box: flat fill + bold ink outline + soft top highlight. */
function celBox(g: Graphics, x: number, y: number, bw: number, bh: number, r: number, color: number | string): void {
  g.roundRect(x, y, bw, bh, r).fill(color).stroke({ width: 3, color: INK });
  g.roundRect(x + 2, y + 2, bw - 4, Math.max(2, bh * 0.34), r).fill({ color: hexNum(shade(color, 0.22)), alpha: 0.55 });
}

interface GroundOpts {
  /** Bright rim line along the horizon edge. */
  rim?: number | string;
  seed?: number;
  specks?: number;
  speckLight?: number | string;
  speckDark?: number | string;
}

/** Fill the GROUND strip with a flat base, a horizon rim, and a stable speckle. */
function groundStrip(
  g: Graphics, w: number, worldWidth: number, horizonY: number, h: number,
  color: number | string, o: GroundOpts = {},
): void {
  const W = worldWidth + w;
  g.rect(0, horizonY, W, h - horizonY).fill(color);
  if (o.rim !== undefined) g.rect(0, horizonY, W, 5).fill({ color: hexNum(o.rim), alpha: 0.7 });
  const rnd = mulberry(o.seed ?? 1);
  const light = o.speckLight ?? shade(color, 0.2);
  const dark = o.speckDark ?? shade(color, -0.3);
  for (let i = 0; i < (o.specks ?? 170); i++) {
    const x = rnd() * W;
    const y = horizonY + 6 + rnd() * (h - horizonY - 6);
    const r = 1 + rnd() * 2;
    g.ellipse(x, y, r, r * 0.6).fill({ color: hexNum(rnd() > 0.5 ? light : dark), alpha: 0.5 });
  }
}

/** A distant sea band (FAR layer) with static glints, for coastal zones. */
function seaBand(
  far: Container, width: number, top: number, bottom: number, color: number | string, shimmer: number | string,
): void {
  const g = new Graphics();
  g.rect(0, top, width, bottom - top + 2).fill(color);
  g.rect(0, top, width, 4).fill({ color: hexNum(shade(color, 0.25)), alpha: 0.5 });
  const rnd = mulberry(13);
  for (let i = 0; i < 70; i++) {
    const x = rnd() * width;
    const y = top + 6 + rnd() * (bottom - top - 6);
    g.ellipse(x, y, 6 + rnd() * 12, 1.4).fill({ color: hexNum(shimmer), alpha: 0.2 + rnd() * 0.25 });
  }
  far.addChild(g);
}

/** Animated foam lines just above the shoreline (redrawn each frame). */
function drawWaves(
  g: Graphics, width: number, y: number, color: number | string, t: number, rows: number, amp: number, speed: number,
): void {
  g.clear();
  for (let r = 0; r < rows; r++) {
    const yy = y - r * 7;
    const a = 0.22 + 0.18 * (0.5 + 0.5 * Math.sin(t * speed + r * 0.9));
    const dx = Math.sin(t * speed * 0.7 + r) * amp;
    g.ellipse(width * 0.5 + dx, yy, width * 0.5, 2.2).stroke({ width: 2.5, color: hexNum(color), alpha: a });
  }
}

// ── Public entry ───────────────────────────────────────────────────

export function buildZoneEnv(
  zone: ZoneKey, L: EnvLayers, w: number, h: number, p: ThemePalette,
): ZoneEnv {
  const worldWidth = Math.max(w * 2.4, 1200);
  const anchorX = w * 0.4; // character's resting screen-x (centered-left)
  const horizonY = h * 0.6; // top of the ground strip — bottom 40% is ground
  const beaconX = worldWidth * 0.72; // right-of-center
  const spawnX = worldWidth * 0.2;
  const exitX = 70;

  const geom: EnvGeom = { worldWidth, spawnX, beaconX, exitX, horizonY, anchorX };
  switch (zone) {
    case "campfire_circle": return campfire(L, w, h, p, geom);
    case "treehouse_hideaway": return treehouse(L, w, h, p, geom);
    case "lighthouse_point": return lighthouse(L, w, h, p, geom);
    case "art_hut": return artHut(L, w, h, p, geom);
    case "arcade_cove": return arcadeCove(L, w, h, p, geom);
    case "welcome_dock": return welcomeDock(L, w, h, p, geom);
    case "calm_beach": return calmBeach(L, w, h, p, geom);
    default: return generic(zone, L, w, h, p, geom);
  }
}

interface EnvGeom {
  worldWidth: number; spawnX: number; beaconX: number; exitX: number; horizonY: number; anchorX: number;
}

/**
 * Place a MID-layer landmark so that when the character (ground plane, scroll
 * 1.0) reaches `beaconX`, the landmark (mid plane, scroll 0.5) lines up beside
 * them on screen. Solving char screen == landmark screen at that camera:
 *   midLocalX = mid.factor * (beaconX - anchorX) + anchorX
 */
function landmarkX(g: EnvGeom): number {
  return PARALLAX.mid * (g.beaconX - g.anchorX) + g.anchorX;
}

// ── Campfire Circle ────────────────────────────────────────────────

function campfire(
  L: EnvLayers, w: number, h: number, p: ThemePalette, g: EnvGeom,
): ZoneEnv {
  const { worldWidth, horizonY } = g;

  // Dusk sky: deep indigo overhead warming to ember-orange at the horizon, so
  // the firelight reads. A soft moon sits high-left.
  paintSky(L.sky, w, h, "#221a3a", "#e29a55");
  L.sky.circle(w * 0.18, h * 0.2, 26).fill({ color: 0xfff3d6, alpha: 0.85 });
  L.sky.circle(w * 0.18, h * 0.2, 40).fill({ color: 0xfff3d6, alpha: 0.12 });

  // FAR: a dark ring of trees around the clearing + a hill band behind them.
  const far = L.far;
  far.removeChildren();
  const hills = new Graphics();
  hills.rect(0, horizonY - 8, worldWidth * PARALLAX.far + w, h).fill("#1d2436");
  hills.poly([0, horizonY, worldWidth, horizonY, worldWidth, horizonY - 4, 0, horizonY - 4]).fill("#161b2b");
  far.addChild(hills);
  const trees = new Graphics();
  treeLine(trees, worldWidth * PARALLAX.far + w, horizonY + 6, "#141a14", 56, 70, 130, 41);
  treeLine(trees, worldWidth * PARALLAX.far + w, horizonY + 14, "#0e120e", 78, 40, 80, 7);
  far.addChild(trees);

  // GROUND: dark earth clearing with a warm firelit rim near the horizon and a
  // scatter of speckles + a couple of log seats.
  const ground = L.ground;
  ground.removeChildren();
  const floor = new Graphics();
  const earth = "#3a2a1c";
  floor.rect(0, horizonY, worldWidth + w, h - horizonY).fill(earth);
  // firelight wash fading down from the horizon
  for (let i = 0; i < 8; i++) {
    const t = i / 7;
    floor.rect(0, horizonY + (h - horizonY) * t * 0.5, worldWidth + w, (h - horizonY) * 0.07)
      .fill({ color: hexNum(shade(earth, 0.22)), alpha: 0.12 * (1 - t) });
  }
  const rnd = mulberry(99);
  for (let i = 0; i < 220; i++) {
    const x = rnd() * (worldWidth + w);
    const y = horizonY + 6 + rnd() * (h - horizonY - 6);
    const r = 1 + rnd() * 2;
    floor.ellipse(x, y, r, r * 0.6).fill({ color: hexNum(shade(earth, rnd() > 0.5 ? 0.2 : -0.35)), alpha: 0.5 });
  }
  // log seats flanking the clearing
  for (const lx of [g.beaconX - 150, g.beaconX + 150]) {
    floor.roundRect(lx - 26, horizonY + (h - horizonY) * 0.34, 52, 13, 6).fill("#6e4a2a").stroke({ width: 3, color: INK });
    floor.roundRect(lx - 26, horizonY + (h - horizonY) * 0.34, 52, 5, 3).fill({ color: hexNum(shade("#6e4a2a", 0.2)), alpha: 0.6 });
  }
  ground.addChild(floor);

  // MID: the big stone ring with logs (static) + the animated flame (the
  // beacon). Placed so it aligns with the character at the beacon.
  const mid = L.mid;
  mid.removeChildren();
  const mx = landmarkX(g);
  const ringBaseY = horizonY + 18; // sits just below the horizon, on the ground
  const ringScale = Math.max(1.6, h / 360);

  const stones = new Graphics();
  const stoneN = 11;
  for (let i = 0; i < stoneN; i++) {
    const a = (i / stoneN) * Math.PI * 2;
    const sx = Math.cos(a) * 74 * ringScale;
    const sy = Math.sin(a) * 22 * ringScale;
    stones.ellipse(mx + sx, ringBaseY + sy, 15 * ringScale, 10 * ringScale)
      .fill(i % 2 ? "#9a9088" : "#827a72").stroke({ width: 3, color: INK });
    stones.ellipse(mx + sx, ringBaseY + sy - 3 * ringScale, 8 * ringScale, 4 * ringScale)
      .fill({ color: 0xffffff, alpha: 0.18 });
  }
  // crossed logs in the pit
  stones.roundRect(mx - 42 * ringScale, ringBaseY - 4, 84 * ringScale, 14, 6).fill("#5a3c22").stroke({ width: 3, color: INK });
  stones.roundRect(mx - 14 * ringScale, ringBaseY - 44 * ringScale, 18, 50 * ringScale, 7).fill("#6e4a2a").stroke({ width: 3, color: INK });
  mid.addChild(stones);

  // beacon glow (re-filled each frame) sits in front of the logs.
  const glow = L.beaconGlow;
  glow.position.set(0, 0);
  mid.addChild(glow);

  // tall flame, redrawn each frame.
  const flame = new Graphics();
  mid.addChild(flame);

  const fireY = ringBaseY - 8;
  // Draw a static flame immediately so reduced-motion has something to show.
  drawCampFlame(flame, mx, fireY, ringScale, 0, 1);

  const beaconY = horizonY - 30;
  return {
    worldWidth,
    spawnX: g.spawnX,
    beacon: { x: g.beaconX, y: beaconY, r: 130 },
    beaconMidX: mx,
    tint: 0xff9a3d,
    exitX: g.exitX,
    animate: (t, prox) => {
      drawCampFlame(flame, mx, fireY, ringScale, t, 1 + prox * 0.5);
      // warm ground glow that brightens as the character nears the fire
      glow.clear();
      const pulse = 0.5 + 0.5 * Math.sin(t * 4);
      const a = (0.16 + 0.18 * prox) * (0.7 + 0.3 * pulse);
      glow.ellipse(mx, fireY + 4, (120 + prox * 40) * ringScale * 0.6, (40 + prox * 16) * ringScale * 0.6)
        .fill({ color: 0xff9a3d, alpha: a });
    },
  };
}

/** A tall flickering campfire flame (mirrors the world-map flame, larger). */
function drawCampFlame(
  g: Graphics, bx: number, by: number, scale: number, t: number, grow: number,
): void {
  g.clear();
  const sway = Math.sin(t * 9) * 2.4 * scale + Math.sin(t * 21) * 1.0 * scale;
  const f = (1 + 0.22 * Math.sin(t * 13 + 1) + 0.08 * Math.sin(t * 31)) * grow;
  const H = 70 * scale * f;
  g.poly([bx, by - H, bx + 16 * scale, by - 12 * scale, bx + sway, by, bx - 16 * scale, by - 12 * scale])
    .fill(0xff7a2d).stroke({ width: 3, color: INK });
  g.poly([bx, by - H * 0.72, bx + 9 * scale, by - 10 * scale, bx + sway * 0.6, by, bx - 9 * scale, by - 10 * scale])
    .fill(0xffd23d);
  g.poly([bx, by - H * 0.45, bx + 4 * scale, by - 7 * scale, bx, by, bx - 4 * scale, by - 7 * scale])
    .fill(0xfff1a8);
}

// ── Treehouse Hideaway ─────────────────────────────────────────────

function treehouse(L: EnvLayers, w: number, h: number, p: ThemePalette, g: EnvGeom): ZoneEnv {
  const { worldWidth, horizonY } = g;
  const farW = worldWidth * PARALLAX.far + w;

  // Cool, dappled forest light filtering down through a high canopy.
  paintSky(L.sky, w, h, "#17352a", "#86b878");
  for (let i = 0; i < 5; i++) {
    const x = w * (0.12 + i * 0.19);
    L.sky.poly([x, 0, x + 70, 0, x + 16, horizonY, x - 40, horizonY]).fill({ color: 0xeafff0, alpha: 0.05 });
  }

  // FAR: layered tree lines — very tall trunks behind, denser canopy in front.
  L.far.removeChildren();
  const far = new Graphics();
  far.rect(0, horizonY - 10, farW, h).fill("#102219");
  treeLine(far, farW, horizonY + 4, "#0c1d14", 70, 150, 240, 31);
  treeLine(far, farW, horizonY + 12, "#08130d", 48, 80, 150, 5);
  L.far.addChild(far);

  // GROUND: rich dark soil with roots + the odd mushroom.
  L.ground.removeChildren();
  const floor = new Graphics();
  const soil = "#3a2c1e";
  groundStrip(floor, w, worldWidth, horizonY, h, soil, { rim: "#5c4730", seed: 71, specks: 150 });
  const rnd = mulberry(212);
  for (let i = 0; i < 22; i++) {
    const x = rnd() * (worldWidth + w);
    const y = horizonY + 10 + rnd() * (h - horizonY) * 0.7;
    // arching root
    floor.moveTo(x - 22, y).bezierCurveTo(x - 8, y - 10, x + 8, y - 10, x + 22, y)
      .stroke({ width: 4, color: hexNum(shade(soil, -0.25)), alpha: 0.6 });
    if (rnd() > 0.7) {
      floor.roundRect(x - 1.5, y - 6, 3, 6, 1).fill("#e9ddc4");
      floor.ellipse(x, y - 7, 5, 3.5).fill("#d8552f").stroke({ width: 2, color: INK });
    }
  }
  L.ground.addChild(floor);

  // MID: the great tree + cabin with a warm glowing door (the beacon).
  L.mid.removeChildren();
  const mx = landmarkX(g);
  const s = Math.max(2.0, h / 300);
  const art = new Container();
  art.position.set(mx, horizonY + 8);
  art.scale.set(s);
  const tree = new Graphics();
  const trunk = "#6e4a2a", wood = "#b07a44", woodDark = "#5a3c22", leaf = hexNum(p.foliage), leafLit = shade(p.foliage, 0.28);
  // trunk rising from the ground
  tree.poly([-15, 0, -10, -120, 10, -120, 15, 0]).fill(trunk).stroke({ width: 5, color: INK });
  tree.roundRect(-5, -116, 5, 116, 3).fill({ color: hexNum(shade(trunk, 0.2)), alpha: 0.4 });
  // canopy behind the cabin
  tree.circle(0, -158, 56).fill(leaf).stroke({ width: 5, color: INK });
  tree.circle(-44, -132, 32).fill(leaf).stroke({ width: 5, color: INK });
  tree.circle(44, -132, 32).fill(leaf).stroke({ width: 5, color: INK });
  tree.circle(0, -158, 51).fill(leaf);
  tree.circle(-20, -176, 20).fill({ color: hexNum(leafLit), alpha: 0.8 });
  // platform + cabin
  tree.roundRect(-46, -96, 92, 11, 5).fill(wood).stroke({ width: 5, color: INK });
  tree.roundRect(-32, -146, 64, 52, 5).fill(wood).stroke({ width: 5, color: INK });
  tree.moveTo(-32, -130).lineTo(32, -130).moveTo(-32, -116).lineTo(32, -116).stroke({ width: 1.5, color: woodDark, alpha: 0.5 });
  tree.poly([-40, -146, 40, -146, 0, -178]).fill(woodDark).stroke({ width: 5, color: INK });
  // lit window
  tree.roundRect(10, -138, 14, 14, 2).fill("#ffe39a").stroke({ width: 3, color: INK });
  tree.moveTo(17, -138).lineTo(17, -124).moveTo(10, -131).lineTo(24, -131).stroke({ width: 1.4, color: INK, alpha: 0.7 });
  // glowing door (beacon)
  tree.roundRect(-22, -122, 20, 28, 3).fill("#ffcf6e").stroke({ width: 3.5, color: INK });
  tree.circle(-6, -108, 1.8).fill(INK);
  // rope ladder down to the ground
  tree.moveTo(-9, -94).lineTo(-9, 0).moveTo(-1, -94).lineTo(-1, 0).stroke({ width: 2, color: "#ccb089" });
  for (let i = 0; i < 11; i++) tree.moveTo(-9, -88 + i * 8).lineTo(-1, -88 + i * 8).stroke({ width: 2, color: woodDark });
  art.addChild(tree);
  L.mid.addChild(art);

  const glow = L.beaconGlow;
  L.mid.addChild(glow);
  const doorX = mx - 12 * s, doorY = horizonY + 8 - 108 * s;
  const drawGlow = (t: number, prox: number) => {
    glow.clear();
    const pulse = 0.5 + 0.5 * Math.sin(t * 3);
    glow.ellipse(doorX, doorY, (30 + prox * 22) * s * 0.5, (40 + prox * 26) * s * 0.5)
      .fill({ color: 0xffd27a, alpha: (0.18 + 0.22 * prox) * (0.7 + 0.3 * pulse) });
  };
  drawGlow(0, 0);
  return {
    worldWidth, spawnX: g.spawnX, exitX: g.exitX,
    beacon: { x: g.beaconX, y: doorY, r: 130 }, beaconMidX: doorX, tint: 0xffcf6e,
    animate: (t, prox) => {
      tree.rotation = Math.sin(t * 0.5) * 0.012; // gentle canopy sway
      drawGlow(t, prox);
    },
  };
}

// ── Lighthouse Point ───────────────────────────────────────────────

function lighthouse(L: EnvLayers, w: number, h: number, p: ThemePalette, g: EnvGeom): ZoneEnv {
  const { worldWidth, horizonY } = g;
  const farW = worldWidth * PARALLAX.far + w;

  // Dramatic stormy dusk warming to a golden break at the horizon.
  paintSky(L.sky, w, h, "#3c466a", "#f2c074");
  L.sky.circle(w * 0.7, horizonY - 26, 34).fill({ color: 0xfff0c0, alpha: 0.5 });
  for (let i = 0; i < 3; i++) {
    L.sky.ellipse(w * (0.2 + i * 0.3), h * 0.18, 70 - i * 8, 18).fill({ color: 0x3a3550, alpha: 0.4 });
  }

  // FAR: a distant sea + far headland silhouettes.
  L.far.removeChildren();
  seaBand(L.far, farW, horizonY - 70, horizonY, "#2e4a6a", "#9fd0e6");
  const far = new Graphics();
  for (let x = -120; x < farW; x += 260) {
    far.poly([x, horizonY, x + 130, horizonY - 34 - (x % 80), x + 260, horizonY]).fill("#27314a");
  }
  L.far.addChild(far);

  // GROUND: grey rock with a visible cliff-edge drop near the front.
  L.ground.removeChildren();
  const rock = new Graphics();
  groundStrip(rock, w, worldWidth, horizonY, h, "#6f6e6a", { rim: "#9a988f", seed: 9, specks: 140, speckDark: "#4d4c49", speckLight: "#8f8d86" });
  // cliff-edge crack line running along the ground
  rock.moveTo(0, horizonY + (h - horizonY) * 0.5).bezierCurveTo(
    worldWidth * 0.3, horizonY + (h - horizonY) * 0.42, worldWidth * 0.6, horizonY + (h - horizonY) * 0.6, worldWidth + w, horizonY + (h - horizonY) * 0.5,
  ).stroke({ width: 4, color: "#3f3e3b", alpha: 0.6 });
  L.ground.addChild(rock);

  // MID: the lighthouse tower with a rotating beam + a glowing door (beacon).
  L.mid.removeChildren();
  const mx = landmarkX(g);
  const s = Math.max(2.0, h / 300);
  const art = new Container();
  art.position.set(mx, horizonY + 10);
  art.scale.set(s);
  const tower = new Graphics();
  tower.ellipse(0, 2, 46, 14).fill("#7c776e").stroke({ width: 4, color: INK }); // rock base
  tower.poly([-26, 0, 26, 0, 16, -150, -16, -150]).fill("#fafafa").stroke({ width: 5, color: INK });
  for (const yy of [-22, -62, -102]) tower.poly([-24 + (yy + 150) * 0.066, yy, 24 - (yy + 150) * 0.066, yy, 22 - (yy + 150) * 0.066, yy - 22, -22 + (yy + 150) * 0.066, yy - 22]).fill("#e23b3b");
  tower.poly([-26, 0, 26, 0, 16, -150, -16, -150]).stroke({ width: 5, color: INK });
  celBox(tower, -22, -186, 44, 36, 4, "#4a3b2c"); // lantern room frame
  tower.roundRect(-16, -182, 32, 26, 3).fill("#fff1a8").stroke({ width: 3, color: INK });
  tower.poly([-26, -186, 26, -186, 0, -210]).fill("#e23b3b").stroke({ width: 5, color: INK });
  // glowing door (beacon)
  tower.roundRect(-12, -34, 24, 34, 4).fill("#ffd870").stroke({ width: 3.5, color: INK });
  tower.circle(6, -16, 2).fill(INK);
  art.addChild(tower);
  // rotating beam cone above the lantern
  const beam = new Graphics();
  beam.poly([0, 0, 150, -40, 150, 40]).fill({ color: 0xfff3b0, alpha: 0.28 });
  beam.poly([0, 0, 156, -14, 156, 14]).fill({ color: 0xffffff, alpha: 0.4 });
  beam.position.set(0, -168);
  art.addChild(beam);
  L.mid.addChild(art);

  const glow = L.beaconGlow;
  L.mid.addChild(glow);
  const doorX = mx, doorY = horizonY + 10 - 16 * s;
  const drawGlow = (t: number, prox: number) => {
    glow.clear();
    const pulse = 0.5 + 0.5 * Math.sin(t * 3.5);
    glow.ellipse(doorX, doorY, (26 + prox * 20) * s * 0.5, (34 + prox * 22) * s * 0.5)
      .fill({ color: 0xffe79a, alpha: (0.16 + 0.22 * prox) * (0.7 + 0.3 * pulse) });
  };
  drawGlow(0, 0);
  return {
    worldWidth, spawnX: g.spawnX, exitX: g.exitX,
    beacon: { x: g.beaconX, y: doorY, r: 130 }, beaconMidX: doorX, tint: 0xffe79a,
    animate: (t, prox) => { beam.rotation = t * 1.4; drawGlow(t, prox); },
  };
}

// ── Art Hut ────────────────────────────────────────────────────────

function artHut(L: EnvLayers, w: number, h: number, p: ThemePalette, g: EnvGeom): ZoneEnv {
  const { worldWidth, horizonY } = g;
  const farW = worldWidth * PARALLAX.far + w;

  // Bright, cheerful midday.
  paintSky(L.sky, w, h, "#7ec8ef", "#e6f6ff");
  L.sky.circle(w * 0.82, h * 0.16, 30).fill({ color: 0xfff6c8, alpha: 0.9 });
  L.sky.circle(w * 0.82, h * 0.16, 48).fill({ color: 0xfff6c8, alpha: 0.18 });

  // FAR: soft rolling meadow hills + tiny distant trees.
  L.far.removeChildren();
  const far = new Graphics();
  for (let k = 0; k < 2; k++) {
    const baseY = horizonY + 6 - k * 10;
    const col = k === 0 ? "#9fd06a" : "#86c25a";
    for (let x = -160; x < farW + 160; x += 220) {
      far.ellipse(x + (k * 90), baseY, 180, 70).fill(col);
    }
  }
  far.rect(0, horizonY, farW, 30).fill("#9fd06a");
  L.far.addChild(far);

  // GROUND: meadow grass scattered with flowers.
  L.ground.removeChildren();
  const grass = new Graphics();
  groundStrip(grass, w, worldWidth, horizonY, h, "#6fb84a", { rim: "#a7e25a", seed: 33, specks: 120, speckLight: "#a7e25a", speckDark: "#4f9a3a" });
  const rnd = mulberry(404);
  const cols = [hexNum(p.accent), 0xffe14d, 0xffffff, 0xb98aff, 0xff8aa3];
  for (let i = 0; i < 60; i++) {
    const x = rnd() * (worldWidth + w);
    const y = horizonY + 12 + rnd() * (h - horizonY - 12);
    const c = cols[Math.floor(rnd() * cols.length)];
    grass.circle(x, y, 2.4).fill(c); grass.circle(x, y, 1).fill(0xfff0a0);
    grass.moveTo(x, y + 2).lineTo(x, y + 7).stroke({ width: 1.5, color: "#4f9a3a" });
  }
  L.ground.addChild(grass);

  // MID: colourful hut hung with paintings + a glowing easel (beacon) in front.
  L.mid.removeChildren();
  const mx = landmarkX(g);
  const s = Math.max(2.4, h / 240);
  const art = new Container();
  art.position.set(mx, horizonY + 12);
  art.scale.set(s);
  const hut = new Graphics();
  celBox(hut, -48, -72, 96, 72, 6, hexNum(p.accent));
  hut.poly([-56, -72, 56, -72, 0, -112]).fill("#4aa6c9").stroke({ width: 5, color: INK });
  hut.poly([-56, -72, 0, -112, -10, -72]).fill({ color: 0xffffff, alpha: 0.25 });
  hut.roundRect(-14, -46, 28, 46, 3).fill("#5a3c22").stroke({ width: 4, color: INK }); // door
  hut.circle(8, -24, 2).fill(0xffe14d);
  hut.roundRect(20, -58, 18, 18, 2).fill("#ffe39a").stroke({ width: 3, color: INK }); // window
  // paintings on the wall
  const paint = [0xff8aa3, 0x6fb84a, 0xffd23d, 0x6aa6ff];
  for (let i = 0; i < 3; i++) {
    celBox(hut, -44 + i * 0, -66 + i * 22, 22, 16, 2, paint[i % paint.length]);
    hut.circle(-37, -58 + i * 22, 3).fill(0xffffff).stroke({ width: 1.5, color: INK });
  }
  // easel + canvas (beacon) in front-right
  const easelX = 46;
  hut.moveTo(easelX - 14, 0).lineTo(easelX - 4, -46).moveTo(easelX + 14, 0).lineTo(easelX + 4, -46).stroke({ width: 4, color: "#6e4a2a" });
  hut.moveTo(easelX - 4, -16).lineTo(easelX + 4, -16).stroke({ width: 4, color: "#6e4a2a" });
  celBox(hut, easelX - 18, -52, 36, 30, 2, 0xffffff);
  hut.circle(easelX - 8, -42, 4).fill(hexNum(p.accent));
  hut.rect(easelX - 12, -34, 18, 4).fill(0x4aa6c9);
  hut.rect(easelX - 4, -30, 14, 4).fill(0xffd23d);
  art.addChild(hut);
  L.mid.addChild(art);

  const glow = L.beaconGlow;
  L.mid.addChild(glow);
  const ex = mx + easelX * s, ey = horizonY + 12 - 36 * s;
  const drawGlow = (t: number, prox: number) => {
    glow.clear();
    const pulse = 0.5 + 0.5 * Math.sin(t * 3.5);
    glow.ellipse(ex, ey, (28 + prox * 20) * s * 0.5, (32 + prox * 22) * s * 0.5)
      .fill({ color: hexNum(p.accent), alpha: (0.14 + 0.22 * prox) * (0.7 + 0.3 * pulse) });
  };
  drawGlow(0, 0);
  return {
    worldWidth, spawnX: g.spawnX, exitX: g.exitX,
    beacon: { x: g.beaconX, y: ey, r: 130 }, beaconMidX: ex, tint: hexNum(p.accent),
    animate: (t, prox) => { drawGlow(t, prox); },
  };
}

// ── Arcade Cove ────────────────────────────────────────────────────

function arcadeCove(L: EnvLayers, w: number, h: number, p: ThemePalette, g: EnvGeom): ZoneEnv {
  const { worldWidth, horizonY } = g;
  const farW = worldWidth * PARALLAX.far + w;

  // Vivid sunset over the sea.
  paintSky(L.sky, w, h, "#5b2a7a", "#ffae5e");
  L.sky.circle(w * 0.5, horizonY - 30, 40).fill({ color: 0xffd98a, alpha: 0.85 });
  L.sky.circle(w * 0.5, horizonY - 30, 64).fill({ color: 0xffd98a, alpha: 0.18 });

  // FAR: sunset ocean + a glittering sun trail.
  L.far.removeChildren();
  seaBand(L.far, farW, horizonY - 60, horizonY, "#7a3f86", "#ffd0a0");
  const trail = new Graphics();
  for (let i = 0; i < 8; i++) trail.ellipse(farW * 0.5 + (Math.random() - 0.5) * 6, horizonY - i * 7, 30 - i * 2.6, 2).fill({ color: 0xffd98a, alpha: 0.3 });
  L.far.addChild(trail);
  const waves = new Graphics();
  L.far.addChild(waves);

  // GROUND: warm sunset-lit sand.
  L.ground.removeChildren();
  const sand = new Graphics();
  groundStrip(sand, w, worldWidth, horizonY, h, "#caa46a", { rim: "#ffce8f", seed: 51, specks: 130, speckLight: "#e6c690", speckDark: "#9c7a48" });
  L.ground.addChild(sand);

  // MID: a row of arcade machines under a striped awning; brightest = beacon.
  L.mid.removeChildren();
  const mx = landmarkX(g);
  const s = Math.max(2.4, h / 240);
  const art = new Container();
  art.position.set(mx, horizonY + 12);
  art.scale.set(s);
  const cab = new Graphics();
  const bodies = ["#4a5bd0", "#e2456b", "#22b07a"];
  const lights: { x: number; y: number; c: number }[] = [];
  for (let i = 0; i < 3; i++) {
    const x = -54 + i * 38;
    celBox(cab, x, -78, 32, 78, 4, bodies[i]);
    cab.roundRect(x + 5, -70, 22, 22, 2).fill(i === 2 ? "#aef9d2" : "#9be7ff").stroke({ width: 2.5, color: INK }); // screen
    cab.roundRect(x + 6, -40, 20, 8, 2).fill("#ffe14d"); // control panel
    lights.push({ x: x + 16, y: -82, c: i === 2 ? 0xaef9d2 : 0xfff1a8 });
  }
  // striped awning
  for (let i = 0; i < 10; i++) cab.poly([-62 + i * 12, -84, -50 + i * 12, -84, -56 + i * 12, -96]).fill(i % 2 ? 0xffffff : hexNum(p.accent));
  cab.poly([-62, -84, 56, -84, 50, -96, -56, -96]).stroke({ width: 4, color: INK });
  art.addChild(cab);
  // blinking marquee lights
  const blink = new Graphics();
  art.addChild(blink);
  L.mid.addChild(art);

  const glow = L.beaconGlow;
  L.mid.addChild(glow);
  const beaconCab = lights[2]; // the green machine is the brightest (beacon)
  const bx = mx + beaconCab.x * s, by = horizonY + 12 - 58 * s;
  const draw = (t: number, prox: number) => {
    blink.clear();
    for (let i = 0; i < lights.length; i++) {
      const on = Math.sin(t * 6 + i * 1.7) > 0;
      blink.circle(lights[i].x, lights[i].y, 2.6).fill({ color: lights[i].c, alpha: on ? 1 : 0.25 });
    }
    glow.clear();
    const pulse = 0.5 + 0.5 * Math.sin(t * 5);
    glow.ellipse(bx, by, (34 + prox * 24) * s * 0.5, (46 + prox * 28) * s * 0.5)
      .fill({ color: 0x6affc0, alpha: (0.16 + 0.24 * prox) * (0.6 + 0.4 * pulse) });
  };
  draw(0, 0);
  return {
    worldWidth, spawnX: g.spawnX, exitX: g.exitX,
    beacon: { x: g.beaconX, y: by, r: 130 }, beaconMidX: bx, tint: 0x6affc0,
    animate: (t, prox) => { drawWaves(waves, farW, horizonY - 4, "#ffe0b0", t, 3, 10, 1.4); draw(t, prox); },
  };
}

// ── Welcome Dock ───────────────────────────────────────────────────

function welcomeDock(L: EnvLayers, w: number, h: number, p: ThemePalette, g: EnvGeom): ZoneEnv {
  const { worldWidth, horizonY } = g;
  const farW = worldWidth * PARALLAX.far + w;

  // Soft golden morning.
  paintSky(L.sky, w, h, "#9cc4e6", "#ffe6b3");
  L.sky.circle(w * 0.24, h * 0.2, 28).fill({ color: 0xfff3cf, alpha: 0.85 });
  L.sky.circle(w * 0.24, h * 0.2, 46).fill({ color: 0xfff3cf, alpha: 0.16 });

  // FAR: calm sea + a tiny distant island with a single tree.
  L.far.removeChildren();
  seaBand(L.far, farW, horizonY - 64, horizonY, "#5fb6c9", "#cdeef2");
  const isle = new Graphics();
  isle.ellipse(farW * 0.62, horizonY - 18, 40, 12).fill("#4f8f6a");
  isle.poly([farW * 0.62 - 4, horizonY - 22, farW * 0.62 + 4, horizonY - 22, farW * 0.62, horizonY - 44]).fill("#6e4a2a");
  isle.circle(farW * 0.62, horizonY - 46, 12).fill("#3fa24a");
  L.far.addChild(isle);
  const waves = new Graphics();
  L.far.addChild(waves);

  // GROUND: weathered wooden dock planks running underfoot.
  L.ground.removeChildren();
  const dock = new Graphics();
  const plank = "#a9763f";
  dock.rect(0, horizonY, worldWidth + w, h - horizonY).fill(plank);
  for (let y = horizonY + 14; y < h; y += 22) dock.rect(0, y, worldWidth + w, 3).fill({ color: hexNum(shade(plank, -0.3)), alpha: 0.5 });
  for (let x = 0; x < worldWidth + w; x += 120) dock.rect(x, horizonY, 4, h - horizonY).fill({ color: hexNum(shade(plank, -0.25)), alpha: 0.35 });
  dock.rect(0, horizonY, worldWidth + w, 5).fill({ color: hexNum(shade(plank, 0.25)), alpha: 0.6 });
  L.ground.addChild(dock);

  // MID: mooring posts + a tied boat + a glowing welcome sign (beacon).
  L.mid.removeChildren();
  const mx = landmarkX(g);
  const s = Math.max(2.2, h / 260);
  const art = new Container();
  art.position.set(mx, horizonY + 6);
  art.scale.set(s);
  const struct = new Graphics();
  // boat moored just beyond the dock edge
  const boat = new Graphics();
  boat.ellipse(-70, -6, 4, 2).fill({ color: 0x000000, alpha: 0.2 });
  boat.poly([-94, -14, -46, -14, -54, 2, -86, 2]).fill("#b5763f").stroke({ width: 4, color: INK });
  boat.roundRect(-92, -18, 46, 5, 2).fill("#cf9457").stroke({ width: 4, color: INK });
  boat.moveTo(-70, -18).lineTo(-70, -54).stroke({ width: 4, color: INK });
  boat.poly([-70, -54, -70, -22, -44, -30]).fill("#fff1f0").stroke({ width: 4, color: INK });
  struct.addChild(boat);
  // mooring posts + rope
  const posts = new Graphics();
  posts.roundRect(-30, -30, 9, 30, 2).fill("#6e4a2a").stroke({ width: 3.5, color: INK });
  posts.roundRect(40, -30, 9, 30, 2).fill("#6e4a2a").stroke({ width: 3.5, color: INK });
  posts.moveTo(-46, -16).quadraticCurveTo(-36, -6, -25, -26).stroke({ width: 2, color: "#d8c49a" });
  struct.addChild(posts);
  // welcome sign (beacon)
  const sign = new Graphics();
  sign.roundRect(10, -64, 9, 64, 2).fill("#6e4a2a").stroke({ width: 3, color: INK });
  celBox(sign, -8, -86, 44, 26, 4, "#ffcf6e");
  sign.roundRect(-8, -90, 44, 5, 2).fill("#e2456b").stroke({ width: 2.5, color: INK }); // trim
  sign.circle(2, -73, 2.6).fill("#e2456b"); sign.circle(14, -73, 2.6).fill("#4a5bd0"); sign.circle(26, -73, 2.6).fill("#22b07a");
  struct.addChild(sign);
  art.addChild(struct);
  L.mid.addChild(art);

  const glow = L.beaconGlow;
  L.mid.addChild(glow);
  const sx = mx + 14 * s, sy = horizonY + 6 - 73 * s;
  const drawGlow = (t: number, prox: number) => {
    glow.clear();
    const pulse = 0.5 + 0.5 * Math.sin(t * 3);
    glow.ellipse(sx, sy, (30 + prox * 22) * s * 0.5, (24 + prox * 18) * s * 0.5)
      .fill({ color: 0xffe6a0, alpha: (0.16 + 0.22 * prox) * (0.7 + 0.3 * pulse) });
  };
  drawGlow(0, 0);
  return {
    worldWidth, spawnX: g.spawnX, exitX: g.exitX,
    beacon: { x: g.beaconX, y: sy, r: 130 }, beaconMidX: sx, tint: 0xffe6a0,
    animate: (t, prox) => {
      drawWaves(waves, farW, horizonY - 4, "#dff4f7", t, 2, 7, 0.9);
      boat.rotation = Math.sin(t * 1.1) * 0.04; // gentle moored bob
      drawGlow(t, prox);
    },
  };
}

// ── Calm Beach ─────────────────────────────────────────────────────

function calmBeach(L: EnvLayers, w: number, h: number, p: ThemePalette, g: EnvGeom): ZoneEnv {
  const { worldWidth, horizonY } = g;
  const farW = worldWidth * PARALLAX.far + w;

  // The most peaceful zone: soft pastel dawn.
  paintSky(L.sky, w, h, "#bba9d6", "#ffdcc6");
  L.sky.circle(w * 0.72, h * 0.22, 22).fill({ color: 0xfff0e0, alpha: 0.7 });
  L.sky.circle(w * 0.72, h * 0.22, 40).fill({ color: 0xfff0e0, alpha: 0.12 });

  // FAR: a gentle, glassy sea.
  L.far.removeChildren();
  seaBand(L.far, farW, horizonY - 56, horizonY, "#8fc6d2", "#e6f6f7");
  const waves = new Graphics();
  L.far.addChild(waves);

  // GROUND: pale, soft sand.
  L.ground.removeChildren();
  const sand = new Graphics();
  groundStrip(sand, w, worldWidth, horizonY, h, "#ecdcae", { rim: "#fff0cf", seed: 88, specks: 90, speckLight: "#fbeec6", speckDark: "#d6c294" });
  L.ground.addChild(sand);

  // MID: a beach umbrella, a stacked stone cairn, and a softly glowing
  // meditation circle on the sand (beacon).
  L.mid.removeChildren();
  const mx = landmarkX(g);
  const s = Math.max(2.4, h / 240);
  const art = new Container();
  art.position.set(mx, horizonY + 14);
  art.scale.set(s);
  const scene = new Graphics();
  // meditation circle traced on the sand
  scene.ellipse(0, -2, 70, 22).stroke({ width: 4, color: "#caa46a", alpha: 0.8 });
  scene.ellipse(0, -2, 58, 18).stroke({ width: 2, color: "#fff0cf", alpha: 0.7 });
  // umbrella
  scene.moveTo(-46, -2).lineTo(-46, -64).stroke({ width: 4, color: "#6e4a2a" });
  scene.poly([-46, -78, -82, -56, -10, -56]).fill(hexNum(p.accent)).stroke({ width: 5, color: INK });
  scene.poly([-46, -78, -46, -56, -10, -56]).fill({ color: 0xffffff, alpha: 0.35 });
  scene.circle(-46, -78, 3).fill("#fff0cf").stroke({ width: 2, color: INK });
  // stacked meditation stones (cairn)
  const cx = 40;
  scene.ellipse(cx, -4, 18, 8).fill("#9a9088").stroke({ width: 3.5, color: INK });
  scene.ellipse(cx, -16, 14, 7).fill("#b6ac9c").stroke({ width: 3.5, color: INK });
  scene.ellipse(cx, -27, 10, 5.5).fill("#8f857a").stroke({ width: 3, color: INK });
  scene.ellipse(cx, -36, 6, 4).fill("#c2b8a6").stroke({ width: 3, color: INK });
  art.addChild(scene);
  L.mid.addChild(art);

  const glow = L.beaconGlow;
  L.mid.addChild(glow);
  const circleY = horizonY + 14 - 2 * s;
  const drawGlow = (t: number, prox: number) => {
    glow.clear();
    const pulse = 0.5 + 0.5 * Math.sin(t * 1.6); // slow, calming
    glow.ellipse(mx, circleY, (70 + prox * 26) * s * 0.5, (22 + prox * 10) * s * 0.5)
      .fill({ color: 0xbfe6ff, alpha: (0.12 + 0.18 * prox) * (0.6 + 0.4 * pulse) });
  };
  drawGlow(0, 0);
  return {
    worldWidth, spawnX: g.spawnX, exitX: g.exitX,
    beacon: { x: g.beaconX, y: circleY, r: 130 }, beaconMidX: mx, tint: 0xbfe6ff,
    animate: (t, prox) => { drawWaves(waves, farW, horizonY - 4, "#eafaff", t, 2, 5, 0.6); drawGlow(t, prox); },
  };
}

// ── Generic fallback (unused once all seven zones are bespoke) ──────

function generic(
  zone: ZoneKey, L: EnvLayers, w: number, h: number, p: ThemePalette, g: EnvGeom,
): ZoneEnv {
  const { worldWidth, horizonY } = g;
  paintSky(L.sky, w, h, p.skyTop, p.skyBottom);

  L.far.removeChildren();
  const far = new Graphics();
  far.rect(0, horizonY - 6, worldWidth * PARALLAX.far + w, h).fill(hexNum(shade(p.foliageShadow, -0.1)));
  treeLine(far, worldWidth * PARALLAX.far + w, horizonY + 8, hexNum(shade(p.foliageShadow, -0.25)), 64, 50, 100, 23);
  L.far.addChild(far);

  L.ground.removeChildren();
  const ground = new Graphics();
  const land = hexNum(shade(p.land, -0.08));
  ground.rect(0, horizonY, worldWidth + w, h - horizonY).fill(land);
  ground.rect(0, horizonY, worldWidth + w, 5).fill({ color: hexNum(shade(p.land, 0.2)), alpha: 0.6 });
  L.ground.addChild(ground);

  L.mid.removeChildren();
  const mx = landmarkX(g);
  const landmark = new Graphics();
  paintZoneStructure(landmark, zone, p);
  landmark.scale.set(Math.max(3, h / 200));
  landmark.position.set(mx, horizonY + 16);
  L.mid.addChild(landmark);
  const glow = L.beaconGlow;
  L.mid.addChild(glow);

  const beaconY = horizonY - 30;
  return {
    worldWidth,
    spawnX: g.spawnX,
    beacon: { x: g.beaconX, y: beaconY, r: 130 },
    beaconMidX: mx,
    tint: hexNum(p.accent),
    exitX: g.exitX,
    animate: (t, prox) => {
      glow.clear();
      const pulse = 0.5 + 0.5 * Math.sin(t * 4);
      glow.ellipse(mx, horizonY - 6, 60 + prox * 30, 30 + prox * 14)
        .fill({ color: hexNum(p.accent), alpha: (0.12 + 0.2 * prox) * (0.7 + 0.3 * pulse) });
    },
  };
}
