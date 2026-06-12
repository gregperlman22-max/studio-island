# @gregperlman/island-scene

A 2.5D tap-to-move island world renderer for **Engage Island**. Pure
presentational React + PixiJS component. The host app owns all data.

> **Status:** Milestone 1 — scaffold, contract, and demo harness.
> The PixiJS renderer (terrain, zones, avatar, tap-to-move) lands in
> Milestones 2–4. The current `IslandScene` is a contract-faithful stub
> that responds to prop changes and fires every callback.

---

## The one architectural law

`IslandScene` is purely presentational. It contains **no** Supabase client,
**no** network calls, **no** persistence, **no** auth. All world data
arrives via props; all user actions exit via callbacks. **Never** violate
this — if you find yourself wanting to read from a database inside this
package, the host app needs to do it and pass the result in.

---

## Install (once published)

```bash
npm install @gregperlman/island-scene pixi.js
# peer deps: react >=18, react-dom >=18
```

For local development inside the Engage Island monorepo, link the
workspace folder or import directly from `packages/island-scene/src`.

---

## Integration (Lovable host app)

```tsx
import {
  IslandScene,
  themePacks,
  type AvatarInstance,
  type LayoutConfig,
  type ZoneInstance,
  type IslandSceneHandle,
} from "@gregperlman/island-scene";
import { useRef } from "react";

export function StudioIslandView({ island, zones, activitiesByZone }) {
  const sceneRef = useRef<IslandSceneHandle>(null);

  // The host maps its DB rows -> the component contract. Theme pack key
  // and layout_config come straight from the islands row.
  const themePack = themePacks[island.theme_pack_key];
  const layout: LayoutConfig = island.layout_config;
  const zoneInstances: ZoneInstance[] = zones.map((z) => ({
    key: z.key,
    displayName: z.display_name,
    skinName: themePack.zoneSkins[z.key]?.skinName ?? z.display_name,
    gridPosition: z.grid_position,
    footprint: z.footprint,
    unlocked: activitiesByZone[z.key]?.length > 0,
  }));

  const avatars: AvatarInstance[] = [
    {
      id: "therapist",
      isLocal: true,
      position: layout.spawnPoint,
      config: island.avatar_config,
      label: island.name,
    },
  ];

  return (
    <IslandScene
      ref={sceneRef}
      themePack={themePack}
      zones={zoneInstances}
      layout={layout}
      avatars={avatars}
      mode="studio"
      audioEnabled={false}
      onZoneTap={(key) => navigate(`/studio/zones/${key}`)}
      onAvatarMove={(id, pos) => /* persist or broadcast later */ undefined}
      onReady={() => analytics.track("island_ready")}
    />
  );
}
```

### What the host owns (and the renderer never touches)

- All persistence (`islands`, `zones`, `assignments`, `event_log`, …).
- All auth and RLS-bound queries.
- Telemetry — log `onZoneTap`, `onAvatarMove`, etc. into `event_log`
  yourself; the package does not import a Supabase client.
- Navigation — `onZoneTap` is a hint; route changes are the host's job.
- Audio ducking policy — call `ref.current?.duck(true)` when a
  telehealth session starts; the package only obeys the call.

### What the renderer owns

- Pathfinding, walk animation, camera, y-sorted rendering.
- Theme pack swapping (palette + per-zone skins + ambient feel).
- Reduced-motion compliance and keyboard reachability of zones.
- Imperative `setVolume` / `duck` / `walkLocalAvatarTo` / `resize`.

---

## Component contract

See [`src/types.ts`](./src/types.ts) for the full, authoritative types.
Highlights:

