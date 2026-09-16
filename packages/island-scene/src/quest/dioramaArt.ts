import { Graphics } from "pixi.js";
import type { ChoiceId } from "./questTableModel";

/**
 * ============================================================
 * TEMPORARY STAND-IN ART — NOT PRODUCTION, NOT APPROVED
 * ============================================================
 *
 * Everything in this file is code-drawn scaffolding so EC-1 can prove the
 * COMPOSITION and the INTERACTION of the Quest Table before any art is
 * commissioned. It validates scale, staging and tap behaviour. It does not
 * validate visual quality and must not be mistaken for a design.
 *
 * Every painter here has a named production asset waiting for it in
 * ASSET-SPEC-S89.md. Dropping that art in replaces the call, not the layout.
 *
 * The register is the island's established cel style — bold #23201c ink, flat
 * fills, one lighter pass on the lit side, a grounding shadow — the same rules
 * treehouseDecorArt.ts follows, so the stand-in at least sits WITH the painted
 * room rather than on top of it.
 */

const INK = 0x23201c;

const P = {
  clearingGrass: 0x7fae4e,
  clearingEdge: 0x5d8a38,
  soil: 0xa9793f,
  stone: 0x9d9384,
  stoneLit: 0xc0b7a6,
  stoneDeep: 0x746b5e,
  cardFace: 0xfdf3e0,
} as const;

/**
 * The miniature clearing the story happens in: a shallow grass mound sitting
 * on the table top. Drawn as an ellipse with a soft rim so it reads as a
 * modelled piece of ground rather than a green sticker on the wood.
 *
 * PRODUCTION: one painted diorama base plate per scene state — see
 * ASSET-SPEC-S89.md "Quest Table / diorama".
 */
export function drawClearing(g: Graphics, rx: number, ry: number): void {
  // Contact shadow on the wood, so the diorama has weight.
  g.ellipse(0, ry * 0.5, rx * 1.02, ry * 1.15).fill({ color: 0x2a1a0c, alpha: 0.26 });
  // Soil rim.
  g.ellipse(0, 0, rx, ry).fill(P.soil).stroke({ width: Math.max(2, rx * 0.018), color: INK });
  // Grass cap, lifted slightly so the soil shows as a lip at the front.
  g.ellipse(0, -ry * 0.22, rx * 0.96, ry * 0.92).fill(P.clearingGrass);
  // Lit side, toward the room's own window light (upper left).
  g.ellipse(-rx * 0.24, -ry * 0.45, rx * 0.44, ry * 0.38)
    .fill({ color: 0xa3cc69, alpha: 0.55 });
  g.ellipse(0, -ry * 0.22, rx * 0.96, ry * 0.92)
    .stroke({ width: Math.max(1.5, rx * 0.012), color: P.clearingEdge, alpha: 0.7 });
}

/**
 * The group's stone-stacking game: a stack of `n` rounded stones with a couple
 * of spares beside it. The stack IS the round-in-progress — when it grows the
 * child can see the game carried on without them, which is the whole point of
 * the first beat.
 *
 * PRODUCTION: painted stack states, one per height.
 */
export function drawStoneStack(g: Graphics, n: number, unit: number): void {
  g.ellipse(0, 0, unit * 1.0, unit * 0.34).fill({ color: 0x2a1a0c, alpha: 0.22 });
  const count = Math.max(0, Math.min(5, n));
  for (let i = 0; i < count; i++) {
    const w = unit * (0.92 - i * 0.1);
    const h = unit * 0.36;
    const y = -i * h * 0.82;
    g.roundRect(-w / 2, y - h, w, h, h * 0.44)
      .fill(i % 2 ? P.stone : P.stoneLit)
      .stroke({ width: Math.max(1.4, unit * 0.045), color: INK });
    g.roundRect(-w * 0.32, y - h * 0.82, w * 0.4, h * 0.26, h * 0.13)
      .fill({ color: 0xffffff, alpha: 0.28 });
  }
  // Two spares waiting on the grass.
  g.ellipse(unit * 1.25, -unit * 0.1, unit * 0.3, unit * 0.2)
    .fill(P.stoneDeep).stroke({ width: Math.max(1.2, unit * 0.04), color: INK });
  g.ellipse(unit * 1.6, unit * 0.02, unit * 0.24, unit * 0.16)
    .fill(P.stone).stroke({ width: Math.max(1.2, unit * 0.04), color: INK });
}

