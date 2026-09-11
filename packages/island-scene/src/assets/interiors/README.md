# Zone interior paintings

`treehouse-hideaway.webp` (2000×1125) is the **production** Treehouse Hideaway
room. `src/render/treehouseArt.ts` resolves it with a build-time glob, so
replacing the art is a file swap — no code change.

Rules for a replacement:

- one full-room illustration, landscape 16:9;
- **no interface text or buttons baked in** — every label is drawn in code over
  the painting, so the art can be repainted without touching a label;
- the image is drawn cover-fit and centred, and portrait viewports crop hard
  (at phone portrait only the middle ~26% of the width survives), so anything
  that must always be visible belongs near the horizontal centre;
- the three interaction anchors in `treehouseModel.HOTSPOTS` are tuned to this
  composition (chest lower-left, round table lower-centre, cushion nook right).
  A recomposed room needs those three fractions retuned.

If the file is missing the room falls back to a plain warm ground — never a
mock room.
