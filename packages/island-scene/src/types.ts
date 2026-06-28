/**
 * island-scene — public contract
 * ------------------------------------------------------------------
 * The IslandScene component is purely presentational. It contains
 * NO Supabase client, NO network calls, NO persistence, NO auth.
 * All world data arrives via props; all user actions exit via
 * callbacks. The host app owns all data. Do not violate this.
 *
 * Every field in this file is part of the public API. Treat changes
 * as breaking until version 1.0.0.
 */

// ──────────────────────────────────────────────────────────────────
// Theme packs (pure data, swappable at runtime)
// ──────────────────────────────────────────────────────────────────

export type ThemePackKey = "sprout" | "explorer" | "drift";

/** Semantic color tokens consumed by every renderer in the scene. */
export interface ThemePalette {
  /** Sky/horizon top */
  skyTop: string;
  /** Sky/horizon bottom */
  skyBottom: string;
  /** Ocean / surrounding water */
  water: string;
  /** Water highlight / shimmer */
  waterShimmer: string;
  /** Primary land/grass tone */
  land: string;
  /** Secondary land tone (paths, sand) */
  landAlt: string;
  /** Foliage primary */
  foliage: string;
  /** Foliage secondary (shadow side) */
  foliageShadow: string;
  /** Accent for interactive affordances (zone hover ring, glow) */
  accent: string;
  /** Ink color for text labels rendered inside the scene */
  ink: string;
}

/** Identifier the TextureProvider uses to look up an atlas. */
export type TilesetKey = string;
/** Identifier the AudioProvider uses to look up an ambient loop + SFX bank. */
export type AudioKey = string;

/** Companion register — affects idle animation feel and ambient particle choice. */
export type ThemeRegister = "sprout" | "explorer" | "drift";

export interface ThemePackConfig {
  key: ThemePackKey;
  displayName: string;
  palette: ThemePalette;
  tilesetKey: TilesetKey;
  audioKey: AudioKey;
  register: ThemeRegister;
  /** Per-zone visual metadata (skin name, decoration hints). Keyed by ZoneKey. */
  zoneSkins: Partial<Record<ZoneKey, ZoneSkin>>;
}

export interface ZoneSkin {
  skinName: string;
  /** Optional override palette tokens for this zone within the pack. */
  paletteOverrides?: Partial<ThemePalette>;
  /** Hints for decorative props the renderer may scatter. */
  decorationHints?: string[];
}

// ──────────────────────────────────────────────────────────────────
// Zones
// ──────────────────────────────────────────────────────────────────

/** The set of landmark zones on the island (every island, every theme pack). */
export type ZoneKey =
  | "lighthouse_point"
  | "treehouse_hideaway"
  | "campfire_circle"
  | "art_hut"
  | "arcade_cove"
  | "welcome_dock"
  | "calm_beach";

/** Coarse grid coordinates in island-space (not pixels). */
export interface GridPosition {
  x: number;
  y: number;
}

/** Width/height of a zone footprint in grid cells. */
export interface GridFootprint {
  w: number;
  h: number;
}

export interface ZoneInstance {
  key: ZoneKey;
  /** Player-facing label (host controls localization / non-reader mode). */
  displayName: string;
  /** Theme-pack skin name surfaced for tooltips. */
  skinName: string;
  gridPosition: GridPosition;
  footprint: GridFootprint;
  /** When false, zone is rendered locked (dimmed + lock affordance) and onZoneTap still fires. */
  unlocked: boolean;
}

// ──────────────────────────────────────────────────────────────────
// Layout (mirrors islands.layout_config jsonb in the host DB)
// ──────────────────────────────────────────────────────────────────

