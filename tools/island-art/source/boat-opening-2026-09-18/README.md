# Engage Island — boat opening concept handoff

Date: 2026-09-18
Status: Greg approved the visual direction and three concept moments. These are flattened art-direction references, not production assets or a working animation. The corrected arrival image is the only arrival candidate included.

## Included
- 01-approach.png: recognizable destination, foreground boat and Friend, dock and island beyond.
- 02-alongside-dock.png: boat slows beside the landing; closer view of the route inland.
- 03-arrival-corrected.png: Doug stands upright on two feet on the dock; Captain Pete remains aboard; boarding plank connects boat and landing.
- CLAUDE-CODE-PROMPT.txt: retain this direction while completing the current Olive checkpoint.
- SHA256SUMS.txt: checksums for package contents other than this manifest.

## Direction to preserve
Warm painterly rendering, tactile timber, rounded shapes, fresh greens and blues, soft directional afternoon light, recognizable sun-emblem Welcome Dock. Selected Friend is large enough to read. Depth comes from foreground boat/character, middle-distance dock and softer scenery beyond. The path inland is open and inviting. Retain the approved island spacing and landmark identities.

These images depict Doug as the example selected Friend. Runtime must show the child's actual selected Friend, with no Doug baked into backgrounds. Captain Pete is shown for scene continuity; this is not an authorization to roll out redesigned guides.

## Proposed movement, for later implementation
1. Approach: boat moves toward the dock; subtle rocking, a gentle wake, restrained sail motion. Small character idle movement keeps the scene alive.
2. Docking: decelerate smoothly alongside the landing. Wake fades; boat settles. Keep faces visible and a coherent boat-to-dock scale.
3. Arrival: show a believable short step across a stable boarding connection, then the selected Friend standing on the landing. Continue toward the Island with spatial continuity through the same dock.

Choose final timing in the real running experience. Do not infer timing from slow software-rendered review recordings. Preserve existing skip, audio and reduced-motion behavior; reduced motion should avoid continuous camera travel while reaching the same destination.

## Production work and visual checks still outstanding
These independently generated frames are not geometrically registered. Do not crossfade or morph them as a substitute for implementing movement. Camera, landmark positions, dock proportions, boat orientation and shoreline must be reconciled to one shared scene before animation. The current compositions contain small differences and some boat cropping; rebuild sufficient offscreen coverage for responsive framing.

Separate the environment, water, boat back/front layers, sail, dock occluding pieces, selected Friend and Captain Pete as needed. Produce clean source assets at the runtime camera/scale; do not claim the flattened keyframes supply those layers. The character must correctly pass behind the boat's near hull and land on the dock surface without clipping through posts, rope or the boarding plank. The final arrival frame corrects an earlier three-grounded-paw generation error; do not revive the discarded image.

The first frame's wake and highlights remain stronger than the intended calm water. Carry forward the quieter later-frame direction and soften excess white foam/gold sparkle. Maintain calm turquoise water with broad quiet areas, restrained ripples and shoreline detail.

Validate phone portrait, tablet and desktop composition: selected Friend and landing remain readable; canopy framing respects the chosen shot; essential action stays visible. Verify actual motion and timing in a real browser/device when available. Still images do not prove animation quality.

## Scope and cadence
Current authorized Claude Code task remains Olive pose integration after accepted EC-2 correction 25113286e78fdca3a06f08ff918e45ede817ad0e (tree d816afb91481a846e96654b54b8bbf3d7fabd94f). Boat concepts can be retained now without interrupting that checkpoint. This handoff does not authorize runtime boat changes, EC-3 expansion, other-guide rollout, island-wide replacement, pushing, merging or deploying. No new S-ID or broad audit.

The layered approved Treehouse exterior and Doug-first walk-cycle production remain outstanding and are not replaced by this concept work.
