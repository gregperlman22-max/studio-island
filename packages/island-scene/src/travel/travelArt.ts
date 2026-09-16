import { Graphics } from "pixi.js";

/**
 * ============================================================
 * TEMPORARY STAND-IN ART — NOT PRODUCTION, NOT APPROVED
 * ============================================================
 *
 * The hollow log the optional discovery lives in, and the fireflies that come
 * out of it. Code-drawn because the shipped sprite library has nothing that
 * reads as a hollow log: the first attempt tinted `rock-01` brown and it read
 * as a mud bank, which is fatal for a discovery a child is supposed to NOTICE.
 *
 * PRODUCTION: one painted hollow log, cel register to match the forest kit it
 * stands among (src/assets/sprites/*.webp).
 */

const INK = 0x23201c;

/** A fallen hollow log, `px` tall at its widest, standing on (0, 0). */
export function drawHollowLog(g: Graphics, px: number): void {
  const w = px * 2.3;
  const h = px;
  const r = h * 0.5;
  // Contact shadow.
  g.ellipse(0, 0, w * 0.5, h * 0.18).fill({ color: 0x2a1a0c, alpha: 0.26 });
  // The trunk, lying on its side.
  g.roundRect(-w / 2, -h, w, h, r)
    .fill(0x8a5f36)
    .stroke({ width: Math.max(2.5, px * 0.05), color: INK });
  // Bark grain along the top.
  for (const f of [-0.22, 0.04, 0.3]) {
    g.roundRect(-w * 0.36, -h + h * 0.2 + f * h * 0.5, w * 0.72, h * 0.07, h * 0.03)
      .fill({ color: 0x6e4a2a, alpha: 0.7 });
  }
  // The hollow end, facing the path — the thing that makes it a HOLLOW log.
  g.ellipse(-w * 0.44, -h * 0.5, h * 0.3, h * 0.42)
    .fill(0xb98a55)
    .stroke({ width: Math.max(2, px * 0.04), color: INK });
  g.ellipse(-w * 0.44, -h * 0.5, h * 0.18, h * 0.28).fill(0x2e1d0d);
  // A warm glimmer inside, so it reads as worth a look rather than as scenery.
  g.ellipse(-w * 0.44, -h * 0.5, h * 0.11, h * 0.17).fill({ color: 0xffe9a8, alpha: 0.75 });
  // A little moss, tying it to the forest floor.
  g.ellipse(w * 0.2, -h * 0.94, w * 0.16, h * 0.13).fill({ color: 0x6f9a4c, alpha: 0.9 });
}

/** The fireflies that lift out of the log and travel on with the child. */
export function drawFireflies(g: Graphics, w: number, h: number, t: number): void {
  for (let i = 0; i < 9; i++) {
    const ph = i * 2.1;
    const x = w * (0.6 + 0.12 * Math.sin(t * 0.7 + ph)) + (i % 3) * 14;
    const y = h * (0.55 + 0.08 * Math.cos(t * 0.9 + ph * 1.3)) + (i % 4) * 11;
    const a = 0.45 + 0.4 * (0.5 + 0.5 * Math.sin(t * 2.4 + ph));
    g.circle(x, y, 9).fill({ color: 0xfff3b0, alpha: a * 0.22 });
    g.circle(x, y, 3).fill({ color: 0xfff7cf, alpha: a });
  }
}