export interface LayoutConfig {
  /** Coarse grid size of the entire walkable island. */
  grid: { w: number; h: number };
  /** Island silhouette as a list of grid cells that are land (vs water). */
  landCells: GridPosition[];
  /**
   * Land cells the avatar cannot stand on or walk through — e.g. tree masses
   * and boulders painted into the terrain illustration. Treated like water by
   * pathfinding (the avatar routes around them), but they remain part of the
   * island silhouette. Small scattered foliage is intentionally omitted so
   * movement isn't chopped into narrow lanes.
   */
  obstacleCells?: GridPosition[];
  /** Decoration placements the renderer should honor (trees, rocks, etc.). */
  decorations?: DecorationPlacement[];
  /**
   * Reserved anchor for the future "picture frame" — a designated point
   * where the host may visually dock a floating telehealth video window.
   * Phase 1 reserves it; the renderer simply marks the spot.
   */
  pictureFrameAnchor?: GridPosition;
  /** Avatar spawn point when no position is supplied. */
  spawnPoint: GridPosition;
  /**
   * Optional finished terrain illustration. When present, the renderer pins
   * this image into the world as the ground sprite (replacing the procedural
   * terrain blob) and skips drawing the code terrain layers. The art is placed
   * so that art-pixel (0,0) lands at world pixel (originX, originY) and one art
   * pixel spans `scale` world pixels — the same registration used to derive
   * `landCells`, so the painted coastline lines up with the walk-grid.
   */
  terrainImage?: {
    url: string;
    /**
     * Optional foliage overlay sharing the same registration (originX/originY/
     * scale). When set, `url` is the foliage-free base art and this image is
     * stacked directly above it and gently swayed; together they replace the
     * single ground sprite. Purely decorative — it never affects the walk-grid.
     */
    foliageUrl?: string;
    originX: number;
    originY: number;
    scale: number;
  };
}

export interface DecorationPlacement {
  id: string;
  /** TextureProvider key (programmatic shape id in Milestone 1). */
  kind: string;
  position: GridPosition;
  /** Optional rotation in degrees for cosmetic variety. */
  rotation?: number;
  /** Optional scale multiplier (1 = default). */
  scale?: number;
}

// ──────────────────────────────────────────────────────────────────
// Avatars
// ──────────────────────────────────────────────────────────────────

/**
 * Renderable avatar option sets — the single source of truth shared by the
 * animal compositor (what it can draw) and the host's avatar editor (what it
 * may offer). The package OWNS this set: the host enumerates these arrays to
 * build its picker UI, and cannot author an option the compositor can't draw.
 *
 * Characters are ANIMALS only — cute, chunky, big-headed creatures. There are
 * deliberately no human attributes anywhere (no skin tones, no hair, no
 * gender indicators). The therapist and child avatars are both animals.
 */
export const SPECIES = ["bunny", "fox", "bear", "frog", "cat", "deer"] as const;
export const ACCESSORY_KEYS = ["none", "hat", "bow", "scarf", "backpack"] as const;

export type Species = (typeof SPECIES)[number];
export type AccessoryKey = (typeof ACCESSORY_KEYS)[number];

/**
 * Animal character config. The compositor draws a chunky creature of the given
 * `species`, tinted by a soft pastel `bodyColor`, with an optional `accessory`,
 * and a `displayColor` used for the name tag + selection ring.
 */
export interface AvatarConfig {
  species: Species;
  /** Soft pastel body tint (free-form hex). */
  bodyColor: string;
  accessoryKey: AccessoryKey;
  /** Display color used for the name tag and selection ring. */
  displayColor: string;
}

/**
 * Avatars is an ARRAY from day one. Phase 1 passes a single local avatar,
 * but the renderer must already smoothly interpolate N avatars toward
 * updated positions — no networking, just prop-driven motion.
 */
export interface AvatarInstance {
  id: string;
  config: AvatarConfig;
  /** Current logical position in grid coordinates. */
  position: GridPosition;
  /** True for the avatar the local user controls. Only one is expected. */
  isLocal: boolean;
  /** Optional label shown above the avatar (e.g. "Maple Ranger"). */
  label?: string;
}

// ──────────────────────────────────────────────────────────────────
// Mode + callbacks
// ──────────────────────────────────────────────────────────────────

