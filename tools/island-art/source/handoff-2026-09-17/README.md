# Engage Island — approved visual direction and Treehouse handoff

Prepared September 17, 2026, from Greg's approvals in this conversation.

## Start here

Greg approved the consolidated island overview with “looks good,” then authorized packaging these references for Claude, starting implementation with the Treehouse area. This package is an art-direction handoff. No repository changes, push, merge, deployment, game testing or production-asset acceptance occurred while preparing it.

Read 04-claude-code-handoff.txt, then inspect all three PNGs. They are original generated images, not resized exports. Earlier rejected versions and failed seating studies are intentionally excluded.

## Reference hierarchy

1. **01-approved-island-overview.png** controls the overall composition, landmark locations, open space, elevated perspective, warm palette, shoreline and water treatment. Preserve the approved larger Treehouse room/balcony and smaller dock gateway. The full Treehouse canopy must remain visible in an overview.
2. **02-treehouse-dock-scale-study.png** controls the Treehouse's frequent lower stair risers, curved stair approach, clubhouse/balcony details and the comparison between the Friend and entrances. It is a close-up study, not a second map layout. Its framing crops the tree; do not use that crop to justify cropping the overview canopy.
3. **03-campfire-arcade-scale-study.png** controls the lower campfire seating and classic arcade cabinet/control proportions. The overview made the cabinets too small; this close-up takes precedence for their usable size. Doug stands beside the bench because generated seated poses did not establish feet-on-ground contact. Seated animation remains unverified.

These are visual targets, not exact construction dimensions. Do not interpret requested percentage changes in earlier generation prompts as measured implementation specifications.

## Approved direction

- Audience: children ages 5–12. The world should be inviting, distinctive and dimensional, with readable places to explore.
- Preserve the water shown in the approved overview: turquoise shallows, visible submerged rocks, soft shoreline foam and deeper blue offshore. Do not apply another general water or lighting makeover.
- Keep the expanded island spacing and open dock-to-central-clearing approach. No further island enlargement is requested.
- Use gentle perspective. Depth comes from overlaps, visible building sides, contact shadows and terrain elevation, with modest distance scaling. Do not make distant landmarks tiny to simulate depth.
- Treehouse: prominent usable room and wrapping balcony integrated with a living trunk; leaf doorway, blue-green roof, sheltered lookout/telescope, curved approach and shallower steps. The whole canopy stays inside overview framing.
- Welcome Dock: reduced sun gateway, generous landing and existing dock length. It should feel near without overpowering inland buildings.
- Campfire Circle: lower carved curved benches, open entrance and space around the stone fire ring.
- Arcade Cove: handcrafted wave-roof pavilion and old-school upright cabinets, recessed screens, joysticks and physical buttons. Greg explicitly rejected futuristic stations. Controls should be comfortably reachable.
- Other visible landmarks retain the overview designs: customization-oriented Star Market, bright Art Hut, coastal lighthouse, shaded Calm Beach and willow-framed Lazy Lagoon.
- Doug is a scale reference. Do not bake him into scenery or replace the selected Friend with a fixed dog. Reference drawings are not a new authoritative sprite sheet.

## First implementation boundary

Start with the Treehouse exterior/approach and the assets directly needed to support it. Preserve the accepted Quest Table interactions, selected-Friend behavior, travel/discovery flow and arrival greeting. Do not roll the art across the island or redesign other interiors in this chunk.

Use the current checkout and current checkpoint status. The last evidence verdict visible in this art conversation was EC-1 accepted at 5b1c5e9c8a6c2c7ee3dc8c5d8edc07422189679e, tree e20ac2e911d59b78fd0cca08428aab1224a8117a; supplied logs recorded 269 tests, clean typecheck and a successful demo build. This handoff does not claim a fresh rerun. EC-2 was authorized and its evidence was pending in this conversation. A later candidate was reported in preview discussion, but no EC-2 verdict is established here. Do not reset a newer checkout to the older accepted commit.

If EC-2 is still in progress or awaiting its checkpoint, finish/preserve its evidence before creating a distinct incremental art candidate. Do not fold an unreviewed visual change into the EC-2 evidence retroactively. If EC-2 has already been accepted elsewhere, record the actual accepted SHA and proceed. No new S-ID, broad audit, planning cycle or approval stage is requested.

## Production translation and unresolved details

- These opaque overview and comparison images are concept references, not ready-made transparent sprites, layered environments, collision geometry or texture atlases. Do not stretch the overview to fit the existing map or claim a simple file replacement.
- Inspect the actual renderer and asset registry before choosing dimensions, camera fit, ground anchors, layering, foreground occlusion, collision/tap regions and loading behavior. A production Treehouse asset must preserve the approved architecture and allow a Friend to move in front of/behind relevant elements.
- Existing journey language uses a ladder/climb, while approved exterior art shows stairs. Reconcile the visible approach, arrival position and entry transition locally; do not show a Friend climbing an invisible ladder. Preserve the required greeting with Olive and the Friend together before room entry.
- The overview visibly depicts eight destination areas (Treehouse, Art Hut, lighthouse, market, campfire, arcade, beach, lagoon) plus Welcome Dock: **nine total**. Map those to actual zone identifiers rather than renaming routes or inventing attractions. Fishing may be an activity/spot rather than an additional destination; retain the implementation's supported distinctions.
- New guide art, travel poses, tree variants, canopy layers, voice and persistence are not supplied by this package. Preserve their existing production requirements and honestly identify any remaining substitutions. No Olive redesign is approved by these three PNGs.
- Production scale must be checked with the actual selected Friend at runtime. The illustrated studies establish direction but do not prove animation reach, navigation, seated poses or device readability.
- If an essential asset cannot be derived faithfully using available art tooling, identify its exact required view, dimensions, transparency/layers, anchor and purpose. Continue independent implementation work; do not disguise a rough code-drawn substitute as the approved art.

## Experience checkpoint to return

Return one Treehouse art candidate with commit/tree, clean/dirty status, incremental diff from the identified pre-art candidate, relevant tests/typecheck/build and the specific assets added or changed. Capture normal Island → Treehouse selection → journey/discovery → greeting → room entry, showing that accepted interactions still work. Include phone, tablet and desktop views and a short recording. Identify viewport simulation vs real-device testing. Assess full-canopy overview framing, character scale, stair/entry alignment, character occlusion and touch discoverability.

Report only material regressions or concrete visual dependencies. Keep wider observations as concise notes, preserving momentum. No push, PR, merge, deployment, public preview or automatic project-board changes are authorized by this handoff.

---

## Added to the repository on 2026-09-17 by the Treehouse art chunk

These five files are the handoff package, unmodified, checked in so the approved
direction lives with the code. `manifest.json` carries each file's SHA-256; the
copies here verify against it.

They are **source references, not shipped assets**. This folder is outside
`public/` and outside `src/assets/`, so nothing here is bundled or downloaded by
a browser. Nothing in `packages/island-scene` imports them.
