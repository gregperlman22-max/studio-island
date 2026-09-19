# S-89 Treehouse exterior — master candidate and layer-extraction handoff

2026-09-19. New candidate derived from the approved Treehouse concepts. This package supplies a complete character-free transparent master, NOT a verified aligned back/front pair. No runtime change has been made here. The generated foreground study drifted spatially; it is reference only and must never be used as a runtime layer.

## Files
- source/treehouse-master-original.png — original generated cutout, 1254x1254 RGBA.
- candidate/treehouse-master-1024.png — same full canvas scaled to 900x900 and padded into 1024x1024 at offset (62,40), no crop or repaint.
- candidate/treehouse-master-1024.webp — lossless export of that PNG, verified matching alpha and visible RGB pixels.
- reference/foreground-intent-UNREGISTERED.png — illustrates intended near-side rail/root/leaf selection only. NOT aligned; NOT runtime-ready. Its geometry must not be copied.
- metadata.json — measured bounds and export transform.
- CLAUDE-CODE-PROMPT.txt — bounded pixel-preserving extraction and local Treehouse integration task.
- SHA256SUMS.txt — package manifest.

## Visual direction
Whole canopy with transparent margin, prominent usable cabin, blue-green shingles, leaf doorway, wraparound balcony, curved shallow-riser stairs, rope rails, telescope, leaf pennant, lanterns and vines. Warm painterly finish supersedes the older cel wording in the pre-correction asset spec. No baked-in character, sky, surrounding landscape or ground shadow. The telescope is visible on an open portion of the balcony; the approved sheltered-lookout character is less explicit in this candidate and remains part of in-context visual review. Do not call every architectural detail finally accepted.

The 1024 master has alpha>16 bounds [110,59,922,920], with right/bottom exclusive. Content height 861px, normalized 0.8408203125. Bounding-box bottom-centre anchor suggestion: (0.50390625,0.8984375). This is a starting placement anchor, not a measured navigation/stair-entry coordinate. Match the existing runtime anchor convention and evaluate actual ground contact. Existing layout and footprint stay fixed. The camera is based on the approved elevated three-quarter references; exact registration to the old runtime painting has not been verified.

## Why the foreground study is not usable
Two image-generation extraction attempts changed rail/root positions. Both cannot be called aligned layers. Only the later study is included to explain intent, clearly labeled. The reliable next operation is a deterministic mask cut from the SAME 1024 master: original colors and geometry retained, each selected foreground pixel assigned to the front layer and every remaining pixel to the back. No new art generation is required for that cut. Do not use the study's alpha as a mask without tracing against the master; it is not registered.

## Layer contract
Both final layers: 1024x1024, RGBA/WebP, common untrimmed canvas, SAME anchor and scale computed from the master/combined content. Never independently centre, trim or normalize the foreground by its own bounding box.
- Back: canopy, cabin, trunk, balcony and stair flight/treads, minus the selected foreground components.
- Front: near/viewer-right stair rail and posts/fascia, nearest root buttress and lowest foreground leaves that should hide a Friend passing behind them. Avoid entire broad rectangles that include stair treads or blank space.

A per-pixel ownership mask permits exact recomposition: back+front with no intervening Friend must reproduce the master in alpha and visible color. Keep original antialiasing on the outer silhouette. Inspect internal mask edges at runtime scale. The extraction must not introduce duplicated rails, holes, visible seams or recoloring.

The foreground layer must participate in appropriate local depth ordering. A single globally topmost sprite is not an adequate general solution. Show the selected Friend in front of and behind the intended local pieces while preserving unrelated world depth behavior.

## Validation already done here
Inspected the full generated master and prepared 1024 export. Checked true alpha, full-canvas bounds, transparent padding and lossless WebP equivalence for visible pixels. No in-game integration, device validation, occlusion validation or final visual acceptance is claimed. The generated study fails alignment by visual inspection and has been excluded from runtime candidates.

## Scope
Olive integration is accepted at 1592a98edbee267b13da4e8a36e977f347e40740, tree c03af1f66fa2a0a108bac3255b908ebfb31b5406. This handoff advances only the Treehouse exterior toward its local integration checkpoint. Preserve newer docs/status commits if present. Doug-first walking art remains outstanding; boat concepts remain retained only. No EC-3, other-guide rollout, global navigation overhaul, push, merge, deployment, new S-ID or audit.
