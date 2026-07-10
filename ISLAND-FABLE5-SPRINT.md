# ENGAGE ISLAND — FABLE 5 SPRINT PACK
Version 1.0 — July 10, 2026
Commit this file to the studio-island repo root. Each Claude Code session begins:
"Read ISLAND-FABLE5-SPRINT.md, then execute Session N."

---

## STANDING CONSTRAINTS (every session, non-negotiable)

1. `defaultLayout.ts` landmark coordinates are PERMANENTLY LOCKED. Never modify.
2. The 9 guide characters are locked: Shelly (Calm Beach), Olive (Treehouse),
   Wally (Lighthouse), Rascal (Star Market), Mango (Arcade), Fern (Art Hut),
   Bruno (Campfire), Finn (Lagoon), Captain Pete (Welcome Dock). No new
   character art. No renames.
3. ONE LAW: the main island and free-build island are purely presentational —
   zero network calls, zero AI, zero Supabase. Local state only.
   SINGLE APPROVED EXCEPTION: the Shared Session Island scene (Session 6+)
   gets its own isolated sync module. Nothing else imports it.
4. Diagnostic-first: when a bug is found, report root cause with evidence
   before fixing. No silent fixes.
5. Never rebuild what exists. Extend or refactor only.
6. The "Hideaway Den" concept is CUT. References to it are removed, not built on.

---

## SESSION 1 — AUDIT & DIAGNOSTIC (report only, no code changes)

Read the entire repo before writing anything. Produce `AUDIT-REPORT.md` covering:

1. **Architecture map** — scenes, rendering pipeline, state management, how
   dialogue/activities/Stars are currently stored (hardcoded vs. loadable).
2. **One Law compliance** — verify zero network/AI/Supabase. List any violation.
3. **Dead code sweep** — unused files, assets, components. Flag every
   "Hideaway Den" reference for removal.
4. **Bug & fragility list** — especially boat cinematic, zone tap/click
   targets, guide interactions. Root cause + evidence per item.
5. **Performance & mobile** — draw calls, texture sizes, asset loading,
   touch handling, viewport behavior on phone-size screens.
6. **Test coverage** — what exists (likely nothing), what a minimal harness
   must protect: locked coordinates, boat cinematic, scene transitions.
7. **Readiness assessment** for the four builds below (Sessions 3–6):
   content pipeline, audio layer, build engine + second scene, sync module.
   For each: what must change first, estimated blast radius.

Rank all findings: BLOCKER / SHOULD-FIX / COSMETIC. End with a proposed
fix list for Session 2. STOP after the report. Greg reviews before any fix.

---

## SESSION 2 — CLEANUP + TEST HARNESS

Input: the approved fix list from Session 1 (Greg marks items GO/NO-GO).

1. Execute approved fixes only, one commit per logical fix.
2. Remove all Hideaway Den references.
3. Add minimal test harness (Vitest or equivalent already-installed tooling;
   add nothing heavy):
   - Snapshot test: `defaultLayout.ts` coordinates unchanged.
   - Scene registry test: all 9 zones present, correct guide per zone.
   - Smoke test: main scene mounts without error.
4. Run full test pass. Report anything that behaves differently than before.

---

## SESSION 3 — CONTENT PIPELINE

Goal: dialogue, mini-practices, and Stars move from hardcoded to loadable
JSON. This is the keystone: every later island, quest, and audio file
depends on stable content IDs.

### Content schema (implement as TypeScript types + JSON files in /content)

```
content/
  zones/<zoneId>/
    dialogue.json      // guide dialogue trees
    practices.json     // mini-practices
  economy/stars.json   // star values per activity
  manifest.json        // index of all content files + version
```

**Dialogue line (the atomic unit):**
```json
{
  "id": "calm-beach.shelly.greet.001",
  "speaker": "shelly",
  "text": "Oh! A visitor! The waves and I were just breathing together.",
  "next": ["calm-beach.shelly.greet.002"],
  "choices": null,
  "audio": null
}
```
- `id` format: `<zone>.<guide>.<node>.<seq>` — stable forever once assigned.
  Audio files will be keyed to these IDs. Never renumber.
- `choices`: array of `{ "label": "...", "goto": "<lineId>" }` for branches.
- `audio`: null now; Session 4 fills with a manifest reference.

**Mini-practice:**
```json
{
  "id": "calm-beach.practice.wave-breathing",
  "title": "Wave Breathing",
  "guide": "shelly",
  "steps": ["..."],
  "stars": 0,
  "introLine": "calm-beach.shelly.practice-intro.001"
}
```
- `stars: 0` placeholder — values assigned at build time per roadmap rule
  (Phase 4 story quests will pay most; leave headroom).

### Tasks
1. Design final types in `/src/content/types.ts`.
2. Build a loader: validates JSON against types at load, hard-fails in dev
   with a clear message, soft-skips in prod.
3. Migrate ALL existing hardcoded dialogue/activities into the JSON format,
   preserving current text exactly (no rewording — content changes are a
   separate lane).
4. Refactor guide interaction code to consume the loader.
5. Add a test: every `next`/`goto`/`introLine` reference resolves to a real ID.
6. Document the schema in `/content/README.md` so future content drops in
   without code changes.

---

