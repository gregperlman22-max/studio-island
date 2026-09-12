/**
 * Avatar catalog.
 *
 * TWO rosters live here:
 *
 * - CORE_AVATARS — the six Island Friends a child actually picks from. This is
 *   the whole primary picker, and the only art preloaded before first paint.
 * - LEGACY_AVATARS — the ten remaining characters from the original 16-animal
 *   wall. They are NOT shown in the picker. They stay so old saved selections
 *   still resolve to a real image and so a future "More Friends" screen has
 *   something to draw; nothing renders them today.
 *
 * KEY COMPATIBILITY: the six core keys (otter/dog/cat/bunny/deer/red_panda) are
 * the SAME keys the old 16-animal catalog used, so a child who previously chose
 * e.g. "bunny" keeps their selection — it simply resolves to Sunny's new art.
 * `onAvatarSelect` and every downstream movement/arrival path are unchanged.
 * Do not renumber or rename these keys.
 *
 * Art lives under `public/avatars/`: the core six in `core/`, the legacy cast
 * beside them. Both are WebP with alpha. The core six are BUILT from the
 * approved PNGs by tools/island-art/optimize-core-avatars.mjs — those sources
 * live in tools/island-art/source/core-avatars/ and are deliberately outside
 * public/ so they never reach a browser. Re-run that script after an art drop;
 * do not hand-edit anything in core/.
 */

export interface AvatarOption {
  /** Stable identifier (used for persistence + the onAvatarSelect callback). */
  key: string;
  /** Kid-facing label (e.g. "Sunny the Bunny"). */
  name: string;
  /** Path under public/avatars (may include a subfolder and spaces). */
  file: string;
  /** Three one-word traits shown as small badges on the picker card. */
  traits?: readonly [string, string, string];
}

/**
 * The six core Island Friends, in on-screen order. Order matches the approved
 * picker mockup (left to right).
 */
export const CORE_AVATARS: readonly AvatarOption[] = [
  {
    key: "otter",
    name: "Ollie the Otter",
    file: "core/ollie-the-otter.webp",
    traits: ["Curious", "Kind", "Brave"],
  },
  {
    key: "dog",
    name: "Doug the Dog",
    file: "core/doug-the-dog.webp",
    traits: ["Loyal", "Friendly", "Energetic"],
  },
  {
    key: "cat",
    name: "Matt the Cat",
    file: "core/matt-the-cat.webp",
    traits: ["Clever", "Calm", "Creative"],
  },
  {
    key: "bunny",
    name: "Sunny the Bunny",
    file: "core/sunny-the-bunny.webp",
    traits: ["Upbeat", "Friendly", "Brave"],
  },
  {
    key: "deer",
    name: "Daisy the Deer",
    file: "core/daisy-the-deer.webp",
    traits: ["Thoughtful", "Gentle", "Observant"],
  },
  {
    key: "red_panda",
    name: "Remy the Red Panda",
    file: "core/remy-the-red-panda.webp",
    traits: ["Playful", "Creative", "Kind"],
  },
] as const;

/**
 * The ten characters from the original wall that are NOT core friends. Kept on
 * disk and resolvable by key; deliberately absent from the picker and from the
 * first-paint preload. A "More Friends" experience would surface these.
 */
export const LEGACY_AVATARS: readonly AvatarOption[] = [
  { key: "hedgehog", name: "Hedgehog", file: "Hedgehog.webp" },
  { key: "squirrel", name: "Squirrel", file: "Squirrel.webp" },
  { key: "panda", name: "Panda", file: "Panda.webp" },
  { key: "koala", name: "Koala", file: "Koala.webp" },
  { key: "penguin", name: "Penguin", file: "Penguin.webp" },
  { key: "duck", name: "Duck", file: "Duck.webp" },
  { key: "elephant", name: "Elephant", file: "Elephant.webp" },
  { key: "flamingo", name: "Flamingo", file: "Flamingo.webp" },
  { key: "polar_bear", name: "Polar Bear", file: "Polar Bear.webp" },
  { key: "chameleon", name: "Chameleon", file: "Chameleon.webp" },
] as const;

/**
 * Every character a key can resolve to — core first, so a core key always wins
 * over a same-named legacy entry. Kept under the original export name because
 * hosts and `avatarImageUrl` resolve against it. NOT the picker's roster: the
 * picker renders CORE_AVATARS only.
 */
export const AVATARS: readonly AvatarOption[] = [
  ...CORE_AVATARS,
  ...LEGACY_AVATARS,
] as const;

/** Resolve the served URL for an avatar image (honours the Vite base path). */
export function avatarFileUrl(file: string): string {
  // Vite statically replaces import.meta.env.BASE_URL at build time ("/" by
  // default; the deploy base on GitHub Pages). Each path segment is encoded so
  // spaces in the legacy filenames survive the round-trip to Assets.load, while
  // the "core/" folder separator stays a real separator.
  const base = import.meta.env.BASE_URL;
  const path = file.split("/").map(encodeURIComponent).join("/");
  return `${base}avatars/${path}`;
}

/** Resolve the served URL for an avatar by its catalog key, or null if unknown. */
export function avatarImageUrl(key: string): string | null {
  const a = avatarByKey(key);
  return a ? avatarFileUrl(a.file) : null;
}

/** Look up a catalog entry by key (core takes precedence over legacy). */
export function avatarByKey(key: string): AvatarOption | undefined {
  return AVATARS.find((x) => x.key === key);
}

/** True when `key` is one of the six friends the picker offers. */
export function isCoreAvatar(key: string): boolean {
  return CORE_AVATARS.some((a) => a.key === key);
}
