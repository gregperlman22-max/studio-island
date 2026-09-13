/**
 * POC — the forest travel kit.
 *
 * The whole point of the kit-composed approach is that a route consumes NO new
 * art: it is a recipe over a small shared sprite library. So this kit is built
 * entirely from sprites the repo already ships for the world map — no new
 * production art was commissioned for this proof of concept, which is the
 * discipline the spike recommended.
 *
 * If two routes made from these eight sprites feel like the same corridor
 * twice, the kit approach is wrong and the answer is bespoke painted scenes.
 * That is the test.
 */

import { Texture } from "pixi.js";
import { avatarFileUrl } from "../../render/avatarCatalog";
import { computeContentBounds, type ContentBounds } from "../../render/contentBounds";
import type { PropKind } from "./routeModel";

const spriteUrl = (name: string): string =>
  new URL(`../../assets/sprites/${name}.webp`, import.meta.url).href;
const landmarkUrl = (name: string): string =>
  new URL(`../../assets/landmarks/${name}.webp`, import.meta.url).href;

/** Eight existing world-map sprites, reused as corridor scenery. */
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

/** The destination: the existing world-map treehouse landmark, unmodified. */
export const DESTINATION_URL = landmarkUrl("treehouse");

/** The POC avatar: Ollie, the approved core friend. Resolved through the
 *  catalog's own URL helper — the six friends live in public/, which Vite
 *  serves verbatim, so an import.meta.url reference would 404. */
export const OLLIE_URL = avatarFileUrl("core/ollie-the-otter.webp");

export interface KitTextures {
  props: Record<PropKind, Texture>;
  destination: Texture;
  ollie: Texture;
  bounds: WeakMap<Texture, ContentBounds>;
}

/**
 * Load every kit texture and measure its opaque content box, exactly the way
 * avatarTexture.ts does for characters. Corridor props are anchored on their
 * measured BASE (not the canvas bottom), so a tree with baked transparent
 * padding still stands on the ground plane instead of hovering above it.
 */
export async function loadKit(): Promise<KitTextures> {
  const bounds = new WeakMap<Texture, ContentBounds>();
  const entries = Object.entries(KIT_URLS) as [PropKind, string][];
  const [propTex, destination, ollie] = await Promise.all([
    Promise.all(entries.map(async ([kind, url]) => [kind, await load(url, bounds)] as const)),
    load(DESTINATION_URL, bounds),
    load(OLLIE_URL, bounds),
  ]);
  const props = Object.fromEntries(propTex) as Record<PropKind, Texture>;
  return { props, destination, ollie, bounds };
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
    img.onerror = () => reject(new Error(`kit sprite failed: ${url}`));
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
