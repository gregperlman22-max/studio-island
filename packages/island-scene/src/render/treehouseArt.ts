/**
 * Treehouse Hideaway room art.
 *
 * RECOMMENDED TARGET ASSET — drop the final painting in at exactly:
 *
 *     packages/island-scene/src/assets/interiors/treehouse-hideaway.webp
 *
 * Nothing else needs to change. The glob below is resolved by Vite AT BUILD
 * TIME, so:
 *   - while the folder is empty it yields `null`, the renderer never requests
 *     the image, and no 404 reaches the console;
 *   - the moment the file exists it is bundled, content-hashed and handed to
 *     TreehouseRoom automatically.
 * That is why this is a glob rather than a plain `new URL(...)` (which fails
 * the build when the target is missing) or a public/ URL (which would 404
 * every load until the art ships).
 *
 * SPEC for the painting — the room is drawn COVER-fit and centred:
 *   - one full-room illustration; NO interface text, labels or buttons baked
 *     in. Every label is drawn in code over the top (see TreehouseRoom.ts);
 *   - landscape, ~2048×1152 (16:9), which covers phone through desktop
 *     without visible stretching;
 *   - keep the subject clear of the outer ~8%: that band crops away on tall
 *     phone and ultrawide viewports;
 *   - leave the three interaction areas visually uncluttered — the buttons
 *     sit over them. `HOTSPOTS` in treehouseModel.ts currently anchors
 *     Decorate left, Leaf Puzzle centre-low and Story Nook right; retune
 *     those three fractions to the finished composition.
 */

/** Build-time lookup: empty until the painting is committed. */
const roomArt = import.meta.glob<string>(
  "../assets/interiors/treehouse-hideaway.{webp,png,jpg,jpeg}",
  { eager: true, query: "?url", import: "default" },
);

/** Bundled URL for the painted room, or null while the art has not shipped. */
export const TREEHOUSE_ROOM_URL: string | null =
  Object.values(roomArt)[0] ?? null;

/** Where a new painting must be placed for the glob above to pick it up. */
export const TREEHOUSE_ROOM_TARGET =
  "packages/island-scene/src/assets/interiors/treehouse-hideaway.webp";
