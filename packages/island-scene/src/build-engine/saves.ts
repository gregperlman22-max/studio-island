import { deserializeBuildState, serializeBuildState } from "./engine";
import type { BuildState } from "./types";

/**
 * Save slots — three named local-storage saves ("My Island 1/2/3"), the
 * free-build island's only persistence. Fully offline (One Law: local state
 * is allowed; nothing here talks to a network). Guarded for environments
 * without storage — every function degrades to a no-op/empty.
 */

export const SAVE_SLOTS = [1, 2, 3] as const;
export type SaveSlot = (typeof SAVE_SLOTS)[number];

const slotKey = (slot: SaveSlot) => `engage-island.build.slot${slot}`;

export interface SaveSlotInfo {
  slot: SaveSlot;
  name: string;
  /** Placement count, for the slot picker ("My Island 2 · 14 items"). */
  itemCount: number;
  savedAt: number;
}

interface SaveFile {
  version: 1;
  name: string;
  savedAt: number;
  state: string; // serialized BuildState
}

function storage(): Storage | null {
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null;
  }
}

export function saveToSlot(slot: SaveSlot, state: BuildState, name?: string): boolean {
  const store = storage();
  if (!store) return false;
  const file: SaveFile = {
    version: 1,
    name: name ?? `My Island ${slot}`,
    savedAt: Date.now(),
    state: serializeBuildState(state),
  };
  try {
    store.setItem(slotKey(slot), JSON.stringify(file));
    return true;
  } catch {
    return false; // quota/private mode — the build just isn't persisted
  }
}

export function loadFromSlot(slot: SaveSlot): BuildState | null {
  const store = storage();
  if (!store) return null;
  const raw = store.getItem(slotKey(slot));
  if (!raw) return null;
  try {
    const file = JSON.parse(raw) as SaveFile;
    if (typeof file?.state !== "string") return null;
    return deserializeBuildState(file.state);
  } catch {
    return null;
  }
}

export function clearSlot(slot: SaveSlot): void {
  storage()?.removeItem(slotKey(slot));
}

/** Metadata for all three slots (null-safe; empty slots omitted). */
export function listSaveSlots(): SaveSlotInfo[] {
  const store = storage();
  if (!store) return [];
  const out: SaveSlotInfo[] = [];
  for (const slot of SAVE_SLOTS) {
    const raw = store.getItem(slotKey(slot));
    if (!raw) continue;
    try {
      const file = JSON.parse(raw) as SaveFile;
      out.push({
        slot,
        name: typeof file.name === "string" ? file.name : `My Island ${slot}`,
        itemCount: deserializeBuildState(file.state ?? "").placements.length,
        savedAt: typeof file.savedAt === "number" ? file.savedAt : 0,
      });
    } catch {
      /* corrupted slot reads as empty */
    }
  }
  return out;
}
