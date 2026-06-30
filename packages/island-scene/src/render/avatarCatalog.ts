/**
 * Avatar catalog — the 16 illustrated animal characters a child can choose from
 * on the avatar selection screen (Phase 1: Avatar Creator).
 *
 * The PNGs live in `public/avatars/` and are served as static assets. Filenames
 * keep their capitalised, space-containing names verbatim (e.g. "Polar Bear.png",
 * "Red Panda.png") — `avatarImageUrl` URL-encodes them so the spaces survive the
 * round-trip to `Assets.load`.
 *
 * Order below is the on-screen grid order (4 columns × 4 rows).
 */

export interface AvatarOption {
  /** Stable identifier (used for persistence + the onAvatarSelect callback). */
  key: string;
  /** Kid-facing label shown under the image (e.g. "Red Panda"). */
  name: string;
  /** Exact PNG filename in public/avatars (capitalised; may contain spaces). */
  file: string;
}

export const AVATARS: readonly AvatarOption[] = [
  { key: "bunny", name: "Bunny", file: "Bunny.png" },
  { key: "cat", name: "Cat", file: "Cat.png" },
  { key: "dog", name: "Dog", file: "Dog.png" },
  { key: "deer", name: "Deer", file: "Deer.png" },
  { key: "hedgehog", name: "Hedgehog", file: "Hedgehog.png" },
  { key: "otter", name: "Otter", file: "Otter.png" },
  { key: "squirrel", name: "Squirrel", file: "Squirrel.png" },
  { key: "panda", name: "Panda", file: "Panda.png" },
  { key: "koala", name: "Koala", file: "Koala.png" },
  { key: "penguin", name: "Penguin", file: "Penguin.png" },
  { key: "red_panda", name: "Red Panda", file: "Red Panda.png" },
  { key: "duck", name: "Duck", file: "Duck.png" },
  { key: "elephant", name: "Elephant", file: "Elephant.png" },
  { key: "flamingo", name: "Flamingo", file: "Flamingo.png" },
  { key: "polar_bear", name: "Polar Bear", file: "Polar Bear.png" },
  { key: "chameleon", name: "Chameleon", file: "Chameleon.png" },
] as const;

/** Resolve the served URL for an avatar PNG (honours the Vite base path). */
export function avatarFileUrl(file: string): string {
  // Vite statically replaces import.meta.env.BASE_URL at build time ("/" by
  // default; the deploy base on GitHub Pages). Spaces in names are encoded so
  // the URL survives the round-trip to Assets.load.
  const base = import.meta.env.BASE_URL;
  return `${base}avatars/${encodeURIComponent(file)}`;
}

/** Resolve the served URL for an avatar by its catalog key, or null if unknown. */
export function avatarImageUrl(key: string): string | null {
  const a = AVATARS.find((x) => x.key === key);
  return a ? avatarFileUrl(a.file) : null;
}

/** Look up a catalog entry by key. */
export function avatarByKey(key: string): AvatarOption | undefined {
  return AVATARS.find((x) => x.key === key);
}
