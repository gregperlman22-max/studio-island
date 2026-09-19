import { Container, Graphics, Sprite, type Texture } from "pixi.js";
import type { ThemePackConfig, ThemePalette, ZoneInstance, ZoneKey } from "../types";
import { hexNum, shade } from "./iso";
import { buildLandmarkFx } from "./landmarkFx";

/**
 * Per-zone landmark art. The WORLD-MAP landmark (Mode 1) is now a finished
 * illustrated PNG (tools/island-art/landmarks/, cleaned in M1) placed as a
 * base-pinned sprite over the painted terrain. The cel-shaded programmatic
 * painters below (ZONE_PAINT / paintZoneStructure) are retained because the
 * Mode-2 zone interiors (zoneEnv.ts) still draw with them.
 *
 * Local origin (0,0) is the footprint center / ground-contact point; the sprite
 * is anchored at its base there and rises upward (negative y).
 */
export interface ZoneScene {
  container: Container;
  /** The landmark's front layer, when it has one — placed and sorted by the
   *  renderer on its own depth key (see LANDMARK_ART.frontUrl). */
  front?: Container;
  setHover: (hovered: boolean) => void;
  /** Gentle idle animation (called each frame with elapsed seconds). */
  animate?: (t: number) => void;
}

/** Bold cel outline color used across all art. */
const INK = 0x23201c;

/** Resolve a bundled landmark image URL (Vite rewrites these at build time). */
const landmarkUrl = (name: string): string =>
  new URL(`../assets/landmarks/${name}.webp`, import.meta.url).href;

/**
 * Placement for each zone's illustrated landmark sprite.
 *   url      — bundled cleaned PNG
 *   scale    — world px per art px (starting sizes; tuned by eye via the TEMP
 *              scale tweaker, then baked back here)
 *   anchorX  — horizontal pin: the opaque body's centre (0..1 of texture width)
 *   anchorY  — vertical pin: the opaque body's BASE / ground contact (0..1 of height)
 *   contentH — opaque body height in art px; the floating label is placed this
 *              far (× scale) above the base, so it tracks any scale change
 *   contentBox — opaque-pixel bounding box [x0, y0, x1, y1] in art px
 *              (alpha ≥ 16). Tap hit-testing uses THIS, not the texture
 *              bounds, so transparent padding never swallows a walk tap.
 *   frontUrl  — optional FRONT layer: the pieces a Friend should pass BEHIND
 *              (a near stair rail, the nearest root). Cut from the same
 *              canvas as `url` with the same anchor and scale, so it overlays
 *              exactly; drawn as a second sprite with its own depth key.
 *              With a front layer, `url` is the BACK layer — the master with
 *              the front pieces cut out — and is only ever drawn WITH it.
 *   fullUrl   — with a front layer: the COMPLETE master, same canvas, anchor
 *              and scale. The runtime's fallback when either half of the pair
 *              fails to load: shown alone, never with a front. If it fails
 *              too, the code-drawn structure draws, as for any landmark.
 *   backInset — with a front layer: how far (art px) above the bbox bottom
 *              the BACK layer's ground contact sits (the trunk base), so its
 *              depth key is that row rather than the front pieces' row. A
 *              Friend between the two rows draws between the layers. Applies
 *              only when the pair actually loaded; the full fallback sorts on
 *              its base like a single sprite.
 * Anchors/contentH were derived from each cleaned PNG's opaque bounding box
 * (tools/island-art/landmarks-anchors.mjs) so every sprite sits BY ITS BASE on
 * the clearing — tall objects rise upward, low objects sit flat. Relative
 * scales: lighthouse/treehouse tall, art-hut/arcade mid, campfire/calm-beach
 * low, dock flat+wide. Scales below are the final eye-tuned values.
 */
export const LANDMARK_ART: Record<
  ZoneKey,
  {
    url: string;
    scale: number;
    anchorX: number;
    anchorY: number;
    contentH: number;
    /** Opaque-pixel bbox [x0, y0, x1, y1] in art px (tools/island-art bbox pass). */
    contentBox: [number, number, number, number];
    frontUrl?: string;
    fullUrl?: string;
    backInset?: number;
  }
