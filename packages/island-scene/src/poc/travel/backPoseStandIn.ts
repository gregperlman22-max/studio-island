import { Container, Graphics } from "pixi.js";

/**
 * POC — a deliberately CRUDE back-view stand-in for Ollie.
 *
 * This is not character art and must never become any. It exists for one
 * comparison: does a character seen from BEHIND read better walking away down
 * a receding path than the approved front-facing portrait does? The answer
 * decides whether six travel poses are a prerequisite for production or a
 * follow-up, and that is worth knowing before anyone paints one.
 *
 * Drawn from Ollie's own palette (sampled by eye from the approved sprite) in
 * flat shapes, at the same world height the real sprite uses, so the only
 * variable under test is the POSE — not the size, the colour or the anchor.
 *
 * Origin is the FEET, matching buildImageAvatarSprite's content-bounds anchor.
 */

const FUR = 0x9c6a3f;
const FUR_DARK = 0x7a4f2c;
const FUR_LIGHT = 0xb9834f;
const PACK = 0x4f6f4a;
const PACK_DARK = 0x3b5537;
const INK = 0x23201c;

/** A back-view otter at `h` pixels tall, feet at (0, 0). */
export function buildBackPoseStandIn(h: number): Container {
  const c = new Container();
  const g = new Graphics();
  const u = h / 100; // everything below is in percent-of-height units

  // Tail, hanging behind and to one side.
  g.ellipse(13 * u, -12 * u, 6 * u, 15 * u)
    .fill(FUR_DARK)
    .stroke({ width: 1.6 * u, color: INK, alpha: 0.55 });

  // Feet.
  g.ellipse(-9 * u, -3 * u, 6 * u, 4 * u).fill(FUR_DARK);
  g.ellipse(9 * u, -3 * u, 6 * u, 4 * u).fill(FUR_DARK);

  // Body seen from behind: a broad rounded back, widest at the hips.
  g.roundRect(-19 * u, -58 * u, 38 * u, 56 * u, 17 * u)
    .fill(FUR)
    .stroke({ width: 1.8 * u, color: INK, alpha: 0.5 });
  // Lighter spine highlight, so the form isn't a flat slab.
  g.ellipse(0, -34 * u, 9 * u, 20 * u).fill({ color: FUR_LIGHT, alpha: 0.45 });

  // Backpack — the one piece of Ollie's silhouette a child would recognise
  // from behind, and the reason a back pose can still read as "my friend".
  g.roundRect(-14 * u, -52 * u, 28 * u, 30 * u, 8 * u)
    .fill(PACK)
    .stroke({ width: 1.8 * u, color: INK, alpha: 0.5 });
  g.roundRect(-10 * u, -46 * u, 20 * u, 9 * u, 4 * u).fill(PACK_DARK);

  // Head: a rounded skull with two small ears, no face.
  g.circle(0, -72 * u, 16 * u)
    .fill(FUR)
    .stroke({ width: 1.8 * u, color: INK, alpha: 0.5 });
  g.circle(-13 * u, -84 * u, 6 * u).fill(FUR_DARK);
  g.circle(13 * u, -84 * u, 6 * u).fill(FUR_DARK);
  g.ellipse(0, -78 * u, 8 * u, 6 * u).fill({ color: FUR_LIGHT, alpha: 0.4 });

  c.addChild(g);
  return c;
}
