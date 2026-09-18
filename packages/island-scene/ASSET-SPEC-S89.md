# ASSET-SPEC-S89 — Treehouse Vertical Slice

Production art specification for **S-89** (board v1.3 / backlog v9).

Companion to `ASSET-SPEC.md` (free-build item sprites).

> **Two things this document keeps separate.**
>
> **A production asset requirement** is what the slice needs in order to ship.
> **Permission to demonstrate composition with a placeholder** is what lets
> engineering prove staging and interaction before that art exists. EC-1 has the
> second and not the first. Nothing code-drawn, and no stand-in casting, is
> approved art or an approved character — including anything that has already
> appeared in a review capture.

---

## Style references — there are TWO registers, not one

An earlier draft of this document imposed a single "bold dark ink outline
`#23201c`" rule on every family. That was wrong: it is the world-map register,
and applying it to characters and interiors would flatten the painterly
direction the Treehouse is actually built in.

| Register | Shipped reference (in repo) | Used by |
|---|---|---|
| **Painterly storybook** — soft modelled edges, warm light, no hard ink keyline | `src/assets/interiors/treehouse-hideaway.webp`, `public/avatars/core/*.webp`, `public/guides/*.webp` | Olive, travel poses, the diorama and everything on the table, choice illustrations |
| **Wind Waker-adjacent cel** — flat fills, bold `#23201c` keyline | `src/assets/sprites/*.webp`, `src/assets/landmarks/*.webp` | the forest travel kit (tree variants) |

Match the register of the family's own reference, not the other family's.

**Reference accessibility — stated plainly.** The shipped files above are in the
repository and can be matched directly. The **approved visual concepts for
Olive are NOT in the repository**; the direction recorded below is transcribed
from the brief and has not been checked against those concepts. Whoever briefs
this art should work from the approved concepts, not from this paragraph.

## Standing rules

**Characters are ANIMALS only.** No human attributes anywhere. Absolute, and
predates S-89.

**Format.** WebP, lossy q80+, true RGBA cutout, no baked background, no baked
ground shadow (every render site draws its own). Character art is matted
**offline** by `tools/island-art/matte-characters.mjs`, never at runtime.

**Anchoring.** Render sites measure the opaque-content bbox at load
(`render/contentBounds.ts`) and pin by true feet / horizontal centre, scaling by
visible content height. Padding is free; ground contact must be the
bottom-centre of the opaque content. A pose whose contact is elsewhere needs one
line in `render/avatarTexture.ts`'s `PIVOT_OVERRIDES` — flag it on delivery and
it costs no layout work.

---

## Integration status — what is and is not a "file drop"

An earlier draft claimed every family was a file drop. That is true of exactly
one of them today. The rest need code before art can land.

| Family | Today | To accept production art |
|---|---|---|
| Room painting | **File drop** — build-time glob in `render/treehouseArt.ts` | nothing |
| **Diorama** (clearing, scrub, stone stack, tray, notice mark) | `QuestTable.ts` calls `drawClearing` / `drawScrub` / `drawStoneStack` / `drawTray` / `drawNoticeMark` in `quest/dioramaArt.ts` **directly** | a texture registry for the quest art, loading through `SceneRenderer` (alongside `loadQuestCast`), and each call site swapped for a sprite placed on the same anchor |
| **Choice illustrations** | `drawChoiceArt` / `drawCardFace` called directly, keyed by `ChoiceId` | same registry; card art keyed by beat + choice id rather than by the two EC-1 ids |
| **Olive** | one texture, resolved from the generic nine-guide `public/guides/Owl.webp` via `guideCatalog` | a pose-aware manifest + loader, and a pose selector in `QuestTable` (`neutral` / `encouraging` / `listening`) |
| **Travel poses** | nothing — travel is not built | a `travelPose` registry with a documented fallback order |
| **Patches** | nothing — patches are not built | model, storage contract, and a patch board render site |

**Estimate: the diorama + choice registry is the bulk of it**, and it is the
same mechanism for both, so it should be built once.

---

## 1. Smallest first production-art batch

