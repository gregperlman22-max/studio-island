import { Graphics } from "pixi.js";
import type { DecorId } from "./treehouseModel";

/**
 * Illustrated art for the Treehouse room's decorations and leaf puzzle.
 *
 * These replace the platform emoji that stood in before the painted room
 * shipped. Emoji render in the host OS's own style — flat, glossy, and
 * unmistakably not from this world — which looked cheap sitting on a warm
 * storybook painting.
 *
 * Everything here is drawn in the island's established cel register, the same
 * one zones.ts uses for the landmarks: a bold #23201c ink outline, flat fills,
 * a soft lighter pass on the lit side, and a grounding shadow. That is what
 * makes a code-drawn object read as belonging with painted art rather than
 * floating on top of it.
 *
 * Each painter draws into a box of `size` px centred on (0, 0), so the same
 * call serves the picker tile and the decoration placed in the room.
 */

const INK = 0x23201c;

/** Warm palette sampled to sit with the room's honey wood and green foliage. */
const PALETTE = {
  lanternPaper: 0xf2a03c,
  lanternPaperLit: 0xffcf7a,
  lanternGlow: 0xffd98a,
  lanternCap: 0x6e4a2a,
  pot: 0xc2703c,
  potLit: 0xdb9463,
  leaf: 0x5f9e46,
  leafLit: 0x86c465,
  leafDeep: 0x3f7530,
  cushion: 0x4f8f7a,
  cushionLit: 0x74b49c,
  cord: 0xb08a52,
  pennantA: 0x6fae52,
  pennantB: 0xe0a13f,
} as const;

/** Soft contact shadow so an object sits ON something rather than hovering. */
function groundShadow(g: Graphics, w: number, y: number): void {
  g.ellipse(0, y, w * 0.42, w * 0.12).fill({ color: 0x2a1a0c, alpha: 0.22 });
}

// ── Decorations ─────────────────────────────────────────────────────

function lantern(g: Graphics, s: number): void {
  const bodyW = s * 0.46;
  const bodyH = s * 0.5;
  // Warm halo first, so the paper glows into the room behind it.
  g.circle(0, s * 0.02, s * 0.46).fill({ color: PALETTE.lanternGlow, alpha: 0.16 });
  g.circle(0, s * 0.02, s * 0.32).fill({ color: PALETTE.lanternGlow, alpha: 0.16 });
  // Hanger.
  g.moveTo(0, -s * 0.5).lineTo(0, -s * 0.28).stroke({ width: Math.max(2, s * 0.035), color: PALETTE.lanternCap });
  g.roundRect(-s * 0.1, -s * 0.3, s * 0.2, s * 0.07, s * 0.02)
    .fill(PALETTE.lanternCap).stroke({ width: Math.max(2, s * 0.03), color: INK });
  // Paper body — a soft barrel, not a circle.
  g.ellipse(0, s * 0.02, bodyW / 2, bodyH / 2)
    .fill(PALETTE.lanternPaper).stroke({ width: Math.max(2.5, s * 0.042), color: INK });
  // Lit side.
  g.ellipse(-bodyW * 0.12, s * 0.0, bodyW * 0.26, bodyH * 0.3)
    .fill({ color: PALETTE.lanternPaperLit, alpha: 0.85 });
  // Ribs.
  for (const f of [-0.5, 0, 0.5]) {
    g.ellipse(0, s * 0.02 + f * bodyH * 0.3, bodyW / 2 * (1 - Math.abs(f) * 0.35), s * 0.012)
      .fill({ color: 0xb9702a, alpha: 0.5 });
  }
  // Base cap + tassel.
  g.roundRect(-s * 0.08, s * 0.26, s * 0.16, s * 0.06, s * 0.02)
    .fill(PALETTE.lanternCap).stroke({ width: Math.max(2, s * 0.03), color: INK });
  g.moveTo(0, s * 0.32).lineTo(0, s * 0.44).stroke({ width: Math.max(2, s * 0.03), color: 0xd8b24a });
}

