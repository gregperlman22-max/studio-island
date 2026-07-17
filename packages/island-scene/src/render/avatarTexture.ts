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

/**
 * Per-sprite pivot overrides, keyed by the source file's basename (e.g.
 * "Squirrel.webp"). The auto-measured anchor pins the horizontal CENTRE of the
 * content's bottom edge as the "feet" — correct for the front-facing portraits,
 * whose ground contact IS the bbox-bottom-centre. A POSED sprite whose ground
 * contact isn't there (a lean, one leg extended, a tail hanging below the feet)
 * adds an entry here to override the anchor; the content HEIGHT still drives the
 * scale. Empty today — the current cast needs none.
 *
 *   "Squirrel.webp": { centerX: 0.52, feetY: 0.90 },
 */
const PIVOT_OVERRIDES: Record<string, { centerX?: number; feetY?: number }> = {};

/** Measured (+ optionally overridden) content bounds for a character texture,
 *  or undefined when the measurement was unavailable (SSR / tainted canvas /
 *  fully transparent) — callers then fall back to canvas-based anchoring. */
export function getContentBounds(texture: Texture): ContentBounds | undefined {
  return BOUNDS.get(texture);
}

/** Associate content bounds with a texture. Called by loadAvatarTexture; also
 *  public so a texture created through another path (or a test) can register
 *  its bounds and get the same content-aware anchoring. */
export function registerContentBounds(texture: Texture, bounds: ContentBounds): void {
  BOUNDS.set(texture, bounds);
}

export async function loadAvatarTexture(url: string): Promise<Texture> {
  const img = await loadImage(url);
  const texture = Texture.from(img);
  const bounds = measureBounds(img);
  if (bounds) registerContentBounds(texture, applyPivotOverride(url, bounds));
  return texture;
}

/** Merge any per-file pivot override onto measured bounds (anchor only). */
function applyPivotOverride(url: string, bounds: ContentBounds): ContentBounds {
  let file: string;
  try {
    file = decodeURIComponent(url.split("?")[0].split("/").pop() ?? "");
  } catch {
    file = "";
  }
  const o = PIVOT_OVERRIDES[file];
  if (!o) return bounds;
  return { ...bounds, centerX: o.centerX ?? bounds.centerX, feetY: o.feetY ?? bounds.feetY };
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