The five assets that would let the **corrected EC-1 composition** be judged on
production art rather than scaffolding, in priority order:

| # | Asset | Why first |
|---|---|---|
| 1 | **Diorama base plate** — the miniature clearing | The weakest thing on screen. It currently reads as a flat green plate, and it is the surface everything else in the story stands on. |
| 2 | **Olive, `neutral` pose only** | She is large at every viewport in the corrected composition and is currently a generic guide owl standing in for the character who sets the guide quality bar. |
| 3–4 | **Two choice illustrations** — "walk over", "wave hello" | The only two cards in the beat, and the things a non-reading child has to tell apart. |
| 5 | **The tray** | Small, but it is the piece that makes the choices read as part of the table. |

Deliberately **not** in the first batch: the other two Olive poses, the four
diorama scene states, patches, travel poses, tree variants. They belong to beats
and journeys EC-1 does not contain.

---

## 2. Olive — blocking for production visual acceptance

Reference: `public/guides/*.webp` for register; **the approved Olive concepts
for the design** (not in this repository — see above).

Direction as recorded in the brief: owl · warm · wise · encouraging ·
non-judgemental · expressive · right for ages 5–12 · slightly more sophisticated
proportions than preschool/chibi · **teal scarf** · **explorer /
Treehouse-keeper satchel** · subtle map-and-adventure identity · richer
painterly storybook treatment · visibly distinct from a selectable Island
Friend.

A generic owl illustration does not satisfy this.

| | |
|---|---|
| Poses | `neutral` (batch 1) · `encouraging` · `listening` |
| Canvas | 480 × 640, feet at the content bbox bottom |
| Path | `public/guides/olive/olive-<pose>.webp` |

Interim: falls back to `Owl.webp`, logged once.

**Candidates received 2026-09-18 — not integrated, not accepted.** Three poses
derived from the approved concept are retained at
`tools/island-art/source/olive-poses-2026-09-18/` (source only; nothing ships,
nothing imports them, the `Owl.webp` fallback is untouched). They match this
section's canvas exactly: 480 × 640 RGBA, 512 px of content, feet at the content
bbox bottom. All ten files verify against the pack's own SHA-256 manifest.

One measured integration note, because it decides whether Olive stands still
when her pose changes: the three exports share a bbox centre of **0.5000**, so
anchoring on `contentBounds.centerX` aligns the boxes and moves the bird — the
encouraging pose's feet sit **56 px (10.9% of her height) left** of the others'.
`render/avatarTexture.ts`'s `PIVOT_OVERRIDES` exists for exactly this; the three
entries are written out in that folder's `RETAINED.md`. In-game scale, contrast
over the room painting, wing clipping and every device check remain unverified.

## 3. Quest Table / diorama — blocking for production visual acceptance

Reference: the room painting it sits on, at miniature scale.

| | |
|---|---|
| Base plate | 1 painted clearing, modelled ground with a visible far edge, in the room's eye-level perspective. **768 × 384.** (batch 1) |
| Scene states | 4 — `group-playing` · `approach` · `aftermath` · `resolution`. Dressing only; shared base plate. **512 × 256** each, transparent. |
| Tray | 1 shallow wooden tray hanging off the table's near rim. **512 × 200.** (batch 1) |
| Closed dressing | 1 — the Quest Table at rest, inviting a tap. **384 × 384.** |
| Path | `src/assets/quest/diorama-<name>.webp` |

## 4. Illustrated choices — blocking for production visual acceptance

Reference: the room painting; legibility governs.

| | |
|---|---|
| Count | 2 for EC-1's beat (batch 1); ~9 across the full seven beats |
| Canvas | 512 × 384, content ~80% |
| Path | `src/assets/quest/choice-<beat>-<slug>.webp` |
| Hard rule | Two cards in one beat must be tellable apart **with the sound off and the label covered**, at card size on a 390 px phone (~170 × 120 px). Test at that size, not at 512. |

## 5. The diorama group — TEMPORARY CASTING, UNAPPROVED