## SESSION 4 — AUDIO PLAYBACK LAYER (machinery only, no real voice assets)

Rule: audio is pre-generated files only. The island NEVER synthesizes
speech at runtime. Files are produced outside the app from approved
scripts and dropped into /public/audio.

1. **Manifest:** `content/audio-manifest.json` maps dialogue line ID →
   `{ "file": "audio/calm-beach/shelly-greet-001.mp3", "duration": 3.2 }`.
2. **Playback service:** preload per-zone on zone entry; play on dialogue
   display; tap-to-replay on the speaking guide; global mute toggle
   persisted in local storage; hard requirement — missing file fails
   SILENTLY (text-only fallback, no error surfaced to the child).
3. **Format:** mp3, mono, 64–96kbps (voice), lazy-loaded per zone.
4. Wire 2–3 scratch placeholder files (any TTS or a beep) to prove the
   full path: manifest → preload → play → replay → mute → missing-file
   fallback.
5. Test: manifest entries all point to existing files OR are flagged in a
   dev-mode report (so Greg gets a "missing audio" checklist per zone).

---

## SESSION 5 (likely 5a/5b/5c) — BUILD ENGINE + FREE-BUILD ISLAND

Concept: Lego-simple placement, sandtray-deep meaning. NOT Minecraft
voxels/terrain. Grid placement of pre-made items on a fixed second island.

### The engine (`/src/build-engine/` — designed for reuse by the shared island)
- Grid overlay on designated buildable regions of the new scene.
- Palette drawer → drag item to grid cell → place. Tap placed item →
  rotate (4 directions) / remove. Limited stacking (item-on-surface only,
  e.g., lantern on table; no towers).
- Item definition: `{ id, name, category, sprite, footprint, stackable,
  surfaceType }` loaded from `/content/build-items.json` (same pipeline
  pattern as Session 3).
- Scene state: serializable JSON (item id, cell, rotation) → save/load to
  local storage, multiple named saves ("My Island 1/2/3").
- CRITICAL ARCHITECTURE RULE: the engine takes a state object in and emits
  placement events out. It must not know or care whether state changes
  come from local taps or (later) a remote sync channel. This is what
  makes Session 6 cheap.

### The palette (sandtray/dollhouse-informed categories)
- **Structures:** small house, treehouse, fence sections, bridge, gate, tent
- **Nature:** trees (3 types), bushes, flowers, rocks, pond tile, garden bed
- **Figures:** people (child, adult ×2, baby), dog, cat, island animals
  (non-guide generic versions), a "brave knight"/protector, a friendly
  dragon (the one "big feeling" figure)
- **Comfort:** campfire, lantern, bench, table, blanket, swing, mailbox
- Art style must match existing island sprites. If sprite creation is
  out of scope for Claude Code, generate a precise ASSET-SPEC.md
  (dimensions, palette, style refs) for external art production and
  build with placeholder colored shapes.

### The island itself
- New scene: smaller island, mostly open buildable meadow + beach, one
  small fixed dock (arrival point).
- Boat transition: reuse the existing boat cinematic pattern from Welcome
  Dock — child sails from main island, sails back. No new cinematic system.
- Entry point on main island: a signpost or small dinghy at Welcome Dock
  (placement must not touch locked coordinates — use an existing
  interactive-object pattern).
- Fully offline. Local storage only. One Law applies in full here.

---

## SESSION 6 — SHARED SESSION ISLAND (deferred until 1–5 are done)

The approved One Law exception. Do not start until Greg green-lights.

- Third scene. Same build engine, same palette (superset allowed).
- Isolated sync module (`/src/shared-session/`) — the ONLY networked code
  in the repo. Supabase Realtime channels: room = session code the
  therapist creates; presence ("Dr. Reed is here" indicator + colored
  cursor/hand per participant); placement events broadcast through the
  channel and applied via the same state-in/events-out engine interface.
- Therapist has identical build powers; optional "spotlight" (therapist
  taps an item, it pulses on the child's screen — the sandtray "tell me
  about this" gesture).
- Session state persists to Supabase so a scene can be revisited next
  session. (Schema design happens in the platform lane, not here — this
  session builds against a stub interface.)
- Harvest pass: review the April 2026 Lovable Engage Island activity list
  (~33 activities: Worry Box, My Shield, Safe Space Builder, Gratitude
  Lighthouse, etc.) as candidates for shared-island guided activities.
  Selection is Greg's call; Claude Code prepares the candidate list only.

---

## SESSION ORDER & BUDGET GUIDANCE

| Session | Est. Claude Code effort | Can start |
|---|---|---|
| 1 Audit | 1 session (long single run) | NOW |
| 2 Cleanup | 1 session | after Greg approves report |
| 3 Content pipeline | 1–2 sessions | after 2 |
| 4 Audio layer | 1 session | after 3 |
| 5 Build engine + island | 2–3 sessions | after 2 (parallel-safe with 3/4) |
| 6 Shared island | 2 sessions | after 5 + Greg green-light |

Token-saving rules for every session:
- Start with "Read ISLAND-FABLE5-SPRINT.md, execute Session N" — nothing else.
- One session = one scope. Do not let a session drift into the next one.
- End every session with: commit, one-paragraph summary, and a NEXT-SESSION
  note listing anything deferred.
