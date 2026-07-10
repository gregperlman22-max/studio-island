/**
 * Guide catalog — the 9 landmark guide animals (Phase 2: Landmark Guides).
 *
 * Each landmark zone has a resident guide: a friendly animal character who pops
 * in with a warm, in-character welcome the first time a child taps into that
 * zone. The illustrated guide PNGs live in `public/guides/` with capitalised
 * filenames (Bear.webp, Owl.webp, …) and, like the avatar art, ship as RGB with a
 * baked-in light background — `loadAvatarTexture` knocks that out to transparency.
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
  /** Exact PNG filename in public/guides (capitalised first letter). */
  file: string;
  /** In-character welcome message shown in the speech bubble. */
  message: string;
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
    message:
      "Hey there, friend! Welcome to Campfire Circle — pull up a log and get cozy!",
  },
  treehouse_hideaway: {
    zone: "treehouse_hideaway",
    animal: "Owl",
    name: "Olive",
    file: "Owl.webp",
    message:
      "Whooo's there? Welcome to the Treehouse! Let your imagination soar up here!",
  },
  art_hut: {
    zone: "art_hut",
    animal: "Fox",
    name: "Fern",
    file: "Fox.webp",
    message:
      "Oh, hello! Welcome to the Art Hut — let's make something amazing together!",
  },
  lighthouse_point: {
    zone: "lighthouse_point",
    animal: "Whale",
    name: "Wally",
    file: "Whale.webp",
    message:
      "Hey, take a deep breath... Welcome to Lighthouse Point. It's nice to just think here.",
  },
  arcade_cove: {
    zone: "arcade_cove",
    animal: "Monkey",
    name: "Mango",
    file: "Monkey.webp",
    message: "Woohoo! Welcome to Arcade Cove! Ready to play some games?!",
  },
  star_market: {
    zone: "star_market",
    animal: "Raccoon",
    name: "Rascal",
    file: "Raccoon.webp",
    message:
      "Ooh, a visitor! Welcome to Star Market — check out all the shiny stuff!",
  },
  calm_beach: {
    zone: "calm_beach",
    animal: "Turtle",
    name: "Shelly",
    file: "Turtle.webp",
    message: "Heyyy... welcome to Calm Beach. No rush here... just relax.",
  },
  lazy_lagoon: {
    zone: "lazy_lagoon",
    animal: "Frog",
    name: "Finn",
    file: "Frog.webp",
    message: "Ribbit! Welcome to Lazy Lagoon! Kick back and chill with me!",
  },
  welcome_dock: {
    zone: "welcome_dock",
    animal: "Pelican",
    name: "Captain Pete",
    file: "Pelican.webp",
    message:
      "Ahoy! Welcome to the dock! This is where every adventure begins!",
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