function plant(g: Graphics, s: number): void {
  groundShadow(g, s, s * 0.44);
  // Leaves fan out behind the pot.
  const blades: [number, number, number][] = [
    [-0.62, 0.9, -0.2], [-0.28, 1.12, -0.08], [0.05, 1.18, 0.02],
    [0.36, 1.06, 0.12], [0.64, 0.86, 0.22],
  ];
  for (const [lean, len, curl] of blades) {
    const tipX = lean * s * 0.34;
    const tipY = -s * 0.16 - len * s * 0.28;
    const midX = (tipX + curl * s * 0.3) * 0.55;
    const midY = (tipY + s * 0.04) * 0.6;
    g.moveTo(0, s * 0.06)
      .quadraticCurveTo(midX - s * 0.1, midY, tipX, tipY)
      .quadraticCurveTo(midX + s * 0.12, midY + s * 0.05, 0, s * 0.06)
      .fill(lean < 0 ? PALETTE.leafDeep : PALETTE.leaf)
      .stroke({ width: Math.max(2, s * 0.032), color: INK });
  }
  // Terracotta pot: tapered body + rim.
  g.poly([
    -s * 0.24, s * 0.04, s * 0.24, s * 0.04, s * 0.18, s * 0.4, -s * 0.18, s * 0.4,
  ]).fill(PALETTE.pot).stroke({ width: Math.max(2.5, s * 0.04), color: INK });
  g.poly([-s * 0.2, s * 0.08, -s * 0.08, s * 0.08, -s * 0.12, s * 0.36, -s * 0.16, s * 0.36])
    .fill({ color: PALETTE.potLit, alpha: 0.55 });
  g.roundRect(-s * 0.28, -s * 0.02, s * 0.56, s * 0.12, s * 0.03)
    .fill(PALETTE.pot).stroke({ width: Math.max(2.5, s * 0.04), color: INK });
  g.roundRect(-s * 0.25, s * 0.005, s * 0.5, s * 0.04, s * 0.02)
    .fill({ color: PALETTE.potLit, alpha: 0.5 });
}

function cushion(g: Graphics, s: number): void {
  groundShadow(g, s * 1.04, s * 0.3);
  // A plump floor pouffe: wide squashed body with a pinched centre.
  g.ellipse(0, s * 0.06, s * 0.42, s * 0.27)
    .fill(PALETTE.cushion).stroke({ width: Math.max(2.5, s * 0.042), color: INK });
  // Lit crown.
  g.ellipse(-s * 0.06, s * 0.0, s * 0.26, s * 0.13)
    .fill({ color: PALETTE.cushionLit, alpha: 0.75 });
  // Radial seams gathered to the button.
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    g.moveTo(0, s * 0.06)
      .quadraticCurveTo(
        Math.cos(a) * s * 0.22, s * 0.06 + Math.sin(a) * s * 0.14,
        Math.cos(a) * s * 0.4, s * 0.06 + Math.sin(a) * s * 0.25,
      )
      .stroke({ width: Math.max(1.5, s * 0.022), color: 0x2f6b5c, alpha: 0.55 });
  }
  // Centre button.
  g.circle(0, s * 0.06, s * 0.055)
    .fill(0xe8c46b).stroke({ width: Math.max(2, s * 0.03), color: INK });
}

function garland(g: Graphics, s: number): void {
  const span = s * 1.02;
  const sag = s * 0.22;
  // The cord, drawn as a swag.
  g.moveTo(-span / 2, -s * 0.2)
    .quadraticCurveTo(0, -s * 0.2 + sag * 2, span / 2, -s * 0.2)
    .stroke({ width: Math.max(2, s * 0.032), color: PALETTE.cord });
  // Alternating leaf pennants hanging off it.
  const n = 4;
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const x = -span / 2 + t * span;
    // point on the quadratic swag
    const y = -s * 0.2 + 2 * sag * t * (1 - t) * 2;
    const lean = (t - 0.5) * 0.5;
    const c = i % 2 ? PALETTE.pennantB : PALETTE.pennantA;
    g.moveTo(x, y)
      .quadraticCurveTo(x - s * 0.13 + lean * s * 0.1, y + s * 0.16, x + lean * s * 0.08, y + s * 0.36)
      .quadraticCurveTo(x + s * 0.13 + lean * s * 0.1, y + s * 0.16, x, y)
      .fill(c)
      .stroke({ width: Math.max(1.8, s * 0.028), color: INK });
    g.moveTo(x, y + s * 0.02).lineTo(x + lean * s * 0.05, y + s * 0.22)
      .stroke({ width: Math.max(1, s * 0.014), color: INK, alpha: 0.45 });
  }
}