The three characters playing the group are currently `LEGACY_AVATARS` already
shipped in `public/avatars/` — Hedgehog, Squirrel and Penguin — chosen so EC-1
could demonstrate the composition without commissioning character art.

- **This casting is temporary and unapproved.** It is a placeholder for
  demonstration, **not** a production conclusion, and specifically not a finding
  that "no new art is needed" for the group.
- **Their production visual fit is unapproved** — whether these three characters
  belong in this story, at miniature scale, in this register, is an open
  question for art direction.
- **No supporting character has been approved, and none is named.** An earlier
  draft of the beat copy called one of them "Pip". That name has been removed
  from the code and from this document's requirements; no name should be
  reintroduced without approval.

Production requirement, when the casting is settled: **3 miniature-scale group
characters**, painterly register, sized to read at ~60 px tall.

## 6. Quest Patches — subject to production visual acceptance

Five: **Brave · Calm · Kind · Curious · Asked for Help**. A patch is what the
child thinks helped — never a score.

| | |
|---|---|
| Canvas | 256 × 256, embroidered-badge form |
| Path | `src/assets/quest/patch-<id>.webp` |

A patch's stitched border is part of the object, so a defined edge here is the
subject's own and not the world-map keyline. **Appearance remains subject to
production visual acceptance** — code-drawn stand-ins are for demonstration and
are not approved final art, whatever their simplicity might suggest.

## 7. Six travel poses — blocking for EC-2

Reference: `public/avatars/core/*.webp`.

| | |
|---|---|
| Count | 6, one per core Island Friend |
| Pose | 3/4-**back**, mid-stride, walking away from camera |
| Canvas | 480 × 640, content ~70–85% of height |
| Path | `public/avatars/travel/<key>-travel.webp` |
| Keys | `otter`, `dog`, `cat`, `bunny`, `deer`, `red_panda` |

Silhouette and accessory carry recognition from behind; keep the accessory
prominent. **No arrival/turn pose is required** — the existing front-facing core
art is the arrival pose, which keeps this at six files rather than twelve.

**Requirement update, 2026-09-18.** Greg approved the *direction* of Doug's
back-view walking prototype. A single travel pose is no longer sufficient:
**final travel art needs an actual walk cycle — legs, arms and body moving
together**, not one still frame. **Doug first**; polish and in-game validation
on him are outstanding, and the other five Friends follow only once he is
validated. So the table above is the floor, not the deliverable: treat
`<key>-travel.webp` as the resting/reference frame and expect the shipped form
to be a frame sequence or sheet whose per-frame canvas and anchor match it. The
frame count, timing and delivery format are not settled here and should be
agreed with whoever animates Doug before the other five are commissioned.

## 8. Forest travel kit — blocking for EC-2

Reference: `src/assets/sprites/tree-01.webp` / `tree-02.webp` — **this family is
the cel register**, matching those two exactly for scale convention and keyline
weight.

| | |
|---|---|
| Count | 2–3 new, for 4–5 total: a conifer · a slender birch-like trunk · a broad low canopy |
| Plus | **1 canopy-overhang bough** hanging in from off-frame — the single highest-value piece for the depth illusion |
| Canvas | 512 × 768 (trees), 768 × 512 (bough) |
| Path | `src/assets/sprites/tree-0N.webp`, `src/assets/sprites/canopy-01.webp` |

## 9. Voice — blocking for the 5–7 band

Machinery is complete and shipping: manifest → `preloadZone` → `play` →
`replay` → mute → **silent fallback on a missing file, by hard requirement**.
Every recording is missing; the manifest holds three WAV beep placeholders.