> = {
  // Scales normalized by door/entrance size so every structure reads at the
  // same child-scale door (~42 world px). Towers are taller; the treehouse is
  // capped (its door is a tiny fraction of the all-tree image).
  lighthouse_point: { url: landmarkUrl("lighthouse"), scale: 0.37, anchorX: 0.5464, anchorY: 0.8789, contentH: 839, contentBox: [345, 60, 836, 905] },
  // Treehouse — the island's "epic destination": deliberately the largest
  // landmark so it towers over everything (deep in its own forest cluster).
  // Hero landmark: scaled up large and (in defaultLayout) nudged SOUTH so it
  // sits clearly IN FRONT of its forest cluster — the trees frame it from
  // behind instead of burying the cabin.
  //
  // 2026-09-19: the approved painterly exterior, as a BACK/FRONT pair cut from
  // one 1024 master by tools/island-art/treehouse-layers.mjs (mask in
  // treehouse-front-mask.json; source retained under
  // tools/island-art/source/treehouse-master-2026-09-19/). Anchor = the
  // master's bbox bottom-centre, contentBox measured at alpha > 16 — both
  // layers share them by construction. Scale kept from the previous art
  // (visible height 853 → 861 art px, +1%). backInset 80: the trunk meets the
  // ground ~80 art px above the stair foot / root tips. treehouse-full is the
  // uncut master, the fallback if either half of the pair fails to load.
  treehouse_hideaway: {
    url: landmarkUrl("treehouse"), frontUrl: landmarkUrl("treehouse-front"),
    fullUrl: landmarkUrl("treehouse-full"), backInset: 80,
    scale: 0.74, anchorX: 0.5039, anchorY: 0.8984, contentH: 861, contentBox: [110, 59, 922, 920],
  },
  art_hut: { url: landmarkUrl("art-hut"), scale: 0.29, anchorX: 0.5181, anchorY: 0.7236, contentH: 638, contentBox: [175, 102, 886, 742] },
  arcade_cove: { url: landmarkUrl("arcade"), scale: 0.21, anchorX: 0.5103, anchorY: 0.8457, contentH: 734, contentBox: [131, 132, 914, 868] },
  campfire_circle: { url: landmarkUrl("campfire"), scale: 0.31, anchorX: 0.499, anchorY: 0.75, contentH: 641, contentBox: [161, 124, 864, 779] },
  calm_beach: { url: landmarkUrl("calm-beach"), scale: 0.25, anchorX: 0.4385, anchorY: 0.7598, contentH: 657, contentBox: [70, 120, 828, 780] },
  welcome_dock: { url: landmarkUrl("welcome-dock"), scale: 0.25, anchorX: 0.5205, anchorY: 0.7676, contentH: 484, contentBox: [127, 301, 940, 787] },
  // New zones. store-01 is a tall stall (base-pinned); lagoon-01 is a flat
  // top-down pond, so it is centre-pinned (anchorY 0.5) and uses a reduced
  // contentH just for the floating label height.
  star_market: { url: landmarkUrl("store-01"), scale: 0.19, anchorX: 0.4995, anchorY: 0.9941, contentH: 1167, contentBox: [7, 7, 1017, 1173] },
  lazy_lagoon: { url: landmarkUrl("lagoon-01"), scale: 0.25, anchorX: 0.4996, anchorY: 0.5, contentH: 440, contentBox: [7, 7, 1204, 871] },
  // NOTE: a fishing-dock landmark was once floated as a 10th zone; the raw
  // asset drop was removed in the Session 2 cleanup. The zone set is locked
  // at these nine — do not wire new zones without a roadmap decision.
};

