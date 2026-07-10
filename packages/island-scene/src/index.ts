export { IslandScene } from "./IslandScene";
export * from "./types";
export { themePacks, sproutPack, explorerPack, driftPack } from "./theme-packs";
export { sampleLayout, sampleZones } from "./defaultLayout";
export {
  AVATARS,
  avatarImageUrl,
  avatarFileUrl,
  avatarByKey,
  type AvatarOption,
} from "./render/avatarCatalog";
export * from "./content/types";
export { practiceCards, type PracticeCard } from "./content/practice";
export {
  contentReport,
  contentVersion,
  getDialogueLine,
  getGreeting,
  getPractice,
  getPractices,
  getStarValue,
  getZoneDialogue,
} from "./content/loader";
export {
  audioManifestVersion,
  audioCoverageReport,
  audioEntry,
  hasAudio,
  practiceStepAudioId,
  zoneAudioIds,
  type AudioCoverage,
  type ZoneAudioCoverage,
} from "./content/audio";
// ── Free-build island + engine (Session 5) ──
export { FreeBuildScene, type FreeBuildSceneProps } from "./build-island/FreeBuildScene";
export * from "./build-engine/types";
export {
  applyBuildEvent,
  canPlace,
  deserializeBuildState,
  nextRotation,
  placementCells,
  planPlacementUpdate,
  serializeBuildState,
} from "./build-engine/engine";
export { clearSlot, listSaveSlots, loadFromSlot, SAVE_SLOTS, saveToSlot, type SaveSlot, type SaveSlotInfo } from "./build-engine/saves";
export {
  BUILD_CATEGORIES,
  getBuildItem,
  getBuildItems,
  getBuildItemsByCategory,
  type BuildCategory,
  type BuildItemDef,
} from "./content/buildItems";
