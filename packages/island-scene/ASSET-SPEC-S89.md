# ASSET-SPEC-S89 — Treehouse Vertical Slice

Production art specification for **S-89** (board v1.3 / backlog v9), covering
every asset family the slice needs. Delivered at the **start** of EC-1 rather
than the end, so art and engineering run in parallel.

Companion to `ASSET-SPEC.md` (free-build item sprites). Same house rules, same
delivery discipline.

---

## Standing rules (all families)

**Style.** The island's register is Wind Waker-adjacent cel / warm painterly
storybook. Reference the shipped landmark art (`src/assets/landmarks/*.webp`),
the six core friends (`public/avatars/core/*.webp`) and the Treehouse room
(`src/assets/interiors/treehouse-hideaway.webp`). Flat vivid fills, soft
top-edge highlight, minimal shading, **bold dark ink outline `#23201c`**.

**Characters are ANIMALS only.** No human attributes anywhere — no skin tones,
no hair, no gender coding. This rule is absolute and predates S-89.

**Format.** WebP, lossy q80+, **true RGBA cutout**, no baked background and no
baked ground shadow (every render site draws its own contact shadow). Character
art is matted **offline** by `tools/island-art/matte-characters.mjs`; never at
runtime. Core-avatar-class art is optimised by
`tools/island-art/optimize-core-avatars.mjs` from sources kept **outside**
`public/` so they never reach a browser.

**Anchoring.** Every render site measures the opaque-content bbox at load
(`render/contentBounds.ts`) and pins the sprite by its **true feet and
horizontal centre**, scaling by **visible content height**, not canvas height.
So: padding is free, but ground contact must be the bottom-centre of the opaque
content. A pose whose ground contact is *not* there (a lean, one leg extended, a
tail hanging below the feet) needs a one-line entry in
`render/avatarTexture.ts`'s `PIVOT_OVERRIDES` — flag it on delivery and it costs
no layout work.

**Replacement is a file drop.** Every family below is resolved by catalog key or
glob. Dropping the file in and adding its registry line is the whole
integration; no layout is tuned around any stand-in.

**Stand-ins are not approved art.** Where EC-1 ships code-drawn scaffolding it
says so in the file header. Nothing code-drawn in this slice is a design, and
silence is not approval.

---

## 1. Six travel poses — **blocking for EC-2**

The child's Friend walks away from camera down a receding path for the whole
journey. Front-facing portraits do not read that way; the POC tested this
explicitly and a back view was clearly better.

| | |
|---|---|
| **Count** | 6 — one per core Island Friend |
| **Pose** | 3/4-**back**, mid-stride, walking away from camera |
| **Canvas** | 480 × 640, content ~70–85% of height, centred |
| **Path** | `public/avatars/travel/<key>-travel.webp` |
| **Keys** | `otter`, `dog`, `cat`, `bunny`, `deer`, `red_panda` — the catalog keys, unchanged |

The recognisable silhouette matters more than the face: a child identifies their
friend from behind by **shape and accessory** (Ollie's backpack, Sunny's ears).
Keep the accessory prominent.

**Interim:** the front-facing core art, logged once per friend. Layout is driven
by measured content bounds, so it is **not** baked around a front-facing
assumption.

**Not required:** an arrival/turn pose. The existing front-facing core art *is*
the arrival pose — the Friend turns to camera at the treehouse. This is
deliberate, and it keeps the ask at six files rather than twelve.

---

## 2. Olive, upgraded — **blocking for production visual acceptance**

Olive is the first upgraded landmark guide and sets the quality bar for all
nine. Today she resolves to `public/guides/Owl.webp`, the generic
nine-guide cutout.

**Approved direction:** owl · warm · wise · encouraging · non-judgemental ·
expressive · right for ages 5–12 · **slightly more sophisticated proportions
than preschool/chibi** · **teal scarf** · **explorer / Treehouse-keeper satchel**
· subtle map-and-adventure identity · **richer painterly storybook treatment** ·
visibly distinct from a selectable Island Friend.

Do **not** substitute a generic owl illustration and call the redesign done.

| | |
|---|---|
| **Count** | 3 poses |
| **Poses** | `neutral` (standing, at rest) · `encouraging` (open gesture toward the table) · `listening` (head tilted, attending) |
| **Canvas** | 480 × 640, feet at the content bbox bottom |
| **Path** | `public/guides/olive/olive-<pose>.webp` |

**Interim:** falls back to `Owl.webp`, logged once. The Treehouse will visibly
out-class the other eight guide zones until they follow — expected for a
vertical slice, and worth knowing it will read as inconsistent.

---

