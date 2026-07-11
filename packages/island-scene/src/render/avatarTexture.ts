import { Texture } from "pixi.js";

/**
 * Character-art loader (avatars + guides).
 *
 * The art ships as true-RGBA WebP cutouts, matted OFFLINE by
 * tools/island-art/matte-characters.mjs (audited + signed off July 2026).
 * This loader therefore just decodes the image and hands Pixi a texture.
 *
 * HISTORY: it used to flood-fill the baked background out at runtime and
 * defringe the silhouette toward ink. That knockout assumed bold cel
 * outlines; the plush-style art has none, so pale fur keyed out (the Panda
 * face / Polar Bear torso defect) and the ink defringe drew a dark halo.
 * Both passes died with the offline matte — do not reintroduce them here;
 * new character art goes through the offline script instead.
 *
 * Every consumer sizes by texture ratio (height/width fractions), so the
 * source resolution is free to change with the art pipeline.
 */
export async function loadAvatarTexture(url: string): Promise<Texture> {
  const img = await loadImage(url);
  return Texture.from(img);
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
