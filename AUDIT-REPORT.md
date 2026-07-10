# ENGAGE ISLAND — SESSION 1 AUDIT REPORT

Date: July 10, 2026 · Scope: full repo at commit `0d189c3` · No code changed in this session.

Severity legend: **BLOCKER** (must resolve before Sessions 3–6 can build on it) ·
**SHOULD-FIX** (real defect/debt, fix in Session 2) · **COSMETIC** (polish, fix opportunistically).

---

## 0. The one finding that frames everything else

**The repo contains two disconnected products, and the child-facing island is the demo harness.**

- `src/` is a Lovable-generated, Supabase-backed **therapist platform shell** (auth, residents,
  assignments, activity toggles). It **never imports the island renderer** — `grep` for
  `island-scene`/`IslandScene` across `src/` returns zero hits, and root `package.json` has no
  workspace dependency on the package. Its "island" route (`src/routes/_authenticated/studio/island.tsx`)
  is a config form that literally says "Real 2.5D scene comes in a later phase."
- `packages/island-scene/` is the actual island: a self-contained React + PixiJS package whose only
  mount point is its own dev harness (`packages/island-scene/demo/App.tsx`), built and published to
  GitHub Pages by `.github/workflows/pages.yml` (static site, base `/studio-island/`).

Nothing is broken about this — it is in fact what enforces the One Law structurally — but every
session plan should be read with "the island = the package + its demo entry" in mind. Where the
sprint pack says `/src/content/types.ts` and `/content`, the natural home is inside
`packages/island-scene/` (or a sibling package), **not** the Supabase app's `src/`. Flagged for
Greg's confirmation in §7.

---

## 1. Architecture map

### 1.1 Scenes & rendering pipeline (`packages/island-scene/`)

```
IslandScene.tsx (React wrapper, 192 ln)      — thin lifecycle/prop bridge, zoom buttons, Exit button
  └─ SceneRenderer.ts (plain TS, 2,071 ln)   — owns the Pixi Application + everything below
       ├─ Mode 1 · World map
       │    ├─ LayeredIsland.ts (468)        — water/sand sprites + deterministic prop scatter
       │    │                                  (masks/positions hardcoded to sand-base-v2 art)
       │    ├─ zones.ts (341)                — LANDMARK_ART registry (9 illustrated PNGs) +
       │    │                                  cel-shaded code fallback painters
       │    ├─ landmarkFx.ts (445)           — per-landmark ambient FX (glow, smoke, fish, stars)
       │    ├─ pathfind.ts (227)             — A*, 8-dir, anti-corner-cut, string-pulling (solid)
       │    ├─ avatar.ts / avatarTexture.ts  — programmatic compositor + PNG background knockout
       │    └─ GuideOverlay.ts (427)         — Phase-2 guide card (screen space, top layer)
       ├─ Mode 2 · Zone interior (currently UNREACHABLE in product flow — see F2)
       │    ├─ ZoneView.ts (379)             — side-scrolling parallax walk + beacon + exit
       │    └─ zoneEnv.ts (852)              — 9 hand-built parallax environments
       ├─ Arrival flow: AvatarSelect.ts (436) → ArrivalView.ts (125, boat cinematic) → world map
       └─ defaultLayout.ts (274)             — LOCKED landmark coordinates + walk grid (generated)
```

Camera: eased follow + drag-pan + pinch/wheel zoom, clamped to world bounds with a north extension
for tall sprites. Depth: single y-sorted `entities` container shared by landmarks, scatter props and
avatars. Reduced motion honored throughout.

### 1.2 State management

- **Island runtime state** (avatar position, walk paths, camera, arrival phase, guide overlay) lives
  entirely inside `SceneRenderer` instance fields. Props in, callbacks out; nothing persisted —
  a page reload restarts avatar pick + boat cinematic (demo intentionally passes no `imageUrl`).
- **App (`src/`) state**: TanStack Query keyed on Supabase reads; no context/store; auth session in
  `localStorage` via the Supabase client. Irrelevant to the island at runtime.

### 1.3 Where dialogue / activities / Stars live today