## 3. Forest travel kit — tree variants — **blocking for EC-2**

Routes are composed from a shared kit, not painted per journey. The repo ships
**two** tree sprites, so a composed route currently repeats visibly. This is the
single highest-leverage art drop in the slice.

| | |
|---|---|
| **Count** | 2–3 new, for 4–5 total |
| **Wanted** | a conifer · a slender birch-like trunk · a broad low canopy |
| **Plus** | **1 canopy-overhang piece** — a bough hanging in from off-frame. `tree-01` is currently stretched into this role and it shows. This one piece does more for the depth illusion than any other single element. |
| **Canvas** | 512 × 768 (trees), 768 × 512 (overhang bough) |
| **Path** | `src/assets/sprites/tree-0N.webp`, `src/assets/sprites/canopy-01.webp` |

Match `tree-01.webp` / `tree-02.webp` exactly for scale convention and ink
weight — they are seen side by side at every depth.

---

## 4. Quest Table / diorama — **blocking for production visual acceptance**

The miniature world that rises from the painted table. EC-1 proves the staging
with a code-drawn stand-in (`src/quest/dioramaArt.ts`); the stand-in's flat
green plate is the weakest element on screen and this drop replaces it.

| | |
|---|---|
| **Base plate** | 1 painted clearing that sits on the table top — modelled ground with a visible far edge, seen at the room's own eye level. **768 × 384**, drawn as a shallow ellipse in the room's perspective. |
| **Scene states** | 4 — `group-playing` · `approach` · `aftermath` · `resolution`. Dressing only (stone stack height, scattered props); the base plate is shared. **512 × 256** each, transparent, overlaid on the plate. |
| **Closed dressing** | 1 — the Quest Table at rest on the painted table, inviting a tap. Currently a code-drawn leaf-bound book. **384 × 384**. |
| **Path** | `src/assets/quest/diorama-<name>.webp` |

**Group cast: no new art needed.** The three characters the Friend wants to join
are drawn from `LEGACY_AVATARS` — Hedgehog ("Pip"), Squirrel and Penguin —
already shipped in `public/avatars/`, in register, and rendering nowhere else
today.

---

## 5. Illustrated choices — **blocking for production visual acceptance**

The choice cards must be legible **with the sound off and the label covered**: a
five-year-old who cannot read, on a device whose voice files have not been
recorded yet, has only the picture. That is a hard requirement, not a nicety.

| | |
|---|---|
| **Count** | ~9 distinct illustrations across the seven beats, shared across bands where the choice is the same |
| **Canvas** | 512 × 384, content filling ~80% |
| **Path** | `src/assets/quest/choice-<beat>-<slug>.webp` |
| **Rule** | Two cards in the same beat must be tellable apart **at card size on a 390 px phone** — roughly 170 × 120 px. Test at that size, not at 512. |

---

## 6. Quest Patches — non-blocking

Five patches: **Brave · Calm · Kind · Curious · Asked for Help**. A patch is what
the child thinks helped — never a score.

| | |
|---|---|
| **Count** | 5 |
| **Canvas** | 256 × 256, circular or shield embroidered-badge form |
| **Path** | `src/assets/quest/patch-<id>.webp` |

Code-drawn stand-ins are more defensible here than elsewhere — patches are
small, geometric and badge-like — but painted versions would be better, and the
patch board is the thing that makes the room visibly change and gives a child a
reason to come back.

---

## 7. Voice — **blocking for the 5–7 band**

Not art, but the same kind of dependency, and it is the one most likely to be
forgotten.

The machinery is **complete and shipping**: `content/audio-manifest.json` →
`AudioService.preloadZone` → `play(id)` → `replay(id)` → mute (persisted) →
**silent fallback on a missing file, by hard requirement**. What is missing is
every recording — the manifest holds three WAV beep placeholders.

| | |
|---|---|
| **Count** | ~55–70 lines: Olive's quest lines, each beat prompt, each per-band choice label |
| **Format** | mp3, mono, 64–96 kbps |
| **Keying** | Stable content IDs, e.g. `treehouse_hideaway.olive.quest-approach-5-7.001`. IDs are **permanent once assigned** — never renumbered, never reused. |
| **Script** | The dev-mode missing-audio coverage report generates the recording checklist automatically once the lines are authored. |

---

## Delivery checklist

- [ ] File at the exact path above, exact spelling
- [ ] True RGBA, no baked background, no baked ground shadow
- [ ] Run through `matte-characters.mjs` (character art)
- [ ] Ground contact = bottom-centre of opaque content, **or** a `PIVOT_OVERRIDES` note supplied
- [ ] Checked at 390 px width, not only at full canvas
