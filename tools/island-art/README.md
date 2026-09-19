# Home Island art pipeline

Replaces the procedurally-drawn Home Island terrain with a finished illustrated
island. This folder holds the **source art**, the **processing scripts**, and
the **cleaned transparent PNG** the engine renders as its ground sprite.

## Core avatar delivery

- `source/core-avatars/*.png` — the six approved Island Friend illustrations as
  delivered (~6.5 MB total, up to 1086x1448). **Source art only.** This folder
  is outside `public/`, so none of it is ever downloaded by a browser or copied
  into the built site.
- `optimize-core-avatars.mjs` — builds the runtime files into
  `packages/island-scene/public/avatars/core/*.webp` (~492 KB total, a 92.5%
  reduction). Re-runnable: `npm install && node optimize-core-avatars.mjs`.

  The art is never redrawn — one uniform downscale plus a WebP encode with
  alpha. The scale is chosen per character so each one's CHARACTER (not its
  canvas) lands at ~780px tall, and is never allowed to upscale: Daisy and Remy
  ship on much smaller canvases and are re-encoded at native size rather than
  enlarged. Because the scale is uniform, the normalised content bounds the
  renderer anchors on are unchanged, so feet alignment and in-world height are
  untouched; the script asserts that drift stays under a pixel and fails if the
  geometry moves. Do not add a trim/crop step — cropping the transparent
  padding WOULD move those bounds.

## Files

- `source/home-island-raw.png` — original delivered art (1536×1024 RGBA, warm
  storybook isometric island with a painted foam/beach ring, on a black
  vignette + painted teal water).
- `home-island.png` — **the deliverable**: island + foam ring on full
  transparency, same 1536×1024. This is what gets pinned into the world.
- `process.mjs` — the background knockout (see below). Reproducible: re-run to
  regenerate `home-island.png` from the source.
- `analyze.mjs` — prints pixel samples across the raw art (used to design the
  knockout discriminator).
- `preview-on-magenta.png`, `preview-on-checker.png` — review composites so the
  cutout is visible against a non-black background.

## M1 — background knockout (`process.mjs`)

The raw art already carries an alpha channel: the corners and outer water are
`alpha≈0`, so the "black background" is really the viewer compositing the
semi-transparent art over black. The actual work is removing the **teal water
halo** (semi-transparent cyan-green pixels ringing the island) and any dark
vignette, while keeping the **warm sandy foam ring** and the coastal foliage.

Discriminator (measured from `analyze.mjs`):

- **Foam / sand** is *warm* — `R > G` (e.g. `253,228,142`).
- **Water** is *cool teal* — `G ≥ R` (e.g. `176,214,145`).
- **Foliage** we keep is fully opaque (`alpha = 255`).

Method: flood-fill inward from the four image borders, deleting a pixel only
when it is **not fully opaque** *and* **cool or very dark**
(`alpha < 250 && (G ≥ R-3 || luma < 90)`). Warm sand and opaque foliage act as
walls, so the painted foam ring and the trees sitting right on the coast are
preserved, and only the connected exterior water/vignette is cleared. Because
it is a connected flood from the border, interior grassy clearings are never
touched.

Result: 1536×1024 transparent PNG, opaque content bbox `x[82..1489] y[87..863]`
(content center ≈ `(786, 475)`). Coastline edges fade softly with no teal
fringe.

```bash
cd tools/island-art
bun install          # sharp
node process.mjs     # source/home-island-raw.png -> home-island.png + previews
```

## Registration (for later milestones)

The engine projects grid cell `(gx,gy)` to world pixels via `iso.ts`:

```
tileToScreen: x = (gx - gy) * 32, y = (gx + gy) * 16   (TILE_W=64, TILE_H=32)
tileCenter:   + (0, +16)
```

M2 samples `home-island.png` opacity and maps it back through `screenToTile`
(using a chosen art-origin + scale) to regenerate `landCells` so the walk-grid
matches the painted coastline. M4 pins this PNG into the `world` container with
that **same** origin + scale, guaranteeing the painted shore and the invisible
walk-grid line up.

## Treehouse exterior — back/front layer pair (`treehouse-layers.mjs`)

Cuts `source/treehouse-master-2026-09-19/candidate/treehouse-master-1024.png`
into `packages/island-scene/src/assets/landmarks/treehouse.webp` (back) and
`treehouse-front.webp` (front) with the traced ownership mask in
`treehouse-front-mask.json` (master pixel coordinates; polygons, stroked
polylines, circles; rasterised crispEdges so each pixel has one owner). Pixels,
canvas and geometry are preserved; the script verifies that front-over-back
reproduces the master exactly — in memory and after the lossless WebP round
trip — and refuses to write otherwise. `node treehouse-layers.mjs --preview`
also writes review overlays (front alone, mask boundary at 2×, recomposition).
Both layers share the master's anchor and scale; the front layer is never
trimmed, centred or measured on its own.
