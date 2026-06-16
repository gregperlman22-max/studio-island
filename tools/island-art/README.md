# Home Island art pipeline

Replaces the procedurally-drawn Home Island terrain with a finished illustrated
island. This folder holds the **source art**, the **processing scripts**, and
the **cleaned transparent PNG** the engine renders as its ground sprite.

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
