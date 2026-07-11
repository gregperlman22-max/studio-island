# @gregperlman/island-scene

The Engage Island world: a 2.5D tap-to-move island renderer for children,
built as a **pure presentational React + PixiJS component**. The host app owns
all data; this package owns all rendering.

> **Status (July 2026):** nine landmark zones with resident guide animals,
> illustrated terrain (layered sprite island), avatar selection screen, boat
> arrival cinematic (tap-to-skip), guide speech-bubble overlays, A\*
> tap-to-move with a verified walk grid, camera pan/pinch/zoom, reduced-motion
> compliance. All art ships as WebP (~2.8 MB total first-paint payload).

---

## The One Law

`IslandScene` is purely presentational. It contains **no** Supabase client,
**no** network calls beyond its own same-origin static assets, **no**
persistence, **no** auth, **no** AI. All world data arrives via props; all
user actions exit via callbacks. **Never violate this** — if you want to read
a database inside this package, the host app must do it and pass the result
in. (The single approved future exception is the Shared Session Island's
isolated sync module, which lives *outside* this package.)

---

## The nine zones & their guides

Zone keys, landmark coordinates (`defaultLayout.ts`) and the guide roster are
**locked** — do not rename, renumber, or add zones without a roadmap decision.

| Zone key | Display name | Guide |
|---|---|---|
| `welcome_dock` | Welcome Dock | Captain Pete (Pelican) |
| `calm_beach` | Calm Beach | Shelly (Turtle) |
| `treehouse_hideaway` | Treehouse Hideaway | Olive (Owl) |
| `lighthouse_point` | Lighthouse Point | Wally (Whale) |
| `star_market` | Star Market | Rascal (Raccoon) |
| `arcade_cove` | Arcade Cove | Mango (Monkey) |
| `art_hut` | Art Hut | Fern (Fox) |
| `campfire_circle` | Campfire Circle | Bruno (Bear) |
| `lazy_lagoon` | Lazy Lagoon | Finn (Frog) |

## The child's flow

1. **Avatar selection** — 16 illustrated animals in a scrolling grid; the
   chosen friend is confirmed via `onAvatarSelect` (host persists it; pass it
   back as `config.imageUrl` to skip the picker on return visits).
2. **Boat arrival** — a covered pelican boat sails to shore (side-view
   cinematic; any tap skips; reduced motion skips automatically), then
   cross-fades up into the world map with the avatar on Welcome Dock.
3. **World map (Mode 1)** — tap to walk (A\* over the sand-derived walk grid),
   drag to pan, pinch/wheel to zoom. Captain Pete's welcome auto-opens once
   per mount.
4. **Guides** — tapping a landmark walks the avatar over, then the zone's
   guide pops in and plays its dialogue from the content pipeline
   (`content/zones/<zone>/dialogue.json`): tap to advance `next` lines, tap a
   pill to take a `choices` branch. "Back to Island" (or a tap after the last
   line) dismisses; landmark tap targets use each sprite's measured opaque
   pixels, not its texture bounds.
5. **Zone interiors (Mode 2, the practice space)** — a side-scrolling
   parallax view per zone (`ZoneView`/`zoneEnv`). The guide card's
   **"Go Inside →"** pill fires `onZoneTap`; the host responds by setting
   `currentZone`, which plays the tilt transition into the interior
   (Q1=A decision, July 2026).
6. **Mini-practice** — a zone that has a practice
   (`content/zones/<zone>/practices.json`) opens it automatically on entry:
   the `PracticePlayer` shows the guide's intro line, then each step one at a
   time (tap to advance), then a gentle "All done!" moment. No Stars are
   awarded yet (economy wiring is a later session). Zones without a practice
   keep the explore-to-beacon "You found it!" discovery.
7. **Voice** — dialogue and practice lines play pre-generated audio
   (`AudioService` + [`content/audio-manifest.json`](./content/README.md)):
   per-zone preload on entry, play on line display, tap the speaking guide to
   replay, a persisted global 🔊 mute toggle, and a **silent** text-only
   fallback when a file is missing. Audio is never synthesized at runtime.

## Free-build island (Session 5)

A second, smaller island — open buildable meadow + beach, fixed arrival dock
— reached from the dinghy beside Welcome Dock (sail cinematic there and
back). `FreeBuildScene` hosts it: a bottom palette drawer with the four
sandtray categories (`content/build-items.json`, 31 items), drag a chip onto
the island to place, tap a placed item to rotate (↻) or remove (✕),
item-on-surface stacking only (lantern on table — no towers), and three
named save slots in local storage. Fully offline; One Law in full.