| Content | Where | Shape | Loadable? |
|---|---|---|---|
| Guide dialogue | **Hardcoded** — `guideCatalog.ts:33-103` | one `message` string per guide (no trees, no choices, no sequencing) | No |
| Mini-practices | **Nowhere** — no practice concept exists in the island | — | — |
| Stars / economy | **Nowhere** — "Star Market" is a cosmetic stall; the gold-star FX in `landmarkFx.ts` is decoration. No currency, balance, or reward code anywhere | — | — |
| Activities | Supabase `activities` table (10 seeded rows), consumed only by the therapist app | DB rows; `config jsonb` empty | Yes, but wrong lane |

Also note a **zone taxonomy split**: the DB seeds 6 therapeutic zones (`calm_cove`, `build_beach`,
`campfire`, `worry_hollow`, `garden`, `field_guide_meadow`); the island renders 9 landmark zones
(`ZoneKey` in `types.ts:75-84`). No mapping exists. Session 3's content IDs should standardize on
the island's 9 keys (they match the locked guide roster).

---

## 2. One Law compliance — PASS

Verified by full-text sweep of `packages/island-scene/src`:

- **Zero** `fetch` / XHR / axios / WebSocket / `sendBeacon` / `EventSource` / AI / Supabase / storage
  APIs. The only I/O is Pixi loading the package's **own bundled or same-origin static PNGs**
  (`SceneRenderer.ts:49`, `zones.ts:28`, `avatarCatalog.ts:46`, `guideCatalog.ts:110` —
  `import.meta.env.BASE_URL` is a build-time path prefix, not a host).
- `avatarTexture.ts:85` sets `img.crossOrigin = "anonymous"` — CORS mode for same-origin canvas
  pixel reads, not a remote call.
- The GitHub Pages deploy ships only the static demo (`dist-demo`), so the deployed island cannot
  reach the Supabase backend at all.

Adjacent facts (not violations — they live in the therapist app, which never mounts the island):
`src/lib/lovable-error-reporting.ts` forwards uncaught errors to Lovable telemetry via the root
error boundary (`__root.tsx:43`); `__root.tsx:98-101` loads Google Fonts; all Supabase usage is
confined to `src/integrations/supabase/*` + routes. **When Session 5's free-build island ships
inside this package, One Law is inherited automatically as long as nothing new imports from `src/`.**

---

## 3. Dead code & asset sweep

### 3.1 Hideaway Den — nothing to remove, but a naming landmine

Case-insensitive sweep for `hideaway` / `hideout` / "Hideaway Den": **the concept does not exist in
this repo.** Every hit is the live, locked zone `treehouse_hideaway` ("Treehouse Hideaway", Olive's
zone). **Session 2 must not "clean up" any `treehouse_hideaway` reference** — it is protected by
standing constraints 1 & 2. The cut concept was evidently never built here.

### 3.2 Confirmed dead (safe to delete, with evidence)

| # | Item | Size | Evidence |
|---|---|---|---|
| D1 | 14 root-level raw PNGs (`bush-01.png` … `water-base.png`, `store-01.png`, `lagoon-01.png`, `fishing-dock-01.png`, `sand-base.png`, `sand-base-v2.png`, …) | ~23 MB | No code references any root-path PNG; the used copies live in `src/assets/{sprites,landmarks}` (all md5s differ — root files are raw source drops) |
| D2 | `packages/island-scene/src/assets/home-island.png` + the whole `terrainImage` code path (`loadGround`/`positionGround`, `SceneRenderer.ts:1002-1021, 1055-1061`) | 4 MB | `loadGround()` is **never called** — `init()` calls `loadIsland()` (LayeredIsland) instead; `this.ground` can never be set. The PNG is still bundled via `defaultLayout.ts:269` |
| D3 | `packages/island-scene/src/assets/landmarks/boat.png` | 2.1 MB | Only `boat-covered` is referenced (`zones.ts:80`) |
| D4 | `packages/island-scene/src/assets/sprites/sand-base.png` (v1) | 0.8 MB | Only `sand-base-v2` is loaded (`SceneRenderer.ts:979`) |
| D5 | `packages/island-scene/public/boat-covered.png` | 1.7 MB | Duplicate of the bundled landmark; nothing loads from `public/boat-covered.png` |
| D6 | `src/lib/api/example.functions.ts` | — | Scaffolding sample; zero importers |
| D7 | 35 of 46 shadcn components in `src/components/ui/` (+ ~13 radix deps that exist only for them) | — | Only 11 are imported by app code: alert, alert-dialog, badge, button, dialog, input, label, select, sonner, switch, textarea |
| D8 | `tools/island-art/` intermediate artifacts (diag/preview PNGs, m2/m3/m5 JSON+PNG, second `home-island.png`) | ~30 MB of the 41 MB dir | Dev-only pipeline (own package.json, dep `sharp`); not referenced by any build. **Keep the .mjs scripts** — they regenerate the locked layout and are the provenance of `defaultLayout.ts`; delete only the checked-in outputs |

