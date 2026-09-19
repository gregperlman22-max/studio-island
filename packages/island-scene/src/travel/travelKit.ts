import { Texture } from "pixi.js";
import { computeContentBounds, type ContentBounds } from "../render/contentBounds";
import { avatarFileUrl, avatarByKey } from "../render/avatarCatalog";
import type { PropKind } from "./routeModel";

/**
 * The travel art registry.
 *
 * EVERY ENTRY HERE IS A SUBSTITUTION. Not one of the production assets
 * ASSET-SPEC-S89 calls for exists yet, so this file composes the journey from
 * art the island already ships and records, in one place, exactly what is
 * standing in for what. Nothing below is approved art or a production
 * conclusion.
 *
 *   FOREST KIT — the spec asks for 4-5 tree variants plus a canopy-overhang
 *   bough. The repo ships TWO trees (tree-01, tree-02) and no bough. So the
 *   corridor is built from those two, tinted and rescaled, and the overhead
 *   arch is tree-01/tree-02 stretched into a role they were not drawn for.
 *   The route WILL look repetitive; that is the missing art, not the layout.
 *
 *   TRAVEL POSES — the spec asks for six 3/4-BACK poses. None exist. The
 *   child's Friend is drawn from their front-facing core portrait, which is
 *   wrong for someone walking away from camera and is the single most visible
 *   substitution in EC-2. Layout does not depend on it: the sprite is placed by
 *   measured content bounds, so a real back pose drops in by registry entry.
 *
 *   OLIVE — the spec asks for an upgraded Olive in three poses. The arrival
 *   greeting uses the generic nine-guide owl (`public/guides/Owl.webp`),
 *   supplied by the renderer.
 *
 *   DESTINATION — the world-map treehouse landmark, unmodified.
 */

const spriteUrl = (name: string): string =>
  new URL(`../assets/sprites/${name}.webp`, import.meta.url).href;
const landmarkUrl = (name: string): string =>
  new URL(`../assets/landmarks/${name}.webp`, import.meta.url).href;

/** Which shipped sprite each kit slot is currently standing on. */
export const KIT_URLS: Record<PropKind, string> = {
  tree1: spriteUrl("tree-01"),
  tree2: spriteUrl("tree-02"),
  bush1: spriteUrl("bush-01"),
  bush2: spriteUrl("bush-02"),
  rock: spriteUrl("rock-01"),
  flower: spriteUrl("flower-01"),
  flowerBush: spriteUrl("flower-bush-01"),
  grass: spriteUrl("grass-01"),
};

export const DESTINATION_URL = landmarkUrl("treehouse");
/** The destination's front layer (near rail, nearest root) — same canvas,
 *  same anchor and scale as DESTINATION_URL; see render/zones.ts. */
export const DESTINATION_FRONT_URL = landmarkUrl("treehouse-front");

/**
 * The Friend's travelling sprite.
 *
 * Resolution order, and the log line that says which one ran:
 *   1. `public/avatars/travel/<key>-travel.webp`  — the production 3/4-back pose
 *   2. the front-facing core portrait              — SUBSTITUTION
 *
 * Step 1 never resolves today; the files do not exist. It is written first so
 * that dropping them in is a file copy plus nothing.
 */
export function travelPoseUrl(avatarKey: string): { url: string | null; substituted: boolean } {
  const entry = avatarByKey(avatarKey);
  if (!entry) return { url: null, substituted: false };
  // Production pose, once it ships.
  const posed = `travel/${avatarKey}-travel.webp`;
  if (TRAVEL_POSES.has(avatarKey)) return { url: avatarFileUrl(posed), substituted: false };
  return { url: avatarFileUrl(entry.file), substituted: true };
}

/** Keys whose 3/4-back travel pose has actually shipped. Empty by design —
 *  add a key here when its file lands under public/avatars/travel/. */
export const TRAVEL_POSES: ReadonlySet<string> = new Set<string>();

export interface KitTextures {
  props: Record<PropKind, Texture>;
  destination: Texture;
  /** Front layer of the destination, if it loaded. Registered in `bounds`
   *  with the BACK layer's measured bounds, never its own, so both place
   *  identically — the pair was cut from one canvas. */
  destinationFront?: Texture;
  bounds: WeakMap<Texture, ContentBounds>;
}

/**
 * Load every kit texture and measure its opaque content box.
 *
 * Corridor props are anchored on their measured BASE rather than the canvas
 * bottom, so a tree with baked transparent padding stands on the ground plane
 * instead of hovering above it — the same content-bounds rule the world map and
 * the Quest Table use.
 */
export async function loadKit(): Promise<KitTextures> {
  const bounds = new WeakMap<Texture, ContentBounds>();
  const entries = Object.entries(KIT_URLS) as [PropKind, string][];
  const [propTex, destination, destinationFront] = await Promise.all([
    Promise.all(entries.map(async ([kind, url]) => [kind, await load(url, bounds)] as const)),
    load(DESTINATION_URL, bounds),
    loadFront(DESTINATION_FRONT_URL),
  ]);
  // Same canvas, same anchor: the front layer takes the back layer's bounds.
  const db = bounds.get(destination);
  if (destinationFront && db) bounds.set(destinationFront, db);
  return {
    props: Object.fromEntries(propTex) as Record<PropKind, Texture>,
    destination,
    destinationFront,
    bounds,
  };
}

/** Optional layer: a missing or failed front simply leaves the destination a
 *  single sprite, as it was before the layer existed. */
async function loadFront(url: string): Promise<Texture | undefined> {
  try {
    return Texture.from(await loadImage(url));
  } catch (err) {
    console.warn("[island-scene] destination front layer failed to load", err);
    return undefined;
  }
}

async function load(url: string, bounds: WeakMap<Texture, ContentBounds>): Promise<Texture> {
  const img = await loadImage(url);
  const tex = Texture.from(img);
  const b = measure(img);
  if (b) bounds.set(tex, b);
  return tex;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`travel kit sprite failed: ${url}`));
    img.src = url;
  });
}

function measure(img: HTMLImageElement): ContentBounds | null {
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  if (!w || !h || typeof document === "undefined") return null;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0);
  let data: Uint8ClampedArray;
  try {
    data = ctx.getImageData(0, 0, w, h).data;
  } catch {
    return null;
  }
  const alpha = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) alpha[i] = data[i * 4 + 3];
  return computeContentBounds(alpha, w, h);
}