const DECOR_PAINTERS: Record<DecorId, (g: Graphics, s: number) => void> = {
  lantern,
  plant,
  cushion,
  garland,
};

/** Draw a decoration centred on (0,0) inside a `size` px box. */
export function drawDecor(id: DecorId, g: Graphics, size: number): void {
  DECOR_PAINTERS[id](g, size);
}

// ── Leaf puzzle ─────────────────────────────────────────────────────

export interface LeafPaint {
  /** Blade length in px (the leaf's long axis). */
  size: number;
  /** Tilt in radians, so a row of leaves doesn't read as clip art. */
  tilt: number;
  /** Solved leaves warm up and gain a glow. */
  solved: boolean;
  /** Horizontal nudge used by the gentle wrong-tap wobble. */
  offsetX: number;
}

/**
 * One puzzle leaf: a real leaf silhouette (rounded shoulders, drawn tip) with
 * a midrib, side veins, a lighter lit half and an ink outline — the same
 * register as the island's landmark art, so it sits with the painting instead
 * of looking like a UI glyph.
 */
export function drawLeaf(g: Graphics, cx: number, cy: number, p: LeafPaint): void {
  const { size: L, tilt, solved, offsetX } = p;
  const halfW = L * 0.34;
  const x = cx + offsetX;
  const sin = Math.sin(tilt);
  const cos = Math.cos(tilt);
  // Rotate a local (u, v) — u across the blade, v along it — into screen space.
  const pt = (u: number, v: number): [number, number] => [
    x + u * cos - v * sin,
    cy + u * sin + v * cos,
  ];

  const tip = pt(0, -L / 2);
  const base = pt(0, L / 2);
  const stem = pt(0, L / 2 + L * 0.16);
  const leftMid = pt(-halfW, 0);
  const rightMid = pt(halfW, 0);
  const leftUp = pt(-halfW * 0.95, -L * 0.22);
  const rightUp = pt(halfW * 0.95, -L * 0.22);
  const leftLow = pt(-halfW * 0.72, L * 0.26);
  const rightLow = pt(halfW * 0.72, L * 0.26);

  // Contact shadow under the blade.
  g.ellipse(x, cy + L * 0.46, halfW * 1.05, L * 0.07)
    .fill({ color: 0x2a1a0c, alpha: solved ? 0.1 : 0.18 });

  if (solved) {
    g.ellipse(x, cy, halfW * 1.7, L * 0.62).fill({ color: 0xffe9a8, alpha: 0.22 });
  }

  // Stem.
  g.moveTo(base[0], base[1]).lineTo(stem[0], stem[1])
    .stroke({ width: Math.max(2, L * 0.045), color: 0x6e4a2a });

  // Blade: tip → right shoulder → base → left shoulder → tip.
  g.moveTo(tip[0], tip[1])
    .bezierCurveTo(rightUp[0], rightUp[1], rightMid[0], rightMid[1], rightLow[0], rightLow[1])
    .quadraticCurveTo(base[0], base[1], base[0], base[1])
    .quadraticCurveTo(leftLow[0], leftLow[1], leftMid[0], leftMid[1])
    .bezierCurveTo(leftMid[0], leftMid[1], leftUp[0], leftUp[1], tip[0], tip[1])
    .fill(solved ? PALETTE.leafLit : PALETTE.leaf)
    .stroke({ width: Math.max(2.5, L * 0.055), color: INK });

  // Lit half, hugging the midrib on the light side.
  const litA = pt(0, -L * 0.42);
  const litB = pt(-halfW * 0.62, 0);
  const litC = pt(0, L * 0.3);
  g.moveTo(litA[0], litA[1])
    .quadraticCurveTo(litB[0], litB[1], litC[0], litC[1])
    .quadraticCurveTo(pt(-halfW * 0.1, 0)[0], pt(-halfW * 0.1, 0)[1], litA[0], litA[1])
    .fill({ color: solved ? 0xc8e8a8 : PALETTE.leafLit, alpha: 0.55 });

  // Midrib + side veins.
  g.moveTo(tip[0], tip[1]).lineTo(base[0], base[1])
    .stroke({ width: Math.max(1.5, L * 0.028), color: PALETTE.leafDeep, alpha: 0.75 });
  for (const v of [-0.22, 0.02, 0.24]) {
    const from = pt(0, v * L);
    const toL = pt(-halfW * 0.68, v * L - L * 0.14);
    const toR = pt(halfW * 0.68, v * L - L * 0.14);
    g.moveTo(from[0], from[1]).quadraticCurveTo(pt(-halfW * 0.3, v * L - L * 0.04)[0], pt(-halfW * 0.3, v * L - L * 0.04)[1], toL[0], toL[1])
      .stroke({ width: Math.max(1, L * 0.02), color: PALETTE.leafDeep, alpha: 0.5 });
    g.moveTo(from[0], from[1]).quadraticCurveTo(pt(halfW * 0.3, v * L - L * 0.04)[0], pt(halfW * 0.3, v * L - L * 0.04)[1], toR[0], toR[1])
      .stroke({ width: Math.max(1, L * 0.02), color: PALETTE.leafDeep, alpha: 0.5 });
  }
}

