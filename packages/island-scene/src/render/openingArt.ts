/**
 * The boat opening (approved direction, 2026-09-24): one painted environment
 * plate with the sun-marked Welcome Dock baked in, a separate wooden sailboat
 * split into back/front layers, Captain Pete, and the child's own selected
 * Friend — the last three riding in ONE transform with the boat.
 *
 * Sources: tools/island-art/source/boat-opening-2026-09-24/ (retained, never
 * shipped). Runtime files are written by tools/island-art/boat-opening-layers
 * .mjs, which verifies that the saved front-over-back pair reproduces the boat
 * master exactly before replacing them.
 *
 * Units: STAGE px are environment-plate pixels (1671 x 941). BOAT px are pixels
 * of the untrimmed 1254 boat canvas that both layers share; the passengers are
 * placed in boat px, so they move, scale and rock with the hull.
 */
const openingUrl = (name: string): string =>
  new URL(`../assets/opening/${name}.webp`, import.meta.url).href;

export const OPENING_ART = {
  environmentUrl: openingUrl("opening-environment"),
  boatBackUrl: openingUrl("boat-back"),
  boatFrontUrl: openingUrl("boat-front"),
  captainUrl: openingUrl("captain-pete"),

  stage: { w: 1671, h: 941 },

  /**
   * Boat canvas placement in stage px: top-left (x, y) and scale s. The
   * approach eases out from `from` to `to` (decelerating into the berth), the
   * approved composition's start and settled frames.
   */
  from: { x: 10, y: 210, s: 0.585 },
  to: { x: 210, y: 260, s: 0.5 },
  /** Rocking pivot, boat px — on the keel under the mast. */
  pivot: { x: 620, y: 1100 },

  /**
   * Captain Pete: the study's own foot point (image px 670, 1290) pinned at
   * boat px (275, 1090), drawn at 0.32 — the approved preview's placement.
   * Standing at the stern, behind the near rail's stern cleat post.
   */
  captain: { anchorX: 670 / 1145, anchorY: 1290 / 1374, x: 275, y: 1090, scale: 0.32 },

  /**
   * The selected Friend amidships, left of the mast: content-anchored (true
   * feet / centre from the texture's measured bounds) at boat px (618, 1080),
   * scaled so the visible body is 387 boat px tall — the height the reference
   * Doug had in the approved preview. The near hull covers the lower ~fifth.
   */
  friend: { x: 618, y: 1080, contentHeight: 387 },

  /**
   * Framing, stage px. At the berth the essential action — stern, both
   * passengers, bow and the dock's landing edge — spans x 245..885; the camera
   * never shows less than `essentialW` across, and it follows the boat so the
   * same framing holds through the approach.
   */
  essential: { left: 245, right: 885 },
  essentialW: 640,
} as const;