/**
 * A back rank of undergrowth around the clearing's far edge.
 *
 * Without it the clearing reads as a flat green plate with figures stuck to
 * it. One row of overlapping bushes on the far arc is enough to say "this
 * ground has a far side", which is what turns the plate into a place.
 *
 * PRODUCTION: part of the painted diorama base plate.
 */
export function drawScrub(g: Graphics, rx: number, depth: number): void {
  const bushes = [-0.78, -0.55, -0.3, -0.05, 0.22, 0.48, 0.72];
  bushes.forEach((dx, i) => {
    const x = rx * dx;
    // Sit them on the far arc of the clearing ellipse.
    const y = -depth * Math.sqrt(Math.max(0, 1 - dx * dx)) * 0.82;
    const w = rx * (0.15 + (i % 3) * 0.035);
    const h = w * (0.78 + (i % 2) * 0.22);
    g.ellipse(x, y - h * 0.3, w, h * 0.62)
      .fill(i % 2 ? P.clearingEdge : 0x4f7a32)
      .stroke({ width: Math.max(1.2, rx * 0.011), color: INK, alpha: 0.75 });
    g.ellipse(x - w * 0.28, y - h * 0.52, w * 0.4, h * 0.26)
      .fill({ color: 0x8dbd5c, alpha: 0.6 });
  });
}

/**
 * Illustrated face for a choice card.
 *
 * These carry the MEANING of the choice, with the label secondary — a five
 * year old with the sound off, or with no voice file recorded yet, must still
 * be able to tell the two cards apart. That requirement is the reason these
 * are pictures and not a list of sentences, and it survives into production.
 *
 * PRODUCTION: one painted illustration per choice per band — see
 * ASSET-SPEC-S89.md "Illustrated choices".
 */
export function drawChoiceArt(g: Graphics, id: ChoiceId, size: number): void {
  const u = size / 100;
  if (id === "walk-over") {
    // A path of footsteps curving toward a small group shape.
    for (let i = 0; i < 4; i++) {
      const x = (-32 + i * 19) * u;
      const y = (16 - i * 7) * u;
      g.ellipse(x, y, 5.2 * u, 3.4 * u)
        .fill(0x8a6a44)
        .stroke({ width: 1.4 * u, color: INK, alpha: 0.7 });
    }
    // The group, as three small rounded backs.
    for (const [dx, s] of [[30, 1], [40, 0.86], [35, 0.72]] as const) {
      g.circle(dx * u, -14 * u, 8 * s * u)
        .fill(P.stone)
        .stroke({ width: 1.6 * u, color: INK });
    }
    return;
  }
  // Wave: a raised arm + three motion arcs, and one of the group turning.
  g.circle(-18 * u, -6 * u, 13 * u).fill(0xd8b07a).stroke({ width: 2 * u, color: INK });
  g.roundRect(-12 * u, -30 * u, 7 * u, 22 * u, 3.5 * u)
    .fill(0xd8b07a)
    .stroke({ width: 2 * u, color: INK });
  for (let i = 0; i < 3; i++) {
    const r = (16 + i * 8) * u;
    g.arc(-2 * u, -30 * u, r, -1.15, -0.15).stroke({ width: 2.2 * u, color: 0x6fae52, alpha: 0.9 - i * 0.22 });
  }
  g.circle(30 * u, -4 * u, 11 * u).fill(P.stone).stroke({ width: 2 * u, color: INK });
  // Two eyes, so this one is visibly LOOKING BACK — the difference between
  // the two cards has to be readable at card size, not just describable.
  g.circle(26 * u, -6 * u, 2.1 * u).fill(INK);
  g.circle(34 * u, -6 * u, 2.1 * u).fill(INK);
}

