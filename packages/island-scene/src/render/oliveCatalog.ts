import { guideFileUrl } from "./guideCatalog";

/**
 * Olive's poses — the Treehouse guide's three expressions, integrated only
 * where the established greeting / Quest Table interaction calls for them.
 *
 * The art is the 2026-09-18 candidate pack derived from Olive's approved
 * concept (source retained at tools/island-art/source/olive-poses-2026-09-18/).
 * Runtime files live at public/guides/olive/olive-<pose>.webp, 480 × 640 RGBA,
 * 512 px of content, feet at the content bbox bottom — exactly the canvas
 * ASSET-SPEC-S89.md §2 asks for.
 *
 * THESE ARE DISCRETE GESTURES, NOT ANIMATION FRAMES. Nothing here or in any
 * render site tweens between them; a pose changes when the beat changes.
 *
 * Fallback: any pose that fails to load resolves to the generic guide owl
 * (Owl.webp) the way it did before these existed — see SceneRenderer.olivePose.
 */
export const OLIVE_POSES = ["neutral", "encouraging", "listening"] as const;
export type OlivePose = (typeof OLIVE_POSES)[number];

/** Basename of a pose's runtime file — also the PIVOT_OVERRIDES key. */
export const oliveFile = (pose: OlivePose): string => `olive-${pose}.webp`;

export function olivePoseUrl(pose: OlivePose): string {
  return guideFileUrl(`olive/${oliveFile(pose)}`);
}