**The architecture rule that makes Session 6 cheap:** the engine
(`src/build-engine/`) is STATE-IN/EVENTS-OUT. The Pixi view consumes a
`BuildState` and diffs it (`planPlacementUpdate`, the sceneDiff pattern)
into per-placement display bundles — placing one item never rebuilds the
scene (test-enforced via `stats`). Taps emit `BuildEvent`s; the host applies
them with the pure reducer (`applyBuildEvent`) and passes the state back.
The view never knows whether a state change came from a local tap or a
remote channel. Items render as placeholder colored blocks until the
illustrated sprites in [`ASSET-SPEC.md`](./ASSET-SPEC.md) are produced.

## Content pipeline

All dialogue, mini-practices and star values live in
[`content/`](./content/README.md) as JSON with stable dot-separated IDs
(`calm_beach.shelly.greet.001`), imported at build time and validated by the
loader (`src/content/loader.ts`) — dev builds hard-fail on malformed content,
production skips-and-warns. Content edits need no code changes.

## Architecture

```
IslandScene.tsx        React wrapper: lifecycle, props in / callbacks out
└─ SceneRenderer.ts    plain-TS owner of the Pixi scene graph
   ├─ LayeredIsland    water/sand sprites + deterministic prop scatter
   ├─ zones.ts         LANDMARK_ART registry (anchors, scales, opaque boxes)
   ├─ landmarkFx.ts    ambient per-landmark effects
   ├─ pathfind.ts      A*, 8-dir, anti-corner-cut, string-pulled paths
   ├─ GuideOverlay.ts  guide card (screen space)
   ├─ AvatarSelect.ts  avatar picker (screen space, self-contained input)
   ├─ ArrivalView.ts   boat cinematic (screen space, tap-to-skip)
   └─ ZoneView.ts + zoneEnv.ts   Mode 2 parallax interiors
```

- **Assets**: WebP only. Guide/avatar art ships as true-RGBA cutouts matted
  offline (`tools/island-art/matte-characters.mjs`; the old runtime knockout
  is gone); guide art lazy-loads after first paint. `onLoadProgress` reports
  real per-asset fractions.
- **Diagnostics**: `debugLog` (dev builds only); `console.warn` for real
  failures.
- **Walk grid**: `walkableCells` in `defaultLayout.ts` is generated from the
  rendered sand silhouette (`tools/island-art/gen-walkgrid.mjs`) — do not
  hand-edit; reachability from spawn to every zone is test-protected.

## Integration

```tsx
import { IslandScene, themePacks, sampleLayout, sampleZones } from "@gregperlman/island-scene";

<IslandScene
  themePack={themePacks.sprout}
  zones={sampleZones}
  layout={sampleLayout}
  avatars={[{ id: "local", isLocal: true, position: sampleLayout.spawnPoint, config }]}
  mode="play"
  audioEnabled={false}
  currentZone={null}            // set a ZoneKey to show that zone's interior
  onZoneTap={(key) => …}        // reserved for the Mode-2 revival
  onZoneExit={() => …}
  onAvatarSelect={(key) => …}   // persist; feed back via config.imageUrl
  onAvatarMove={(id, pos) => …}
  onReady={() => …}
  onLoadProgress={(p) => …}     // 0..1, per-asset granularity
  onError={(e) => …}
/>
```

See [`src/types.ts`](./src/types.ts) for the authoritative contract — every
field there is public API. `reducedMotion` and `hideTextLabels` are read at
mount; remount to change them.

Imperative handle: `walkLocalAvatarTo(pos)`, `resize()`; `setVolume`/`duck`
are reserved no-ops until the audio phase.

### Theme packs

Pure data, swappable at runtime: `sprout`, `explorer`, `drift` (palette stub).
Each defines a palette plus per-zone skin names for the nine `ZoneKey`s.

## Development

```bash
cd packages/island-scene
bun install
bun run dev        # demo harness (the only mount point in this repo)
bun run test       # vitest: layout lock, registry, walkability, smoke
bun run typecheck
bun run build      # library -> dist/
bun run build:demo # static demo -> dist-demo/ (GitHub Pages deploy)
```

The demo harness (`demo/App.tsx`) is the child-facing product view plus a
floating dev panel; `.github/workflows/pages.yml` publishes it to GitHub
Pages on every push to `main` touching this package.

The tests under `src/__tests__/` protect the locked layout coordinates, the
zone/guide registry, and spawn-to-every-zone reachability. **Run them before
and after any change near `defaultLayout.ts`, `zones.ts`, `guideCatalog.ts`,
or `pathfind.ts`.**

## Non-goals

Networking/realtime, Supabase, activity gameplay logic, AI, voice, runtime
speech synthesis (future audio is pre-generated files only), the
picture-frame video docking (anchor reserved only).