/**
 * The wooden tray that hangs off the table's near rim and carries the choices.
 *
 * Drawn as a shallow open box seen from slightly above — a lip at the front, a
 * darker well behind it — so the cards visibly sit IN something attached to the
 * table rather than floating in front of it.
 *
 * PRODUCTION: part of the painted Quest Table dressing.
 */
export function drawTray(g: Graphics, w: number, h: number): void {
  const r = Math.min(16, h * 0.16);
  // Shadow under the rim, so the tray reads as hanging off the table.
  g.roundRect(-w / 2 + 6, -h / 2 + 8, w - 12, h, r).fill({ color: 0x2a1a0c, alpha: 0.28 });
  // The tray body.
  g.roundRect(-w / 2, -h / 2, w, h, r)
    .fill(0x8a5a2e)
    .stroke({ width: Math.max(3, h * 0.035), color: INK });
  // Recessed well.
  g.roundRect(-w / 2 + h * 0.07, -h / 2 + h * 0.07, w - h * 0.14, h - h * 0.14, r * 0.8)
    .fill(0x6e4a2a);
  // Lit top edge, matching the room's own light.
  g.roundRect(-w / 2 + h * 0.07, -h / 2 + h * 0.06, w - h * 0.14, h * 0.1, r * 0.4)
    .fill({ color: 0xc08c52, alpha: 0.55 });
  // Two small feet where it meets the table's rim.
  for (const sx of [-0.3, 0.3]) {
    g.roundRect(sx * w - h * 0.06, -h / 2 - h * 0.1, h * 0.12, h * 0.12, h * 0.04)
      .fill(0x6e4a2a)
      .stroke({ width: Math.max(2, h * 0.025), color: INK });
  }
}

/**
 * The "someone looked up" mark: three short rays above a character's head.
 *
 * Needed because the group are front-facing portraits with no turn pose, so
 * mirroring one is nearly invisible — a near-symmetric sprite flipped is not
 * evidence of attention. The mark, plus the step forward and the size bump
 * QuestTable applies, is what actually reads at miniature size.
 *
 * PRODUCTION: a painted turn/look-up pose for the responding character makes
 * this redundant.
 */
export function drawNoticeMark(g: Graphics, size: number): void {
  const w = Math.max(1.6, size * 0.13);
  for (const a of [-1.15, -0.62, -0.09]) {
    const x0 = Math.cos(a) * size * 0.42;
    const y0 = Math.sin(a) * size * 0.42;
    g.moveTo(x0, y0)
      .lineTo(Math.cos(a) * size, Math.sin(a) * size)
      .stroke({ width: w, color: 0xe8a33d });
    g.moveTo(x0, y0)
      .lineTo(Math.cos(a) * size, Math.sin(a) * size)
      .stroke({ width: w * 0.42, color: 0xfff1c4 });
  }
}

/** A small painted-looking card back, used behind every choice illustration. */
export function drawCardFace(g: Graphics, w: number, h: number, lifted: boolean): void {
  const r = Math.min(18, h * 0.18);
  if (lifted) {
    g.roundRect(-w / 2 + 3, -h / 2 + 7, w, h, r).fill({ color: 0x2a1a0c, alpha: 0.3 });
  }
  g.roundRect(-w / 2, -h / 2, w, h, r)
    .fill(lifted ? 0xfffaf0 : P.cardFace)
    .stroke({ width: lifted ? 5 : 4, color: INK });
  // Lit top edge, matching the room's own light direction.
  g.roundRect(-w / 2 + 5, -h / 2 + 5, w - 10, h * 0.26, r * 0.7)
    .fill({ color: 0xffffff, alpha: 0.55 });
  if (lifted) {
    g.roundRect(-w / 2 - 3, -h / 2 - 3, w + 6, h + 6, r + 3)
      .stroke({ width: 4, color: 0xe8a33d });
  }
}