/**
 * Arrival boat sprite: the PETE-BAKED covered boat — Captain Pete steers at the
 * wheel (stern/left) while the player's chosen avatar rides as a PASSENGER.
 *
 * Shipped as TWO layers, split offline from boat-covered.png along the near
 * gunwale (tools/island-art/split-covered-boat.mjs):
 *   backUrl  — hull-back: cabin, Pete, sail, mast, far hull (BEHIND the rider);
 *   frontUrl — hull-front: the near rail + hull wall + wake (IN FRONT).
 * ArrivalView renders back → rider → front, so the rider stands in front of the
 * cabin at the near rail with the hull edge crossing the legs (visible knees-up).
 * The empty-helm boat (boat-empty-helm.webp) stays banked for future use.
 *
 *   anchorX/anchorY — hull centre / waterline, in texture fractions (both
 *                     layers share it, so they overlay perfectly).
 *   railX/railY     — where the passenger's FEET pin (texture fractions): the
 *                     deck at the near rail, amidships-right of Pete.
 *   riderHeight     — the rider's FULL content height as a fraction of the boat
 *                     texture height (content-anchored: the sprite is scaled by
 *                     its measured content, then the near rail occludes the
 *                     lower ~third). ~0.47 reads as a child beside adult Pete.
 */
export const BOAT_ART = {
  backUrl: landmarkUrl("boat-covered-back"),
  frontUrl: landmarkUrl("boat-covered-front"),
  anchorX: 0.4874,
  anchorY: 0.79,
  railX: 0.44,
  railY: 0.8,
  riderHeight: 0.47,
};

/** Full-screen painted stage for the side-view arrival cinematic (the same
 *  scene the empty-helm boat was cut from, with the boat painted out). */
export const ARRIVAL_BG_URL = landmarkUrl("arrival-bg");

export function buildZoneScene(
  zone: ZoneInstance,
  theme: ThemePackConfig,
  texture?: Texture,
  frontTexture?: Texture,
): ZoneScene {
  const { palette } = theme;
  const container = new Container();

  const art = new Container();
  container.addChild(art);
  let front: Container | undefined;
  let frontArt: Container | undefined;

  const cfg = LANDMARK_ART[zone.key];
  // Gentle per-zone idle details (all disabled under reduced motion upstream).
  const fxFns: ((t: number) => void)[] = [];

  if (texture) {
    // ── Finished illustrated landmark (Mode 1) ──
    // Pinned by its BASE (bottom-centre of the opaque body) at the footprint
    // centre, so it sits ON the clearing; tall art rises upward from there.
    const sprite = new Sprite(texture);
    sprite.anchor.set(cfg.anchorX, cfg.anchorY);
    sprite.scale.set(cfg.scale);
    art.addChild(sprite);

    // Front layer: the SAME anchor and scale as the back sprite — it was cut
    // from the same canvas — in its own container so the renderer can give it
    // its own depth key. Never measured or centred on its own. When no front
    // is given, `texture` is a COMPLETE image (the renderer substitutes the
    // full master when the pair did not load), never the cut back layer.
    if (frontTexture && cfg.frontUrl) {
      front = new Container();
      frontArt = new Container();
      front.addChild(frontArt);
      const fs = new Sprite(frontTexture);
      fs.anchor.set(cfg.anchorX, cfg.anchorY);
      fs.scale.set(cfg.scale);
      frontArt.addChild(fs);
    }

    // Ambient "living landmark" effects (soft warm glow, chimney smoke, rotating
    // beam, screen/marquee, water ripples, drifting leaves, gentle sways …),
    // layered ABOVE the sprite. The campfire flame itself (drawFlame in the
    // renderer) is left untouched — only its warm glow is added here.
    const anim = buildLandmarkFx(zone.key, container, sprite);
    if (anim) fxFns.push(anim);
  } else {
    // Fallback (PNG failed to load): draw the cel-shaded code structure so the
    // zone is never empty. No ground patch / beacon — just the landmark.
    const structure = new Graphics();
    ZONE_PAINT[zone.key](structure, palette);
    structure.scale.set(STRUCTURE_SCALE[zone.key] ?? 2.7);
    art.addChild(structure);
  }

  if (!zone.unlocked) {
    art.alpha = 0.6;
    const lock = new Graphics();
    lock.roundRect(-9, -24, 18, 14, 3).fill(0xf4d36b).stroke({ width: 3, color: INK });
    lock.rect(-5, -31, 10, 8).stroke({ width: 3, color: INK });
    art.addChild(lock);
  }

  // Zone name labels are drawn by SceneRenderer in a screen-space overlay (so a
  // tall landmark can never push its label off-screen or occlude it).

  return {
    container,
    front,
    setHover: (hovered: boolean) => {
      art.scale.set(hovered ? 1.05 : 1);
      frontArt?.scale.set(hovered ? 1.05 : 1);
    },
    animate: fxFns.length ? (t: number) => { for (const f of fxFns) f(t); } : undefined,
  };
}

