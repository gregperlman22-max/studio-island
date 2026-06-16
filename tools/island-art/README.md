# Island ground art — alignment kit

Build-time reference assets for producing the **Home Island ground illustration**
(the warm-storybook art that will replace the code-drawn terrain) so the painted
ground lines up with the existing **walk-grid** on the first try.

These are **tools, not app code.** Nothing here is imported by the scene engine
or shipped in the build. The scene engine (`packages/island-scene/`) is untouched.

## What each file is

| File | What it is | How to use it |
| --- | --- | --- |
| `island-silhouette.png` | The exact island shape the engine draws today (`islandOutline(landCells)`), filled solid on transparent. 4096×2154. | **Primary shape lock.** Drop into your image tool as a shape reference — paint land only inside the solid area; everything outside is sea. |
| `island-silhouette-punched.png` | Same silhouette with the 7 zone footprints marked as red diamonds. | **Painting reference.** Keep those clearings OPEN (flat ground only) — the landmark art layers on top there, and the engine blocks walking on them. |
| `island-placement-guide.png` | Sand-filled island + faint walk-grid + colored zone footprints + a path "spine" + spawn/dock crosshairs. | **Placement map.** Shows where each landmark and path should sit. |
| `gen.mjs` | The generator that produces all three PNGs and prints the registration numbers. | Run it to regenerate (see below). |

## The registration math (how art pins to the engine)

Everything is anchored through the engine's isometric projection
(`packages/island-scene/src/render/iso.ts`):

```
tileToScreen(gx, gy) = { x: (gx - gy) * 32, y: (gx + gy) * 16 }   // world pixels
```

The generated images map world pixels to image pixels with a fixed origin + scale:

- **Image size:** 4096 × 2154 px (aspect ≈ 1.90:1)
- **Island world footprint:** 1952 × 960 world px
- **Transparent safe margin:** 70 world px on all sides
- **Origin** (world coordinate at image pixel `(0,0)`): **(−774, 186)**
- **Scale** `S` (image px per world px): **1.958** ( = 4096 ÷ 2092 )

To find where any grid square `(gx, gy)` lands in the image (its tile center —
where the avatar's feet sit):

```
img_x = ( (gx - gy) * 32  - (-774) ) * 1.958
img_y = ( (gx + gy) * 16  + 16  - 186 ) * 1.958
```

`gen.mjs` prints these numbers plus the image-pixel center of every zone and the
spawn point each time it runs, so they never go stale.

> Note: if you generate the final art at **4096×2048** instead of 4096×2154
> (image tools prefer round sizes — see the planning notes), only the vertical
> margin changes; the island content and horizontal registration are identical,
> and the vertical origin shifts by ~53 px. Re-pinning is trivial.

## Regenerating

The generator is a faithful, dependency-free port of the engine's
`defaultLayout.ts` (`isLandCell` → `landCells`, zone positions) and
`render/coast.ts` (`islandOutline`). It uses only Node built-ins (a hand-rolled
PNG encoder via `node:zlib`), so there is nothing to install.

```sh
node tools/island-art/gen.mjs
```

It writes the three PNGs next to itself and prints all registration numbers.

**If the island ever changes** — i.e. `landCells` (the silhouette formula) or the
zone layout in `packages/island-scene/src/defaultLayout.ts` — update the matching
constants at the top of `gen.mjs` (`isLandCell`, `zones`, `spawnPoint`), rerun it,
and the silhouettes, placement guide, and registration numbers all update
together. Keep `gen.mjs`'s copies of those constants in sync with the engine;
they are intentionally duplicated here so this tool stays standalone.
