# Engage Island — Content

Everything the guides say, every mini-practice, and every star value lives
here as JSON. **Content drops in without code changes**: add or edit a file,
update `manifest.json`, run `bun run test`. The loader
(`src/content/loader.ts`) imports this directory at **build time** (no runtime
fetch — the One Law holds by construction) and validates every file: a
malformed entry hard-fails a dev build with a message naming the file and
field, and is skipped with a console warning in production.

```
content/
  manifest.json              index of all content files + content version
  economy/stars.json         star values per practice/activity id
  zones/<zoneId>/
    dialogue.json            the zone guide's dialogue lines
    practices.json           the zone's mini-practices (optional)
```

`<zoneId>` is the canonical zone key exactly as the renderer knows it:
`welcome_dock`, `calm_beach`, `treehouse_hideaway`, `lighthouse_point`,
`star_market`, `arcade_cove`, `art_hut`, `campfire_circle`, `lazy_lagoon`.

## IDs are forever

Audio files (Session 4) and quests key off these IDs. **Once an ID ships,
never rename, renumber, or reuse it.** Append new sequence numbers instead.

- **Dialogue line** — `<zone>.<speaker>.<node>.<seq>`, four dot-separated
  parts: canonical zone key, the zone guide's key (`shelly`, `olive`, `wally`,
  `rascal`, `mango`, `fern`, `bruno`, `finn`, `captain_pete`), a kebab-case
  node name, and a zero-padded 3-digit sequence.
  Example: `calm_beach.shelly.greet.001`.
  (Note: the zone segment uses the renderer's snake_case keys per the
  recorded Q3 decision — not the kebab spelling in the sprint pack's
  illustrative example.)
- **Mini-practice** — `<zone>.practice.<slug>` with a kebab-case slug.
  Example: `calm_beach.practice.wave-breathing`.

## Dialogue line (the atomic unit)

```json
{
  "id": "calm_beach.shelly.greet.001",
  "speaker": "shelly",
  "text": "Heyyy... welcome to Calm Beach. No rush here... just relax.",
  "next": null,
  "choices": null,
  "audio": null
}
```

- `speaker` must equal the id's second segment, and must be the zone's guide.
- `next`: array of line ids; the player advances to `next[0]` on tap.
  `null` (or `[]`) ends the dialogue.
- `choices`: array of `{ "label": "...", "goto": "<lineId>" }` — rendered as
  pills the child taps. Mutually exclusive with a non-empty `next`.
- `audio`: `null` until the Session 4 audio layer; then a manifest reference.
- Every zone's entry point is its `<zone>.<guide>.greet.001` line — the guide
  card opens on it.

`dialogue.json` wraps lines as `{ "version": 1, "lines": [ ... ] }`.

## Mini-practice

```json
{
  "id": "calm_beach.practice.wave-breathing",
  "title": "Wave Breathing",
  "guide": "shelly",
  "steps": ["...", "...", "..."],
  "stars": 0,
  "introLine": "calm_beach.shelly.practice-intro.001"
}
```

- `stars: 0` is the authoring placeholder — real values are assigned at
  build time in `economy/stars.json` per the roadmap rule (Phase 4 story
  quests pay most; leave headroom).
- `introLine` must resolve to a real dialogue line.

`practices.json` wraps entries as `{ "version": 1, "practices": [ ... ] }`.

## Stars

`economy/stars.json` maps practice/activity ids to awarded stars:

```json
{ "version": 1, "values": { "calm_beach.practice.wave-breathing": 0 } }
```

Every key must be a real practice id. `getStarValue(id)` falls back to the
practice's own `stars` field, then 0.

## Manifest

`manifest.json` lists every content file (relative to this directory) plus
the content version. The loader fails if the manifest and the directory
disagree — update it when adding/removing files.

## Audio (`audio-manifest.json`)

Voice playback is **pre-generated files only** — the island never synthesizes
speech at runtime. `audio-manifest.json` maps a stable content-line ID to a
voice file served from `/public/audio`:

```json
{
  "version": 1,
  "entries": {
    "calm_beach.shelly.greet.001": { "file": "audio/calm_beach/shelly-greet-001.wav", "duration": 0.4 }
  }
}
```

- **Keys** are the stable content IDs. Two kinds are voiced:
  - **dialogue lines** — the `id` from a `dialogue.json` line (this includes
    practice intro lines, which are dialogue lines).
  - **practice steps** — steps are plain strings in `practices.json`, so their
    audio key is *derived* deterministically as
    `<zone>.<guide>.<practice-slug>-step.<seq>`
    (e.g. `calm_beach.shelly.wave-breathing-step.001`). Never renumber.
- **`file`** is relative to the served root (BASE_URL). Production files are
  **mp3, mono, 64–96 kbps**; the wired entries today are dependency-free WAV
  beep placeholders that prove the manifest → preload → play → replay → mute →
  missing-file-fallback path end-to-end.
- A line with **no** entry simply has no audio: it shows as text (silent
  fallback) and appears in the dev-mode missing-audio report.

**Adding a voice file:** drop `public/audio/<zone>/<name>.mp3`, add an entry
keyed by the line's stable ID. That's it — the AudioService preloads it per
zone on entry and plays it when the line is displayed.

### Missing-audio checklist

In a dev build the renderer logs a per-zone checklist of every line still
needing a voice file (`[island-audio] voice coverage: …`). Programmatically,
`audioCoverageReport()` returns the same data
(`{ zones: [{ zone, total, withAudio, missing[] }], totalMissing }`).
`src/__tests__/audio.test.ts` additionally fails CI if any manifest entry
points to a file that isn't actually shipped.

## Checks that protect you

`src/__tests__/content.test.ts` (runs in CI on every push touching the
package):

- loader reports zero problems (schema + manifest + duplicates),
- every `next` / `goto` / `introLine` resolves to a real line,
- ids well-formed; speakers match each zone's locked guide,
- the 9 greeting texts match the pre-migration strings byte-for-byte —
  content REWORDING is a separate lane; this repo lane only moves text.
