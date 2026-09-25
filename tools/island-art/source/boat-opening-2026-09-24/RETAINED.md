# Retained on 2026-09-24 — approved boat opening, sources for the runtime

The "Engage Boat" handoff, retained so the runtime art can be rebuilt from its
own sources. Every retained file verifies against the package's two manifests
(`SHA256SUMS.txt` at the top, `source/SHA256SUMS.txt` inside).

**Nothing here ships.** Outside `public/` and `src/assets/`; nothing imports it.
The runtime files are written by `tools/island-art/boat-opening-layers.mjs`
into `packages/island-scene/src/assets/opening/`:

| source (`source/assets/`) | runtime                                       | how |
|---------------------------|-----------------------------------------------|-----|
| `environment.png` 1671×941 | `opening-environment.webp`                   | lossy q86, same size |
| `boat.png` 1254×1254       | `boat-back.webp` + `boat-front.webp`         | lossless pair, one owner per pixel (`boat-front-mask.json`); saved pair verified to recompose the master exactly, or the finals are left untouched |
| `captain-study.png`        | `captain-pete.webp`                           | lossy q90, alpha 100, same size — this opening only |
| `doug-reference.png`       | —                                             | reference only: the runtime rides the child's own selected Friend through the avatar path |

`scene.mjs` and `scene-layout.json` are the preview's reference implementation
and layout (start / end placement, 5.5 s ease-out approach, rocking). The
runtime (`render/BoatOpeningView.ts`, `render/openingArt.ts`) takes its
placement from them, and uses the preview's illustrative timing as its own
chosen timing (subject to runtime review; the approval covers the visual
direction, not durations). Neither file is product code. The layout's
`frontMask` was a starting suggestion — the traced mask is
`tools/island-art/boat-front-mask.json`.

Not retained (preview media, identified by hash in `SHA256SUMS.txt`):
`Boat-Preview.html`, `Boat-Approach.mp4`, `Boat-Approach.gif`, `stills/*`.