// ── Code structure scale (fallback + Mode-2 interior reference) ──────
const STRUCTURE_SCALE: Record<ZoneKey, number> = {
  lighthouse_point: 3.4,
  treehouse_hideaway: 3.2,
  campfire_circle: 3.0,
  art_hut: 2.8,
  arcade_cove: 2.8,
  calm_beach: 2.4,
  welcome_dock: 3.0,
  star_market: 2.8,
  lazy_lagoon: 2.6,
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
  star_market: "#f6e7c8",
  lazy_lagoon: "#cdeef0",
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
    // Biggest tree on the island with a cozy cabin built into the canopy.
    // Canopy is drawn BEHIND the cabin so the house reads.
    //
    // STAND-IN, NOT THE APPROVED ART. This painter only runs when the
    // illustrated landmark texture fails to load. It carries the approved
    // direction's read — blue-green shingled roof, leaf doorway, wrapping
    // balcony, lookout, and a STAIR flight with frequent low risers rather
    // than the rope ladder it used to draw — so a fallback never contradicts
    // the approved exterior. It is not a substitute for that exterior; see
    // ASSET-SPEC-S89.md "Treehouse exterior".
    const trunk = 0x7a5230;
    const leaf = hexNum(p.foliage);
    const leafLit = shade(p.foliage, 0.24);
    const wood = 0xb07a44;
    const woodDark = 0x6e4a2a;
    const roof = 0x4a9fa6;      // approved blue-green shingle
    const roofLit = 0x6ec3c6;

    // Trunk.
    g.poly([-11, 4, -8, -42, 8, -42, 11, 4]).fill(trunk).stroke({ width: 4, color: INK });
    g.roundRect(-4, -40, 4, 44, 2).fill({ color: hexNum(shade(trunk, 0.2)), alpha: 0.5 });

    // Big canopy BEHIND the house (the tree crown).
    g.circle(0, -74, 34).fill(leaf).stroke({ width: 4, color: INK });
    g.circle(-24, -60, 18).fill(leaf).stroke({ width: 4, color: INK });
    g.circle(24, -60, 18).fill(leaf).stroke({ width: 4, color: INK });
    g.circle(0, -74, 31).fill(leaf); // mask inner outlines
    g.circle(-11, -84, 12).fill({ color: hexNum(leafLit), alpha: 0.85 });

    // Platform across the trunk.
    g.roundRect(-28, -46, 56, 7, 3).fill(wood).stroke({ width: 4, color: INK });
    g.roundRect(-28, -46, 56, 3, 2).fill({ color: hexNum(shade(wood, 0.2)), alpha: 0.6 });
    g.roundRect(-26, -39, 3, 6, 1).fill(woodDark); // support posts
    g.roundRect(23, -39, 3, 6, 1).fill(woodDark);

    // Cabin walls (in front of the canopy) + plank lines.
    g.roundRect(-18, -76, 36, 30, 3).fill(wood).stroke({ width: 4, color: INK });
    g.roundRect(-18, -76, 36, 8, 3).fill({ color: hexNum(shade(wood, 0.18)), alpha: 0.5 });
    g.moveTo(-18, -66).lineTo(18, -66).moveTo(-18, -57).lineTo(18, -57)
      .stroke({ width: 1.5, color: woodDark, alpha: 0.5 });

    // Pitched roof, slightly overhanging — blue-green shingle.
    g.poly([-23, -76, 23, -76, 0, -94]).fill(roof).stroke({ width: 4, color: INK });
    g.poly([-23, -76, 0, -94, -6, -76]).fill({ color: roofLit, alpha: 0.55 });

    // Leaf flag on the ridge, and the lookout telescope off the deck rail.
    g.moveTo(0, -94).lineTo(0, -104).stroke({ width: 2, color: woodDark });
    g.poly([0, -104, 9, -101, 0, -98]).fill(0xfdf3e0).stroke({ width: 1.6, color: INK });
    g.moveTo(20, -50).lineTo(30, -56).stroke({ width: 3.2, color: 0x7fa8c9 });
    g.circle(30, -56, 1.8).fill(0xcfe3f2).stroke({ width: 1.2, color: INK });

    // Door + leaf motif + knob.
    g.roundRect(-7, -60, 13, 14, 2).fill(woodDark).stroke({ width: 3, color: INK });
    g.ellipse(-1.5, -55, 2.6, 4).fill(hexNum(leafLit)).stroke({ width: 1, color: INK, alpha: 0.8 });
    g.circle(3, -53, 1).fill(0xffe14d);

    // Lit window with cross bars.
    g.roundRect(8, -72, 9, 9, 1.5).fill(0xfff1a8).stroke({ width: 2.5, color: INK });
    g.moveTo(12.5, -72).lineTo(12.5, -63).moveTo(8, -67.5).lineTo(17, -67.5)
      .stroke({ width: 1.2, color: INK, alpha: 0.7 });

    // Stairs down the trunk to the ground: frequent, shallow risers curving
    // out to the left, with a rope handrail. The approved approach — a child
    // walks up these, they do not climb a ladder.
    const STEPS = 11;
    for (let i = 0; i < STEPS; i++) {
      const t = i / (STEPS - 1);
      const sy = -44 + t * 46;                    // ~4.2 world px per riser
      const sx = -4 - t * t * 13;                 // curves outward as it drops
      const sw = 9 + t * 3;
      g.roundRect(sx - sw / 2, sy, sw, 3, 1).fill(wood).stroke({ width: 1.6, color: INK });
    }
    g.moveTo(-1, -46).bezierCurveTo(-4, -30, -10, -14, -18, 2)
      .stroke({ width: 1.6, color: 0xccb089 });

    // A couple of front leaf tufts peeking over the roof so it nestles in.
    g.circle(-23, -80, 12).fill(leaf).stroke({ width: 4, color: INK });
    g.circle(23, -80, 12).fill(leaf).stroke({ width: 4, color: INK });
    g.circle(-23, -83, 7).fill({ color: hexNum(leafLit), alpha: 0.8 });
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
  star_market: (g, p) => {
    // Little market stall: counter, posts and a striped awning.
    const wood = 0xb07a44;
    celBox(g, -20, -8, 40, 16, 2, wood); // counter
    g.roundRect(-20, -34, 4, 26, 1).fill(0x6e4a2a).stroke({ width: 2.5, color: INK });
    g.roundRect(16, -34, 4, 26, 1).fill(0x6e4a2a).stroke({ width: 2.5, color: INK });
    // striped awning
    for (let i = 0; i < 6; i++) {
      g.poly([-22 + i * 7.3, -34, -22 + (i + 1) * 7.3, -34, -22 + (i + 1) * 7.3 - 3, -26, -22 + i * 7.3 - 3, -26])
        .fill(i % 2 ? 0xf4f0e6 : hexNum(shade(p.accent, 0.1)));
    }
    g.poly([-24, -34, 24, -34, 18, -26, -18, -26]).stroke({ width: 3, color: INK });
  },
  lazy_lagoon: (g, p) => {
    // Flat top-down pond: water oval with a sandy rim and a couple of rocks.
    g.ellipse(0, 0, 34, 20).fill(hexNum(shade(p.landAlt, 0.05))).stroke({ width: 3, color: INK });
    g.ellipse(0, 0, 28, 15).fill(hexNum(p.water));
    g.ellipse(-3, -2, 20, 9).fill({ color: hexNum(shade(p.water, 0.18)), alpha: 0.5 });
    g.ellipse(12, 4, 5, 3).fill(0x8d8475).stroke({ width: 2, color: INK });
    g.ellipse(-14, 5, 4, 2.5).fill(0x8d8475).stroke({ width: 2, color: INK });
  },
};
