import buildItemsJson from "../../content/build-items.json";

/**
 * Build-item catalog (Session 5) — the free-build island's palette, loaded
 * through the same build-time content-pipeline pattern as dialogue/practices:
 * JSON in `content/`, validated here, hard-fail in dev / skip-and-warn in
 * prod. Pure data (no Pixi), so the engine core and tests import it freely.
 */

export type BuildCategory = "structures" | "nature" | "figures" | "comfort";

export const BUILD_CATEGORIES: readonly BuildCategory[] = [
  "structures", "nature", "figures", "comfort",
];

export interface BuildItemDef {
  /** Stable id: `<category>.<slug>` (e.g. "comfort.lantern"). Never renamed. */
  id: string;
  /** Kid-facing label shown in the palette drawer. */
  name: string;
  category: BuildCategory;
  /** Future illustrated-asset key (ASSET-SPEC.md); placeholders render until it ships. */
  sprite: string;
  /** Grid cells occupied at rotation 0; rotations 1/3 swap w/h. */
  footprint: { w: number; h: number };
  /** May be placed ON a surface-providing item (item-on-surface stacking). */
  stackable: boolean;
  /** Non-null: this item's top IS a surface of that type. Stacked items never
   *  provide surfaces — that's the "no towers" rule, enforced by the engine. */
  surfaceType: string | null;
}

export const BUILD_ITEM_ID_RE = /^(structures|nature|figures|comfort)\.[a-z0-9-]+$/;

interface BuildItemsFile {
  version: number;
  items: BuildItemDef[];
}

const file = buildItemsJson as BuildItemsFile;

function fail(msg: string): void {
  if (import.meta.env.DEV) throw new Error(`[island-content] ${msg}`);
  console.warn(`[island-content] ${msg} — entry skipped`);
}

const itemsById = new Map<string, BuildItemDef>();
for (const item of file.items ?? []) {
  const where = `build-items.json item "${item?.id ?? "?"}"`;
  if (typeof item.id !== "string" || !BUILD_ITEM_ID_RE.test(item.id)) {
    fail(`${where}: id must match <category>.<slug>`);
    continue;
  }
  if (item.id.split(".")[0] !== item.category) {
    fail(`${where}: category "${item.category}" ≠ id prefix`);
    continue;
  }
  if (typeof item.name !== "string" || item.name.length === 0) {
    fail(`${where}: name must be a non-empty string`);
    continue;
  }
  if (typeof item.sprite !== "string" || item.sprite.length === 0) {
    fail(`${where}: sprite key must be a non-empty string`);
    continue;
  }
  const fp = item.footprint;
  if (!fp || !Number.isInteger(fp.w) || !Number.isInteger(fp.h) || fp.w < 1 || fp.h < 1 || fp.w > 4 || fp.h > 4) {
    fail(`${where}: footprint must be integer 1..4 × 1..4`);
    continue;
  }
  if (typeof item.stackable !== "boolean") {
    fail(`${where}: stackable must be boolean`);
    continue;
  }
  if (item.surfaceType !== null && typeof item.surfaceType !== "string") {
    fail(`${where}: surfaceType must be null or a string`);
    continue;
  }
  if (item.stackable && item.surfaceType !== null) {
    // A stackable surface would allow towers; the schema forbids it outright.
    fail(`${where}: an item cannot be both stackable and a surface (no towers)`);
    continue;
  }
  if (itemsById.has(item.id)) {
    fail(`${where}: duplicate id`);
    continue;
  }
  itemsById.set(item.id, item);
}

export const buildItemsVersion: number = file.version;

export function getBuildItem(id: string): BuildItemDef | null {
  return itemsById.get(id) ?? null;
}

export function getBuildItems(): BuildItemDef[] {
  return [...itemsById.values()];
}

export function getBuildItemsByCategory(category: BuildCategory): BuildItemDef[] {
  return getBuildItems().filter((i) => i.category === category);
}