**CAUTION — not dead despite appearances:** `landmarks/store-01.png` and `landmarks/lagoon-01.png`
are live (`star_market` / `lazy_lagoon` in the 9-zone `LANDMARK_ART`, `zones.ts:67-68`); the stale
package README claims "seven zones" — trust the code, not the README. `ZoneView`/`zoneEnv` are
compiled and invocable (Mode 2) but unreachable from product flow — that's a product decision (F2),
not a delete.

### 3.3 Stale documentation

`packages/island-scene/README.md` describes 7 zones, a removed avatar system (hair/outfits), old
zone keys (`calm_cove`, `worry_hollow`…) and a moored world-map boat that no longer exists.
**SHOULD-FIX** — it will actively mislead every future session.

Informational: the git pack is already 155 MB (art history). Deleting files trims checkouts and
bundles going forward but not history; that's fine, just don't let multi-MB intermediates keep
landing in commits.

---

## 4. Bug & fragility list (root cause + evidence)

| # | Sev | Finding |
|---|---|---|
| F1 | **BLOCKER** (for mobile goals) | **~65 MB of PNGs are downloaded and decoded before the first frame.** `init()` awaits `loadIsland` + `loadLandmarks` (9× ~2 MB at 1024²) + `loadAvatars` (16× ~1.7 MB at 1086×1448) + `loadGuides` (9× ~1.9 MB) before `onReady` (`SceneRenderer.ts:346-349`). The avatar/guide art is then downscaled to ≤320 px anyway (`avatarTexture.ts:17`) — we ship ~44 MB to produce 320 px textures. Root cause: raw art committed unoptimized and preloaded eagerly. |
| F2 | **BLOCKER** (product decision, not code) | **Mode 2 (zone interiors) and `onZoneTap`/`onActivityEnter` are unreachable in the product flow.** `requestZoneTap` deliberately shows the guide overlay instead of firing `onZoneTap` (`SceneRenderer.ts:1485-1512`); only the demo's dev panel can set `currentZone`. ~1,300 lines (ZoneView + zoneEnv + transition) are orphaned-but-maintained. Session 3 dialogue/practices need to know: do guides *lead into* zone interiors again, or is the guide card the whole interaction? Decide before building the content pipeline around either. |
| F3 | SHOULD-FIX | **Zone tap targets are full sprite bounding boxes, including transparent padding.** `landmarkAt` hit-tests `container.getBounds()` (`SceneRenderer.ts:1536-1549`). The treehouse texture is 1024² at scale 0.74 → a ~758×758 px world box; several landmark boxes overlap each other and large stretches of walkable ground. Result: taps meant to walk the avatar get swallowed into a zone greet (ties resolve to frontmost, so a neighbor can also steal the tap). Fix: hit-test the *opaque content box* (anchors + `contentH` are already measured per PNG) or alpha-test the texture. This is the root cause behind the historic "zone tap" bug reports. |
| F4 | SHOULD-FIX | **Stale pointer entry can flip single-finger input into pinch mode.** In Mode 1, `pointerdown` stores the pointer in `this.pointers` (`SceneRenderer.ts:1729`). If the guide overlay opens while a finger is down (auto-greet or walk-arrival greet fires mid-press), `pointerup` takes the guide branch and returns *before* `this.pointers.delete(e.pointerId)` (`:1786-1811`). The stale entry makes the next one-finger drag read as a two-pointer pinch. Fix: clear `pointers`/`pinchDist` whenever the overlay opens or on every pointerup regardless of branch. |
| F5 | SHOULD-FIX | **Boat cinematic has no skip and no missing-asset guard.** 5 s fixed (`ArrivalView.ts:22-23`); if `arrival-bg`/`boat-covered` fail to load, the cinematic still runs — 5 s of near-blank screen (`ArrivalView.ts:92-101` just hides the sprites). A tap-to-skip and a "textures missing → skip straight to dock" guard are cheap. (Reduced-motion path already skips correctly.) |
| F6 | SHOULD-FIX | **Any prop identity change triggers a full static rebuild.** `setZones/setLayout/setTheme/setAvatars` all call `rebuild()` (`SceneRenderer.ts:545-575`), which destroys and re-creates every landmark scene, label, firefly and ~150 scatter sprites. Today the demo memoizes carefully so it's latent; but Session 6's remote placement/avatar updates arriving via props would rebuild the world per event. Fix direction: diff avatars/zones instead of rebuilding, or keep rebuild but make Session 5's build-engine state flow through a dedicated fine-grained path. |
| F7 | COSMETIC | Guide card's ✕ button and "Back to Island" pill are decorative — `handleTap` ignores coordinates and any tap closes (`GuideOverlay.ts:139-141`). Kid-friendly, but make the affordances real or document the tap-anywhere behavior. |
| F8 | COSMETIC | `reducedMotion`/`hideTextLabels` are read once at mount (`IslandScene.tsx:85-87`); later prop changes are ignored (demo works around with a remount `key`). |
| F9 | COSMETIC | `onLoadProgress` reports only 0.2 → 0.6 → 1.0 (`SceneRenderer.ts:341-372`) — useless for a real loading bar, which F1's fix will want. |
| F10 | COSMETIC | `screenToTile` (`iso.ts:28-34`) rounds axes independently — taps near diamond edges can resolve one cell off. Invisible today because targets are forgiving. |
| F11 | COSMETIC | Ten `console.info` diagnostics fire in production every load (idle-anim, transitions, guide opens). Gate behind a debug flag. |
| F12 | COSMETIC | Captain Pete auto-greet (`maybeAutoGreet`, `SceneRenderer.ts:1972-1976`) fires every page load by design (no persistence); with F1's load time this is a lot of Pete. Revisit once any persistence exists. |

