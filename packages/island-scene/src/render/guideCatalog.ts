/**
 * Guide catalog — the 9 landmark guide animals (Phase 2: Landmark Guides).
 *
 * Each landmark zone has a resident guide: a friendly animal character who pops
 * in with a warm, in-character welcome the first time a child taps into that
 * zone. The illustrated guide art lives in `public/guides/` with capitalised
 * filenames (Bear.webp, Owl.webp, …) as true-RGBA cutouts, matted offline by
 * tools/island-art/matte-characters.mjs (like the avatar art).
 *
 * This file is pure data + URL helpers; the on-screen presentation lives in
 * GuideOverlay.ts and the wiring in SceneRenderer.ts.
 */

import type { ZoneKey } from "../types";

export interface GuideEntry {
  /** Landmark zone this guide lives at. */
  zone: ZoneKey;
  /** The animal species (matches the PNG stem, e.g. "Bear"). */
  animal: string;
  /** The guide's kid-facing name shown in bold above the message. */
  name: string;
  /** Exact image filename in public/guides (capitalised first letter). */
  file: string;
}

/**
 * Zone → guide. Order mirrors the assignment brief. Filenames match the PNGs in
 * public/guides exactly (capitalised, no spaces).
 */
export const GUIDES: Record<ZoneKey, GuideEntry> = {
  campfire_circle: {
    zone: "campfire_circle",
    animal: "Bear",
    name: "Bruno",
    file: "Bear.webp",
  },
  treehouse_hideaway: {
    zone: "treehouse_hideaway",
    animal: "Owl",
    name: "Olive",
    file: "Owl.webp",
  },
  art_hut: {
    zone: "art_hut",
    animal: "Fox",
    name: "Fern",
    file: "Fox.webp",
  },
  lighthouse_point: {
    zone: "lighthouse_point",
    animal: "Whale",
    name: "Wally",
    file: "Whale.webp",
  },
  arcade_cove: {
    zone: "arcade_cove",
    animal: "Monkey",
    name: "Mango",
    file: "Monkey.webp",
  },
  star_market: {
    zone: "star_market",
    animal: "Raccoon",
    name: "Rascal",
    file: "Raccoon.webp",
  },
  calm_beach: {
    zone: "calm_beach",
    animal: "Turtle",
    name: "Shelly",
    file: "Turtle.webp",
  },
  lazy_lagoon: {
    zone: "lazy_lagoon",
    animal: "Frog",
    name: "Finn",
    file: "Frog.webp",
  },
  welcome_dock: {
    zone: "welcome_dock",
    animal: "Pelican",
    name: "Captain Pete",
    file: "Pelican.webp",
  },
};

/** Resolve the served URL for a guide PNG (honours the Vite base path). */
export function guideFileUrl(file: string): string {
  // import.meta.env.BASE_URL is statically replaced at build time ("/" by
  // default; the deploy base on GitHub Pages). encodeURIComponent keeps the
  // helper robust even though the guide filenames contain no spaces today.
  const base = import.meta.env.BASE_URL;
  return `${base}guides/${encodeURIComponent(file)}`;
}

/** Look up the guide for a zone (every zone has one). */
export function guideForZone(zone: ZoneKey): GuideEntry {
  return GUIDES[zone];
}
