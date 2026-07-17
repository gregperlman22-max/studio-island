import { Texture } from "pixi.js";
import { computeContentBounds, type ContentBounds } from "./contentBounds";

/**
 * Character-art loader (avatars + guides).
 *
 * The art ships as true-RGBA WebP cutouts, matted OFFLINE by
 * tools/island-art/matte-characters.mjs (audited + signed off July 2026).
 * This loader decodes the image, measures its opaque-content bounds once (so
 * render sites can pin the true feet / horizontal centre and scale by visible
 * content rather than the padded canvas — see contentBounds.ts), and hands
 * Pixi a texture.
 *
 * HISTORY: it used to flood-fill the baked background out at runtime and
 * defringe the silhouette toward ink. That knockout assumed bold cel
 * outlines; the plush-style art has none, so pale fur keyed out (the Panda
 * face / Polar Bear torso defect) and the ink defringe drew a dark halo.
 * Both passes died with the offline matte — do not reintroduce them here;
 * new character art goes through the offline script instead.
 */

/** Per-texture opaque-content bounds, measured at load. WeakMap so an entry
 *  drops automatically when its texture is garbage-collected. */
const BOUNDS = new WeakMap<Texture, ContentBounds>();

/** Measured content bounds for a character texture, or undefined when the
 *  measurement was unavailable (SSR / tainted canvas / fully transparent) —
 *  callers then fall back to canvas-based anchoring. */
export function getContentBounds(texture: Texture): ContentBounds | undefined {
  return BOUNDS.get(texture);
}

export async function loadAvatarTexture(url: string): Promise<Texture> {
  const img = await loadImage(url);
  const texture = Texture.from(img);
  const bounds = measureBounds(img);
  if (bounds) BOUNDS.set(texture, bounds);
  return texture;
}

/** Draw the decoded image to an offscreen canvas and measure its alpha bbox.
 *  Returns null when no 2D canvas is available (tests / SSR) or the pixel read
 *  is blocked (tainted canvas). */
function measureBounds(img: HTMLImageElement): ContentBounds | null {
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  if (!w || !h || typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
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

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`avatar image failed: ${url}`));
    img.src = url;
  });
}
