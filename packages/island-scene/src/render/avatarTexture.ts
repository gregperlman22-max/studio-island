import { Texture } from "pixi.js";

/**
 * The illustrated animal PNGs ship as RGB with NO alpha channel — a solid
 * light background is baked in. Drawn directly, each avatar would carry a white
 * box around it on the island + in the boat. This loader knocks that background
 * out to transparency before handing Pixi a texture.
 *
 * Strategy: flood-fill inward from the image border, clearing every pixel that
 * stays within tolerance of the sampled corner colour. Because the animals are
 * drawn with a bold dark outline, the fill stops at that outline — so interior
 * light areas (a panda's belly, a polar bear's coat) are preserved while only
 * the connected background is removed. The image is also downscaled (the avatar
 * renders small) which keeps the per-image pass fast and the GPU upload light.
 */

const MAX_DIM = 320;
/** Per-channel-distance² tolerance for "is this the background colour?". */
const TOL2 = 60 * 60;

export async function loadAvatarTexture(url: string): Promise<Texture> {
  const img = await loadImage(url);
  const scale = Math.min(1, MAX_DIM / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return Texture.from(canvas); // no 2D context — fall back to opaque

  ctx.drawImage(img, 0, 0, w, h);
  const image = ctx.getImageData(0, 0, w, h);
  keyOutBackground(image, w, h);
  defringeEdges(image, w, h);
  ctx.putImageData(image, 0, 0);
  return Texture.from(canvas);
}

/** Outline ink colour — matches the bold dark outline baked into the animal art. */
const INK_R = 0x23, INK_G = 0x20, INK_B = 0x1c;

/**
 * Clean up the silhouette after the background knockout. The flood-fill leaves a
 * 1px ring of anti-aliased pixels (a blend of the dark outline and the light
 * background) that survives the colour cut and reads as a pale "white fringe"
 * halo around the animal. This pass walks the edge pixels — every still-opaque
 * pixel that borders transparency — and blends them firmly toward the outline
 * ink. That swallows the fringe into a crisp dark rim, so the avatar sits clean
 * against the boat / island instead of carrying a bright outline.
 */
function defringeEdges(image: ImageData, w: number, h: number): void {
  const d = image.data;
  // Snapshot alpha so darkening earlier pixels doesn't change edge detection.
  const alpha = new Uint8Array(w * h);
  for (let p = 0; p < w * h; p++) alpha[p] = d[p * 4 + 3];

  // Off-canvas is NOT a silhouette edge: if the knockout bailed (no pixels were
  // cleared) we must stay a no-op rather than ring the whole frame in ink.
  const transparent = (x: number, y: number): boolean =>
    x >= 0 && y >= 0 && x < w && y < h && alpha[y * w + x] === 0;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = y * w + x;
      if (alpha[p] === 0) continue; // already background
      const edge =
        transparent(x - 1, y) || transparent(x + 1, y) ||
        transparent(x, y - 1) || transparent(x, y + 1);
      if (!edge) continue;
      const i = p * 4;
      // Blend toward ink (0.65 ink / 0.35 original): masks pale fringe pixels
      // while keeping a hint of the art's own colour at the rim.
      d[i] = Math.round(d[i] * 0.35 + INK_R * 0.65);
      d[i + 1] = Math.round(d[i + 1] * 0.35 + INK_G * 0.65);
      d[i + 2] = Math.round(d[i + 2] * 0.35 + INK_B * 0.65);
    }
  }
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

/** Border flood-fill: clear alpha on background-coloured pixels reachable from
 *  the edge. Leaves enclosed (outlined) interior regions untouched. */
function keyOutBackground(image: ImageData, w: number, h: number): void {
  const d = image.data;

  // Sample the four corners; use their average as the background colour. If the
  // corners disagree wildly the background isn't a clean flat colour, so bail
  // and leave the image opaque rather than chew into the art.
  const corners = [0, (w - 1) * 4, (h - 1) * w * 4, ((h - 1) * w + (w - 1)) * 4];
  let br = 0, bg = 0, bb = 0;
  for (const c of corners) { br += d[c]; bg += d[c + 1]; bb += d[c + 2]; }
  br /= 4; bg /= 4; bb /= 4;
  for (const c of corners) {
    if (dist2(d[c], d[c + 1], d[c + 2], br, bg, bb) > TOL2 * 1.5) return;
  }

  const visited = new Uint8Array(w * h);
  const stack: number[] = [];
  const push = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const p = y * w + x;
    if (visited[p]) return;
    visited[p] = 1;
    stack.push(p);
  };
  for (let x = 0; x < w; x++) { push(x, 0); push(x, h - 1); }
  for (let y = 0; y < h; y++) { push(0, y); push(w - 1, y); }

  while (stack.length) {
    const p = stack.pop()!;
    const i = p * 4;
    if (dist2(d[i], d[i + 1], d[i + 2], br, bg, bb) > TOL2) continue; // hit the art outline
    d[i + 3] = 0; // background → transparent
    const x = p % w;
    const y = (p - x) / w;
    push(x + 1, y); push(x - 1, y); push(x, y + 1); push(x, y - 1);
  }
}

function dist2(r: number, g: number, b: number, r2: number, g2: number, b2: number): number {
  const dr = r - r2, dg = g - g2, db = b - b2;
  return dr * dr + dg * dg + db * db;
}