export type SceneMode = "studio" | "play" | "session";

export interface IslandSceneCallbacks {
  /** Fires after the local avatar has walked to a zone's entrance — the host
   *  typically responds by setting `currentZone` to enter the zone interior. */
  onZoneTap?: (zoneKey: ZoneKey) => void;
  /** Fires when the player leaves a zone interior (Exit affordance). The host
   *  typically responds by clearing `currentZone` back to null (world map). */
  onZoneExit?: () => void;
  /** Fires when the player reaches and taps a zone's activity beacon in the
   *  third-person zone view (Mode 2). The host typically responds by launching
   *  the activity (Mode 3). The zone view shows a brief "You found it!" overlay. */
  onActivityEnter?: (zoneKey: ZoneKey) => void;
  /** Fires when the user interacts with a non-zone object (decoration, anchor, etc.). */
  onObjectInteract?: (objectId: string, zoneKey: ZoneKey | null) => void;
  /** Fires on arrival at the destination tile (host may broadcast later). */
  onAvatarMove?: (avatarId: string, position: GridPosition) => void;
  /** Fires once after all assets are preloaded and the first frame is rendered. */
  onReady?: () => void;
  /** Fires for any non-recoverable runtime error inside the renderer. */
  onError?: (err: Error) => void;
  /** Optional progress hook during initial preload (0..1). */
  onLoadProgress?: (progress: number) => void;
}

// ──────────────────────────────────────────────────────────────────
// Imperative handle (exposed via React.forwardRef)
// ──────────────────────────────────────────────────────────────────

/**
 * Imperative controls the host can call. Intentionally tiny.
 *
 * Audio ducking exists here because the host will lower scene volume
 * during telehealth sessions; everything else stays declarative via props.
 */
export interface IslandSceneHandle {
  /** Multiplier in [0..1] applied on top of audioEnabled. */
  setVolume: (volume: number) => void;
  /** Smoothly duck (true) or restore (false) the ambient bed. */
  duck: (ducked: boolean) => void;
  /** Force the local avatar to walk to a grid cell programmatically. */
  walkLocalAvatarTo: (position: GridPosition) => void;
  /** Resize hint for the host when the container size changes outside React's notice. */
  resize: () => void;
}

// ──────────────────────────────────────────────────────────────────
// Top-level component props
// ──────────────────────────────────────────────────────────────────

export interface IslandSceneProps extends IslandSceneCallbacks {
  themePack: ThemePackConfig;
  zones: ZoneInstance[];
  layout: LayoutConfig;
  /** Array from day one even though Phase 1 typically passes one. */
  avatars: AvatarInstance[];
  mode: SceneMode;
  /**
   * Scene mode control. `null` (or omitted) renders the world map (Mode 1); a
   * ZoneKey renders that zone's third-person zone view (Mode 2). The host flips
   * this in response to onZoneTap (enter) and onZoneExit (leave); the renderer
   * plays the camera-tilt + cross-fade transition between modes.
   */
  currentZone?: ZoneKey | null;
  /**
   * Direct control over the third-person zone view (Mode 2). Defaults to true.
   * When explicitly set to false, the renderer stays on the world map even if
   * `currentZone` is set — letting the host suppress Mode 2 without clearing
   * the active zone.
   */
  zoneViewActive?: boolean;
  audioEnabled: boolean;
  /**
   * Reduced motion. When omitted, the renderer reads
   * window.matchMedia('(prefers-reduced-motion: reduce)').
   */
  reducedMotion?: boolean;
  /** Optional non-reader mode — hides text labels, keeps icons. */
  hideTextLabels?: boolean;
  /**
   * Feature flags. Off by default; enable as later phases land.
   * - fireflyOverlay: render the firefly pointer primitive.
   */
  flags?: {
    fireflyOverlay?: boolean;
  };
  /** Optional className applied to the wrapper div. */
  className?: string;
}