/** The warm tick shown on a solved leaf. */
export function drawLeafTick(g: Graphics, cx: number, cy: number, r: number): void {
  g.circle(cx, cy, r).fill(0xf6e2a8).stroke({ width: Math.max(2, r * 0.22), color: INK });
  g.moveTo(cx - r * 0.42, cy)
    .lineTo(cx - r * 0.1, cy + r * 0.36)
    .lineTo(cx + r * 0.46, cy - r * 0.38)
    .stroke({ width: Math.max(2.5, r * 0.26), color: 0x3f7530 });
}

// ── Hotspot glyphs ──────────────────────────────────────────────────

/**
 * The little illustrated mark on each of the three room buttons. Drawn in the
 * same cel register as everything else so the buttons read as part of this
 * world — the previous platform emoji rendered in the host OS's style and
 * clashed with the painting.
 */
export function drawHotspotIcon(
  id: "decorate" | "puzzle" | "story",
  g: Graphics,
  size: number,
): void {
  const s = size;
  if (id === "decorate") {
    // A small hanging lantern — the room's own signature warm object.
    g.circle(0, 0, s * 0.46).fill({ color: PALETTE.lanternGlow, alpha: 0.22 });
    g.moveTo(0, -s * 0.46).lineTo(0, -s * 0.3)
      .stroke({ width: Math.max(1.6, s * 0.07), color: PALETTE.lanternCap });
    g.ellipse(0, 0, s * 0.26, s * 0.3)
      .fill(PALETTE.lanternPaper).stroke({ width: Math.max(2, s * 0.085), color: INK });
    g.ellipse(-s * 0.07, -s * 0.05, s * 0.1, s * 0.12)
      .fill({ color: PALETTE.lanternPaperLit, alpha: 0.9 });
    return;
  }
  if (id === "puzzle") {
    drawLeaf(g, 0, 0, { size: s * 0.92, tilt: -0.22, solved: false, offsetX: 0 });
    return;
  }
  // Story: an open book with two warm pages.
  const w = s * 0.46;
  const h = s * 0.32;
  g.moveTo(-w, -h * 0.55)
    .quadraticCurveTo(-w * 0.45, -h * 0.9, 0, -h * 0.5)
    .lineTo(0, h * 0.7)
    .quadraticCurveTo(-w * 0.45, h * 0.35, -w, h * 0.5)
    .fill(0xfdf3e0).stroke({ width: Math.max(2, s * 0.075), color: INK });
  g.moveTo(w, -h * 0.55)
    .quadraticCurveTo(w * 0.45, -h * 0.9, 0, -h * 0.5)
    .lineTo(0, h * 0.7)
    .quadraticCurveTo(w * 0.45, h * 0.35, w, h * 0.5)
    .fill(0xf3e3c4).stroke({ width: Math.max(2, s * 0.075), color: INK });
  // A couple of text lines so it reads as a book, not a folded card.
  for (const f of [-0.18, 0.1]) {
    g.moveTo(-w * 0.72, h * f).lineTo(-w * 0.2, h * f - h * 0.08)
      .stroke({ width: Math.max(1, s * 0.035), color: 0x9a8568, alpha: 0.7 });
  }
}
