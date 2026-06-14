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

  const env: ZoneEnv =
    zone === "campfire_circle"
      ? campfire(L, w, h, p, { worldWidth, spawnX, beaconX, exitX, horizonY, anchorX })
      : generic(zone, L, w, h, p, { worldWidth, spawnX, beaconX, exitX, horizonY, anchorX });
  return env;
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

// ── Generic fallback (M2 replaces each zone) ───────────────────────

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
    exitX: g.exitX,
    animate: (t, prox) => {
      glow.clear();
      const pulse = 0.5 + 0.5 * Math.sin(t * 4);
      glow.ellipse(mx, horizonY - 6, 60 + prox * 30, 30 + prox * 14)
        .fill({ color: hexNum(p.accent), alpha: (0.12 + 0.2 * prox) * (0.7 + 0.3 * pulse) });
    },
  };
}
