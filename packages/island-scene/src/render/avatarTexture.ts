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
  ctx.putImageData(image, 0, 0);
  return Texture.from(canvas);
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
