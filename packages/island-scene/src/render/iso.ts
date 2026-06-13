import { TILE_W, TILE_H } from "./constants";
import type { GridPosition } from "../types";

/**
 * Isometric projection + small color helpers shared by every renderer.
 * Pure math — no Pixi imports — so it stays trivially testable.
 */

/** Top vertex (in world pixels) of the diamond for grid cell (gx, gy). */
export function tileToScreen(gx: number, gy: number): { x: number; y: number } {
  return {
    x: (gx - gy) * (TILE_W / 2),
    y: (gx + gy) * (TILE_H / 2),
  };
}

/** Center of a cell's top face — where decorations/avatars are anchored. */
export function tileCenter(gx: number, gy: number): { x: number; y: number } {
  const top = tileToScreen(gx, gy);
  return { x: top.x, y: top.y + TILE_H / 2 };
}

/**
 * Inverse of tileCenter: world-space point -> nearest grid cell. Caller should
 * convert the pointer's global position into world-local space first (e.g.
 * via Pixi `container.toLocal`) so camera scale/offset are accounted for.
 */
export function screenToTile(wx: number, wy: number): { x: number; y: number } {
  const hw = TILE_W / 2;
  const hh = TILE_H / 2;
  const a = wx / hw; // gx - gy
  const b = (wy - hh) / hh; // gx + gy
  return { x: Math.round((b + a) / 2), y: Math.round((b - a) / 2) };
}

/** Center of a footprint region (zone), in world pixels. */
export function footprintCenter(
  pos: GridPosition,
  w: number,
  h: number,
): { x: number; y: number } {
  return tileCenter(pos.x + (w - 1) / 2, pos.y + (h - 1) / 2);
}

/** Painter's-depth key: cells further down-screen draw on top. */
export function depth(gx: number, gy: number): number {
  return gx + gy;
}

/** The four diamond corners for a cell, as a flat point array for Graphics.poly. */
export function diamondPoly(gx: number, gy: number): number[] {
  const { x, y } = tileToScreen(gx, gy);
  return [
    x, y, // top
    x + TILE_W / 2, y + TILE_H / 2, // right
    x, y + TILE_H, // bottom
    x - TILE_W / 2, y + TILE_H / 2, // left
  ];
}

// ── Color helpers ─────────────────────────────────────────────────

function clamp8(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)));
}

/** "#rrggbb" -> { r, g, b }. */
export function parseHex(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace("#", "");
  const v =
    h.length === 3
      ? h.split("").map((c) => c + c).join("")
      : h.padEnd(6, "0").slice(0, 6);
  const n = parseInt(v, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

/** Pack { r, g, b } into a 0xRRGGBB number for Pixi fills. */
export function toNum(c: { r: number; g: number; b: number }): number {
  return (clamp8(c.r) << 16) | (clamp8(c.g) << 8) | clamp8(c.b);
}

/** Parse a hex string straight to a Pixi color number. */
export function hexNum(hex: string): number {
  return toNum(parseHex(hex));
}

/**
 * Shade a color: amt < 0 darkens toward black, amt > 0 lightens toward white.
 * amt is roughly the blend fraction in [-1, 1].
 */
export function shade(hex: string, amt: number): number {
  const { r, g, b } = parseHex(hex);
  const t = Math.abs(amt);
  const target = amt < 0 ? 0 : 255;
  return toNum({
    r: r + (target - r) * t,
    g: g + (target - g) * t,
    b: b + (target - b) * t,
  });
}

/** Linear blend between two hex colors -> Pixi color number. */
export function lerpHex(a: string, b: string, t: number): number {
  const ca = parseHex(a);
  const cb = parseHex(b);
  return toNum({
    r: ca.r + (cb.r - ca.r) * t,
    g: ca.g + (cb.g - ca.g) * t,
    b: ca.b + (cb.b - ca.b) * t,
  });
}
