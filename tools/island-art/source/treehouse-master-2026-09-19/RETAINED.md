# Retained on 2026-09-19 — master + layer handoff, as received

The package exactly as received; all eight files verify against its
`SHA256SUMS.txt`. Source only: nothing here ships and nothing imports it.

**What was cut from it, and how.** `tools/island-art/treehouse-layers.mjs`
splits `candidate/treehouse-master-1024.png` into the runtime pair
`packages/island-scene/src/assets/landmarks/treehouse.webp` (back) and
`treehouse-front.webp` (front) — plus `treehouse-full.webp`, the uncut master
on the same canvas, which is the runtime's fallback when either half of the
pair fails to load (the back alone would be the master with holes) — using the traced ownership mask in
`tools/island-art/treehouse-front-mask.json` — polygons, stroked polylines and
circles in master pixel coordinates, rasterised with `shape-rendering=
"crispEdges"` so every pixel has one owner. Original pixels, canvas and
geometry are preserved; the script verifies front-over-back reproduces the
master in alpha and RGB (0 mismatches) in memory, then writes all three
outputs to temporary files, re-reads them and checks again — a saved-file
mismatch exits non-zero and leaves the previous finals untouched
(`TREEHOUSE_LAYERS_INJECT_FAULT=1` proves that branch). libvips' decode cache
is off in the script so the re-read is a real read. Re-run it to regenerate the
pair; `--preview` writes the overlays used for review.

**`reference/foreground-intent-UNREGISTERED.png` was not used** for any pixel
or coordinate. The mask was traced against the master's own pixels off 3×
gridded crops. The study served only to confirm which pieces were intended:
the viewer-right stair rail (rope, five posts, the round plaque, the two
square handrail beams), the nearest root buttress, the two rocks at its foot
and the lowest leaf clusters.

**Front layer contents (31,841 px of the master's 494,867 opaque px):**
near rail rope + posts 1–5 + plaque + handrail beams; nearest root from the
trunk crease to its tip; large rock and small rock; three low leaf clusters.
Stair treads, the far (left) rail, trunk, balcony, cabin and canopy are all in
the back layer. Internal mask edges: the root is cut from the trunk along the
visible crease (~y 700–735); the rail rope band is 11 px, the beams 15 px, so
a sliver of tread edge behind the rope between posts 2 and 3 travels with the
front layer — visible only if a Friend passes exactly there.

**Anchor/scale used at runtime** (`render/zones.ts`): the master's alpha > 16
bbox bottom-centre (0.5039, 0.8984), contentBox [110, 59, 922, 920], contentH
861, scale 0.74 carried over from the previous art. Both layers use the same
values by construction — the front layer is never centred, trimmed or measured
on its own.
