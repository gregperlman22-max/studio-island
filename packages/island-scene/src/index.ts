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
// NOTE: the Quest Table exports nothing publicly. Its beat data and layout
// helpers are a TEMPORARY EC-1 proof, and publishing them would make a
// throwaway shape part of a contract documented as breaking-until-1.0.0. The
// review harness needs no help from the public API — the demo lives inside the
// package and imports the geometry directly. `ScenePhase` / `onPhaseChange`
// (exported via ./types) is the one addition a host genuinely needs.
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
