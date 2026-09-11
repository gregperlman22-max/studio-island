/**
 * Treehouse Hideaway room art.
 *
 * The painting SHIPS at:
 *
 *     packages/island-scene/src/assets/interiors/treehouse-hideaway.webp
 *
 * 2000x1125 (16:9). Replacing it is a file swap — the glob below is resolved
 * by Vite AT BUILD TIME, so the new file is bundled and content-hashed with no
 * code change. It stays a glob (rather than `new URL(...)`) so that deleting or
 * renaming the art degrades to a plain warm ground instead of failing the
 * build.
 *
 * SPEC for a replacement — the room is drawn COVER-fit and centred:
 *   - one full-room illustration; NO interface text, labels or buttons baked
 *     in. Every label is drawn in code over the top (see TreehouseRoom.ts);
 *   - landscape 16:9, which covers phone through desktop without stretching;
 *   - cover-fit crops hard on portrait: at phone portrait only the middle
 *     ~26% of the WIDTH survives, so anything that must always be visible
 *     belongs near the horizontal centre;
 *   - the three interaction anchors in `treehouseModel.HOTSPOTS` are tuned to
 *     THIS composition (chest lower-left, round table lower-centre, cushion
 *     nook right). A recomposed room needs those three fractions retuned.
 */

/** Build-time lookup. Resolves treehouse-hideaway.webp to a hashed URL. */
const roomArt = import.meta.glob<string>(
  "../assets/interiors/treehouse-hideaway.{webp,png,jpg,jpeg}",
  { eager: true, query: "?url", import: "default" },
);

/** Bundled URL for the painted room; null only if the art file is absent. */
export const TREEHOUSE_ROOM_URL: string | null =
  Object.values(roomArt)[0] ?? null;

/** Where a replacement painting must be placed for the glob to pick it up. */
export const TREEHOUSE_ROOM_TARGET =
  "packages/island-scene/src/assets/interiors/treehouse-hideaway.webp";
