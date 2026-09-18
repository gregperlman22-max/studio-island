# Olive — Treehouse guide pose candidates

Prepared from the recovered **Olive the Treehouse Guide Concept Sheet.png**, created September 14, 2026. The approved source concept is included unchanged under reference/. These poses preserve its warm brown/cream owl, amber eyes, teal scarf, leaf-emblem satchel and rolled map.

## Contents

- source/olive-neutral.png: high-resolution resting pose.
- source/olive-encouraging.png: open wing toward viewer right, friendly speaking expression; corrected to include the full wings.
- source/olive-listening.png: attentive head tilt and closed beak.
- runtime/olive-<pose>.webp: 480 x 640 RGBA exports, lossless encoding, matched visible height of approximately 512 px and near-common foot baseline.
- pose-metadata.json: measured canvas/content bounds and approximate foot-region anchor suggestions.
- reference/olive-approved-concept.png: the recovered approved concept sheet. Its illustrated text, UI, quest copy and cast are references, not new implementation requirements.

The included preview-on-cream.png shows the actual WebP exports composited on cream for visual inspection; that background is not part of the runtime sprites.

## Status and scope

These are **new pose candidates derived from an approved design**, prepared for local integration and visual review. They have not yet been accepted in the running game. No repository was changed, no files were pushed, and no game tests or real-device checks were run here. This pack does not change EC-2 status and does not supply the missing Treehouse exterior layers or Doug's final animation.

The reference should remain outside public runtime assets. Only the three runtime WebP images belong in the game's asset pipeline. Suggested paths from the existing asset spec are public/guides/olive/olive-neutral.webp, olive-encouraging.webp and olive-listening.webp; confirm against the actual current registry before integration.

## Export and verification

Image generation produced each character cutout using the approved concept as reference; the neutral pose was the identity reference for the other poses. Exports were prepared with FFmpeg: a crop around the visible silhouette plus edge margin, proportional resampling and transparent padding. No character was repainted by the export step. Original generated PNGs are preserved.

Verified all three exports decode as 480 x 640 RGBA, contain transparent pixels, and have visible silhouette margins on every side. Checked pose identity and appearance visually. A visible-content threshold of alpha > 32 was used for measurements; faint generated edge pixels may extend beyond those bounds. Reuse the repository's normal offline matte/optimization checks before final runtime acceptance. Do not apply an opaque background.

The extended encouraging wing shifts the whole-image bounding-box center. A shared bbox-center anchor alone may cause Olive to move sideways when changing poses. The metadata supplies approximate foot-region centers, but these are NOT verified runtime pivot constants. Confirm how the current renderer maps content bounds and PIVOT_OVERRIDES and register all three poses to the same standing location. Do not animate a continuous transition by cycling these three discrete gesture images.

## Integration check

Use the current S-89 checkout, preserving EC-2 and the separate art candidate. Add pose selection only where it serves the established greeting/Quest Table interaction. Verify resting, encouraging and listening at the same in-room scale; no sideways hop, floating feet or clipping of the extended wing. Check contrast over the actual Treehouse painting and readable expression on a 390 px simulated phone, then identify remaining real-device checks. Keep the selected Friend unchanged.

No redesign of other eight guides or island-wide rollout. Keep existing fallback behavior for missing/loading artwork until the new poses are verified. Report the actual asset paths, candidate SHA and screenshots rather than claiming these files are a proven drop-in replacement.

## Pending review dependencies

The available EC-2 report identifies fe860f0, and the subsequent art report identifies e9cec0812138b5e85cfa143d440d9119433f91c9. Their actual review packets and the updated ASSET-SPEC-S89.md containing section 10 have not been supplied in this conversation. Request/attach those existing files; do not regenerate implementation or rerun tests just to recover the handoff.