| | |
|---|---|
| Count | ~55–70 lines across the full quest (2 prompts + 4 choice labels + Olive for EC-1's beat alone) |
| Format | mp3, mono, 64–96 kbps |
| Keying | Stable content IDs, permanent once assigned, never renumbered |
| Script | The dev-mode missing-audio coverage report generates the checklist once lines are authored |

---

## 10. Treehouse exterior — blocking for the approved visual direction

**This is the one asset the 2026-09-17 handoff makes urgent, and the one it
cannot supply.** The approved references are in the repo at
`tools/island-art/source/handoff-2026-09-17/` (source only — outside `public/`
and `src/assets/`, so nothing ships them).

### Why it could not be derived here

| Route | Why not |
|---|---|
| Cut the Treehouse out of `01-approved-island-overview.png` | It occupies roughly **380 × 315 px** of a 1555 × 1012 opaque painting. The shipped landmark is 1024 × 1024 with ~810 × 859 of content — a 2.7× linear upscale, and the base is overlapped by painted foliage that would have to be repainted to knock it out. |
| Use `02-treehouse-dock-scale-study.png` | It is the right view and the right resolution, but **its framing crops the canopy**, which the handoff explicitly forbids reusing as an overview crop — and **Doug stands on the balcony**. Removing him means repainting the doorway behind him; baking him in is forbidden outright. |

So the exterior below is specified, not approximated. Nothing in this chunk
pretends to be it.

### What the world map needs

| | |
|---|---|
| View | Same three-quarter elevated view as every other landmark — match `src/assets/landmarks/treehouse.webp` exactly for camera and eye height, so it drops in without re-tuning |
| Register | **Wind Waker-adjacent cel**, matching the other landmarks (flat fills, bold `#23201c` keyline) — *not* the painterly register |
| Canvas | 1024 × 1024, RGBA, whole canopy inside the canvas with transparent margin |
| Path | `src/assets/landmarks/treehouse.webp` (replaces in place) |
| Format | WebP q80+, true cutout, **no baked ground shadow** — the renderer draws its own |
| Ground contact | Bottom-centre of the opaque content = where the trunk and the **foot of the stairs** meet the ground |

Architecture that must survive, from the approved references:

- Prominent **usable room** and a **wrapping balcony** integrated with a living trunk
- **Blue-green shingled roof** (the current asset's roof is brown wood)
- **Leaf doorway** — arched door with the leaf motif
- **Sheltered lookout** with the telescope off the balcony rail
- **Curved stair approach with frequent, low risers** and a rope handrail —
  **not** the straight rung ladder the current asset carries
- Hanging lanterns, leaf pennant, vines

### The layer split, and why it is not optional

The handoff asks that a Friend be able to move **in front of and behind**
relevant elements. Today the landmark is one flat sprite y-sorted on its base
(`zIndex = baseY + 0.2`), so a Friend standing north of the base is drawn behind
the *entire* image — canopy included. Deliver **two layers on the same
1024 × 1024 canvas and the same anchor**, so they overlay exactly:

| Layer | Path | Contains | Drawn |
|---|---|---|---|
| back | `treehouse.webp` | canopy, cabin, trunk, balcony, the stair flight | behind the Friend |
| front | `treehouse-front.webp` | only what a Friend should pass BEHIND: the near stair rail, the nearest root buttress, the lowest foreground leaves | in front of the Friend |

The `BOAT_ART` back/front pair in `render/zones.ts` is the working precedent —
same idea, already shipping.

### Numbers the renderer will want back

Anchors are measured from the delivered PNG by
`tools/island-art/landmarks-anchors.mjs`; `LANDMARK_ART.treehouse_hideaway` in
`render/zones.ts` then carries `scale`, `anchorX`, `anchorY`, `contentH` and
`contentBox`. Today's values are `scale 0.74`, `anchorY 0.9`,
`contentBox [108, 51, 918, 910]`. If the new art's proportions differ, only
`scale` should need an eye pass — the footprint (5 × 5 tiles at grid 11,18) and
the locked `defaultLayout.ts` coordinates do **not** move.

## Delivery checklist

- [ ] Exact path and spelling above
- [ ] Correct **register for that family** (painterly vs cel — see the table at the top)
- [ ] True RGBA, no baked background, no baked ground shadow
- [ ] Run through `matte-characters.mjs` (character art)
- [ ] Ground contact = bottom-centre of opaque content, or a `PIVOT_OVERRIDES` note supplied
- [ ] Checked at 390 px width, not only at full canvas
- [ ] Confirm the receiving code exists (see **Integration status**) — for most families art cannot land until a registry is built