```ts
<IslandScene
  themePack={ThemePackConfig}     // palette, tilesetKey, audioKey, register, zoneSkins
  zones={ZoneInstance[]}          // 6 zones: key, displayName, skinName, gridPosition, footprint, unlocked
  layout={LayoutConfig}           // mirrors islands.layout_config (jsonb)
  avatars={AvatarInstance[]}      // ARRAY from day one; Phase 1 sends one
  mode={'studio' | 'play' | 'session'}
  audioEnabled={boolean}
  reducedMotion={boolean}         // optional; defaults to prefers-reduced-motion
  hideTextLabels={boolean}        // optional; non-reader mode
  flags={{ fireflyOverlay?: boolean }}
  onZoneTap={(zoneKey) => void}
  onObjectInteract={(objectId, zoneKey) => void}
  onAvatarMove={(avatarId, position) => void}
  onReady={() => void}
  onLoadProgress={(progress) => void}
  onError={(err) => void}
/>
```

Imperative handle (via `ref`):

```ts
interface IslandSceneHandle {
  setVolume(volume: number): void;          // 0..1
  duck(ducked: boolean): void;              // smooth ambient duck
  walkLocalAvatarTo(position: GridPosition): void;
  resize(): void;
}
```

### Theme packs

Pure data; swappable at runtime with **zero code changes**. Three packs:

- `sprout` — candy-bright, curvy, bouncy (full pack in M1).
- `explorer` — richer adventure-cozy (full pack in M1).
- `drift` — palette stub only (art in a later phase).

Each pack defines a palette, tileset key, audio key, register, and a
per-zone `ZoneSkin` (skin name + optional palette overrides + decoration
hints). The six canonical `ZoneKey`s exist in every pack:

```
calm_cove · build_beach · campfire · worry_hollow · garden · field_guide_meadow
```

### Avatars

Layered 2D sprite system. The compositor stacks
`body → outfit → hair → accessory → displayColor tint`. The starter sets
are intentionally tiny so the host's avatar editor can drive the same
shape end-to-end:

- 3 `hairStyle` · 4 `outfitKey` · 3 `accessoryKey` (+ `none`)
- 6 `bodyTone`s, free-form `hairColor` and `displayColor`

`avatars` is an array from day one; Milestone 5 wires smooth
prop-driven interpolation for the second avatar.

### Layout (`LayoutConfig`)

Mirrors the host's `islands.layout_config` jsonb. Includes the reserved
`pictureFrameAnchor` — the renderer marks the spot now so a future phase
can visually dock a floating telehealth video window without re-laying
out the island.

---

## Art strategy

**Milestone 1 uses programmatic art** — Pixi `Graphics` shapes,
gradients, simple procedural trees/rocks/water, circle-and-rectangle
avatars with the layer system applied as colored shapes. All visuals
route through a `TextureProvider` abstraction so hand-made or generated
sprite atlases can be dropped in later without touching scene logic.

Charm comes from motion: gentle idle bobbing, water shimmer, walk
bounce, soft shadows, occasional ambient particles. Reduced-motion mode
short-circuits all of it.

---

## Demo harness

```bash
cd packages/island-scene
npm install
npm run dev
```

Opens a controls panel + live scene preview with theme/mode/audio
toggles and an event log. The harness mounts the same component the
host app does — keep it green at every milestone.

---

## Build & publish

```bash
npm run build      # vite lib build + d.ts emit -> dist/
npm publish        # when ready
```

Outputs: ESM (`dist/island-scene.js`), CJS (`dist/island-scene.cjs`),
types (`dist/index.d.ts`). React and ReactDOM are peer deps.

---

## Roadmap

1. ✅ Scaffold + contract + demo harness (this milestone).
2. Terrain + zones rendered from `layout`, theme-pack palette swap live.
3. Avatar compositor, tap-to-move with A*, camera follow, y-sort.
4. Zone interaction + polish (hover, idle, ambient audio, reduced-motion, preloader).
5. Multi-avatar interpolation + firefly overlay primitive (flag-gated).
6. Clean npm build, this README finalized, `v0.1.0`.

## Non-goals

Networking/realtime, Supabase anything, activity gameplay logic, AI/companion,
voice input, the picture-frame video docking (anchor reserved only),
Drift art.