Boat cinematic root-cause note: the cinematic itself (`ArrivalView`) is simple and sound —
screen-space, resize-safe, reduced-motion aware. The fragility is all in the *edges* (F5 skip/fallback,
F12 replay-every-load), not the animation.

---

## 5. Performance & mobile

- **Network (the big one):** see F1. Targets: recompress guides/avatars to ≤320–512 px WebP
  (~30–60 KB each, >95% saving), landmarks to ~512² WebP, lazy-load the avatar-select art after
  first paint, and stop bundling `home-island.png` (D2). Realistic outcome: first-load payload
  from ~65 MB → **~3–5 MB**.
- **GPU memory:** 9× 1024² landmark textures + sand/water/arrival ≈ 50–60 MB VRAM — acceptable on
  mid phones, worth halving via the same downscale.
- **Draw calls / CPU per frame:** modest. One y-sorted container (~180 children) is fine for Pixi.
  Per-frame `Graphics` rebuilds: `drawWaves` re-strokes the ~hundreds-of-vertices coast loop twice
  per frame and `drawShimmer` redraws 5 ellipses (`SceneRenderer.ts:1161-1184, 2025-2040`) —
  measurable on low-end but not urgent. `antialias: true` + DPR cap 2 (`:271-275`) is a reasonable
  trade; consider `antialias:false` on low-end if profiling ever demands it.
- **Main-thread stalls:** 25 image decodes + flood-fill knockouts run during init; the knockout is
  bounded (≤320 px) but the *decodes* of 1.5–2 MB PNGs are not. Fixing F1 fixes this too.
- **Touch handling:** solid — unified tap-vs-drag threshold (7 px), pinch-to-zoom with midpoint
  anchor, wheel with `preventDefault`, `pointerupoutside` handled. F4 is the one real defect.
  Zone hover is desktop-only (correctly cosmetic).
- **Viewport:** `resizeTo` container + ResizeObserver covers orientation/URL-bar changes; camera
  re-clamps on resize; labels clamp into the viewport. No issues found beyond small screens making
  the guide card's 520 px bubble width moot (it clamps to 86% width — fine).

---

## 6. Test coverage

