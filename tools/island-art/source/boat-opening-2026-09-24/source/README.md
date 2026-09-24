# Engage Island — boat approach and docking batch

Status: new art/motion study for Greg's review; not accepted or integrated. Built in ChatGPT. No Claude model, game candidate SHA or test count is claimed.

## What this batch delivers
A single 1671 x 941 environment plate, one complete empty sailboat with actual alpha, a separate Captain Pete study, and the unchanged approved Doug neutral back-view reference. A 6.5-second software-rendered preview approaches and slows beside the same dock. There is no morph between independently generated scenes. The boat transform carries both passengers, and a traced near-hull clipping path occludes their lower bodies. The preview can hide Doug to demonstrate he is not baked into the boat or background.

The environment preserves the approved sun gate, timber, shoreline, treehouse, art workshop and lighthouse direction. Water has less wake/foam than the earlier approach reference but still contains substantial painted ripple detail. The environment is a new candidate painting, not a pixel-preserving edit or a new approved island geography.

## Review assessment
The separate boat and environment support a coherent approach and readable docking composition. The characters sit behind the hull rather than floating on top of it. The portrait panel follows the same boat through the same painting; it preserves both passengers and the landing edge while cropping the wider scenery and sun gate. This is a useful composition/motion checkpoint, not production visual acceptance.

## Explicit limitations
- Approach and docking only. No boarding-plank deployment, disembarkation, walking, arrival greeting or handoff into the live Island. Doug's rejected walk cycles are not used.
- Doug's back-view reference is static. Runtime must display the actual selected Friend. This preview does not validate the runtime avatar pipeline or other characters.
- Captain Pete is a newly generated cutout study based on the retained concept, not a separately approved redesign. Details differ from the concept, including eye/badge treatment. No other-guide rollout.
- Boat is a full source sprite. The near hull is redrawn through a polygon for prototype occlusion. It is NOT a verified, exclusive back/front production pair. Edge antialiasing and mask tracing still need close runtime review.
- Sail/pennant are attached to the boat sprite; no independent sail animation. Shoreline, water and dock are painted together. Wake is a restrained code-drawn placeholder. No dock foreground occluder has been extracted.
- A physical boarding connection and dock contact points still need to be resolved before the Friend can step ashore. Do not treat the final boat transform as proof of a walkable connection.
- Prototype controls implement preview-only pause/reset/skip/reduced-motion still. Existing game audio, skip and reduced-motion behavior have not been exercised or altered.
- Static generated frames were visually inspected. MP4/GIF were encoded from 78 rendered frames at 12 fps over 6.5 seconds. No live browser playback or real-device testing performed. HTML syntax and ZIP integrity were checked. Preview viewport sizes are panels, not device-test evidence.

## Files
Boat-Preview.html — self-contained interactive preview, embedded compressed images.
Boat-Approach.mp4 — 836 x 470 encoded preview, 12 fps.
Boat-Approach.gif — small looping review export; loop resets the approach intentionally.
assets/ — full-resolution unmodified source PNGs.
scene.mjs / scene-layout.json — proposed transforms, mask and framing in source coordinates.
stills/ — approach, docking, settled, portrait, Friend-hidden and reduced-motion examples.
GENERATION-PROMPTS.txt — retained prompts (built-in image generation).
IMPLEMENTATION-NOTES.md — concrete dependencies for the later bounded Claude integration.
SHA256SUMS.txt — all source-package file hashes.

## Scope
No game repository, acceptance ledger, S-ID, runtime asset or published experience changed. EC-1, EC-2, Olive and Treehouse exterior acceptance remain untouched. Doug's walk remains unfinished. This art review does not start EC-3, authorize a guide rollout or authorize push/merge/deployment.