**Zero.** No test files, no runner, no `test` script in either `package.json` — nothing is installed
("already-installed tooling" from the sprint pack does not exist; Vitest must be added as a
devDependency — it's light and rides the existing Vite config).

What the minimal harness must protect, in order of value:

1. **Locked coordinates snapshot** — `sampleZones` (all 9: key, gridPosition, footprint), `spawnPoint`,
   grid dims, and row counts of `LAND_ROWS`/`WALK_ROWS`/`OBSTACLE_ROWS` expansions. Pure data, trivial.
2. **Zone/guide registry** — 9 `ZoneKey`s ↔ 9 `GUIDES` entries, locked names (Shelly/Olive/Wally/
   Rascal/Mango/Fern/Bruno/Finn/Captain Pete), guide-per-zone mapping, PNG filenames exist.
3. **Walkability invariants** — spawn is walkable; every zone's `nearestWalkable` entrance resolves
   and `findPath(spawn → entrance)` succeeds (this is the boat-cinematic-to-dock and tap-to-visit
   contract, testable without Pixi because `pathfind.ts`/`buildGrid` logic is pure).
4. **Smoke test** — mounting `IslandScene` in jsdom cannot exercise WebGL; the honest smoke test is
   (a) React mount with `SceneRenderer` mocked, plus (b) pure-function coverage of `iso.ts`
   round-trips. A real-canvas smoke test would need Playwright — defer unless Greg wants it.
5. (Session 3 adds) content-ID referential integrity.

---

## 7. Readiness assessment for Sessions 3–6

### Session 3 — Content pipeline · READY, one decision + one prerequisite

- **What exists:** exactly 9 hardcoded greeting strings (`guideCatalog.ts`). No trees, choices,
  practices or stars — so "migrate ALL existing dialogue" is a ~30-minute transcription; the real
  work is the loader, types, and the GuideOverlay upgrade from single-message card to a
  multi-line/choice dialogue player (new UI states: next-tap, choice buttons).
- **Decisions needed first:** (a) F2 — does dialogue ever hand off to Mode 2 interiors?
  (b) Location of `/content` + loader: recommend **inside `packages/island-scene`** with build-time
  JSON imports (keeps One Law trivially true — no runtime fetch at all) and validation in dev via
  the loader; confirm the sprint's `/src/content/types.ts` path means the package's `src`.
  (c) Standardize content IDs on the island's 9 zone keys, not the DB's 6.
- **Blast radius:** `guideCatalog.ts` (replaced by loader), `GuideOverlay.ts` (dialogue player UI),
  `SceneRenderer.showGuide` wiring, new `/content` tree + tests. Nothing touches locked layout.

### Session 4 — Audio layer · READY after 3

- No audio code exists anywhere (`setVolume`/`duck` are documented no-ops in `IslandScene.tsx:108-110`)
  — greenfield, which is good. Preload hooks are natural (`showGuide` per zone; dialogue display).
  Depends only on stable content IDs from Session 3. Mute persistence to localStorage is the
  package's *first* persistence — One Law allows local state; keep it in the package.

### Session 5 — Build engine + free-build island · READY after 2, with 3 knowns

1. **Second scene = second layout + terrain art.** The world map is prop-driven in principle, but
   three things are hardwired to the *current* island art: `LayeredIsland`'s coarse sand/flower
   masks + scatter tables (`LayeredIsland.ts:69-149`), `ISLAND_SPAN_W` (`SceneRenderer.ts:909`), and
   `LANDMARK_ART` keyed by the 9 `ZoneKey`s. The clean path for a *smaller, mostly-open* island:
   either run the `tools/island-art` pipeline on a new painted base (it exists for exactly this) or
   use the still-live procedural terrain fallback (`drawTerrain`'s non-image branch) for v1.
   Scene switching itself is cheap: unmount/remount `IslandScene` with a different `layout`/`zones`.
2. **Boat transition reuses `ArrivalView` as-is** — it's screen-space and texture-agnostic; sail
   direction/backdrop are parameters to add, not a new system. Fix F5 first so the reuse is sound.
3. **Entry point without touching locked coords:** the `decorations` + `onObjectInteract` pattern
   already exists end-to-end (`tapAt` checks decorations before zones, `SceneRenderer.ts:1848-1855`)
   and `defaultLayout.decorations` is currently `[]` — a dinghy/signpost decoration at the dock is
   additive and legal. **Do not** add a 10th zone.
4. **Engine architecture:** greenfield `/src/build-engine/`; honor state-in/events-out. Heed F6 —
   don't route per-placement state through `IslandScene` props or every placement will rebuild the
   world. Estimated blast radius: new module + new scene entry in the demo host + `ArrivalView`
   parameterization. Locked files untouched.
   Sprite scope: existing art register (bold ink outlines, flat fills) is well-defined; if item art
   is out of scope, ASSET-SPEC.md + colored-shape placeholders is the right call (per pack).

### Session 6 — Shared session island · architecture supports it, two warnings

- The package's props-in/callbacks-out contract and the planned engine interface make the isolated
  sync module feasible. Warnings: (a) F6 — remote events must feed the engine's state application
  path, never the React prop churn path; (b) there is currently **no** notion of a second live
  avatar being driven at runtime — `AvatarInstance[]` exists and interpolates, but every update
  currently triggers `rebuild()` (same F6 fix covers it). Supabase Realtime enters only via
  `/src/shared-session/` in the app or a new package — never imported by island-scene itself.

---

## 8. Session 2 fix list — EXECUTED July 10, 2026 (Greg approved all except X6)

Cleanup (one commit each):

- [x] **C1** Delete 14 root-level stray PNGs (~23 MB). (D1)
- [x] **C2** Remove dead `terrainImage` path: `loadGround`/`positionGround`, `defaultLayout.terrainImage`, delete both `home-island.png` copies (~8 MB). (D2)
- [x] **C3** Delete unused `landmarks/boat.png`, `sprites/sand-base.png`, package `public/boat-covered.png` (~4.6 MB). (D3-D5)
- [x] **C4** Delete `src/lib/api/example.functions.ts`. (D6)
- [x] **C5** Delete 35 unused shadcn components + 29 orphaned deps. (D7)
- [x] **C6** Delete `tools/island-art` intermediate artifacts, kept scripts + README + raw source art (~27 MB). (D8)
- [x] **C7** Rewrite `packages/island-scene/README.md` to match reality. (§3.3)

Fixes:

- [x] **X1** All art → WebP (69 MB → 2.8 MB); guide art lazy-loads after first paint; per-asset `onLoadProgress`. (F1, F9)
- [x] **X2** Landmark tap-targets → measured opaque content boxes baked into `LANDMARK_ART`. (F3)
- [x] **X3** Pointers retired on every pointerup + cleared when a guide opens. (F4)
- [x] **X4** Boat cinematic: tap-to-skip + missing-texture skip guard. (F5)
- [x] **X5** Diagnostics behind `debugLog` (dev builds only). (F11)
- [ ] **X6** Avatar/zone diffing instead of full `rebuild()`. (F6) — **moved by Greg to Session 5 prerequisite** (must land before the build engine's state flow / Session 6 sync).

Test harness:

- [x] **T1** Vitest 4.1.10 + jsdom (devDeps); `bun run test`; wired into the Pages workflow.
- [x] **T2** `defaultLayout` lock test (zones/spawn/grid exact; cell tables by count + checksum).
- [x] **T3** Zone/guide registry test (9 zones, locked roster, art files exist).
- [x] **T4** Walkability invariants (spawn → every zone entrance pathable).
- [x] **T5** Mount smoke test (mocked renderer) + `iso.ts` round-trip tests. 24 tests green.

Decisions (answered by Greg, July 10, 2026):

- [x] **Q1 = A**: Mode 2 zone interiors are REVIVED as the practice space — Session 3 wires guide → interior; `ZoneView`/`zoneEnv` stay.
- [x] **Q2**: `/content` lives at `packages/island-scene/content` with build-time JSON imports.
- [x] **Q3**: content IDs use 4-part dot format (`<zone>.<guide>.<node>.<seq>`) keyed on the island's 9 zone keys.

Restore point: local tag + remote branch `checkpoint-pre-session-2` at `d42759a` (tag push blocked by repo ref policy; create the GitHub tag from that branch if desired).

Hideaway Den (Session 2 item #2 in the sprint pack): confirmed nothing to remove — see §3.1.
