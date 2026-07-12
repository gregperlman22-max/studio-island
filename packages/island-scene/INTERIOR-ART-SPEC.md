# INTERIOR-ART-SPEC — Mode-2 Zone Interior Paintings

Production spec for painted interiors for all **9 zones**. Interiors are the
Mode-2 "walk inside a zone" view (`src/render/ZoneView.ts` +
`src/render/zoneEnv.ts`): today every interior is flat code-drawn vector art.
Seven zones have bespoke code scenes; **Star Market** and **Lazy Lagoon**
still fall back to a generic environment. This spec replaces all of it with
painted art matching the main island.

**Integration is NOT drop-in** (unlike ASSET-SPEC build items): `zoneEnv.ts`
was designed to be "swappable for atlas art later behind the same builder
signature", but that texture-backed builder does not exist yet. Landing this
art needs one engine change — a `buildZoneEnv` path that assembles the layer
kit below instead of drawing. Registration values (anchors, horizon lines)
follow the same offline pipeline as `LANDMARK_ART`
(`tools/island-art/landmarks-anchors.mjs` bbox pass).

## How the interior renderer works (measured from code)

Numbers below are from `zoneEnv.ts` / `ZoneView.ts` — they are the contract
the art must fit.

- **Four parallax planes**, back → front, with fixed scroll factors
  (`PARALLAX`): **sky 0.0** (never scrolls) · **far 0.2** · **mid 0.5**
  (the landmark) · **ground 1.0**. The child's avatar rides the ground plane
  in front of all four; UI (exit tab, practice card, guide) overlays on top.
- **Fullscreen & resolution-independent**: the view is rebuilt at the live
  viewport size on every enter/resize — art must survive anything from a
  360×640 portrait phone to a wide desktop window. Nothing is letterboxed.
- **World width** = `max(2.4 × screenW, 1200)` px of ground-plane travel.
  Painted coverage per layer: far = `0.2 × worldWidth + screenW` (≈ 1.5
  screens), ground = `worldWidth + screenW` (≈ 3.4 screens). Sky = 1 screen.
- **Horizon** sits at `0.60 × screenH`; the ground strip fills the bottom
  40% of the screen.
- **Character**: spawns at `0.20 × worldWidth`, walks to the beacon at
  `0.72 × worldWidth`. Feet line at `0.82 × screenH`; the illustrated avatar
  renders **~160–220 px tall** (50 avatar-local px × scale clamp 3.2–4.4,
  keyed to `screenH / 230`). Interior props must feel in-scale with that.
- **Landmark placement**: the mid layer is positioned so the landmark stands
  beside the character when they reach the beacon
  (`midX = 0.5 × (beaconX − 0.4·w) + 0.4·w`). Landmark code-art currently
  reads **~50–70% of screen height** (scale `max(2.0–2.4, h/240–h/300)`) —
  painted art will be eye-tuned to the same presence, like Mode-1 scales.
- **Beacon is engine-drawn**: a pulsing additive glow ellipse is re-filled
  every frame at the beacon anchor, brightening as the child approaches
  (discovery within 150 world px; tap hit radius 100 screen px). The art
  supplies the **unlit beacon object** (door, easel, sign…); never bake the
  glow.
- **Practice auto-launch**: a zone with a `practices.json` opens its
  PracticePlayer the moment the enter-tilt lands — a `min(0.86·w, 520)` px
  card over a **50%-alpha `#1a1206` dim scrim covering the whole interior**.
  Today that is Calm Beach (Wave Breathing); any zone can gain one. Every
  interior must therefore read as a calm, uncluttered backdrop at 50% dim,
  with its identity still legible around a centered card.
- **Reduced motion**: all per-frame animation stops and a single static
  frame must read complete (the code draws the flame/waves once, lit).

## Deliverables — the per-zone layer kit

Four files per zone, WebP, delivered under `public/interiors/<zone>/`:

| File | Canvas | Format | Content |
|---|---|---|---|
| `sky.webp` | 2048×1536 | RGB, q80+ | Full-bleed gradient sky + celestial props. Engine cover-crops to any aspect: keep suns/moons/clouds inside the central 60% safe zone; edges are pure gradient bleed. |
| `far.webp` | 2048×1024 | RGBA, q80+ | Distant silhouettes (tree lines, sea, hills). **Seamless horizontal tile.** Horizon/base line at **y = 768** (75% down); fully transparent above the silhouette tops. |
| `mid.webp` | 1024×1024 | RGBA cutout | The zone landmark, close-up — the SAME structure as its Mode-1 art (`src/assets/landmarks/*.webp`), re-staged at ground level. Base-pinned like `LANDMARK_ART` (anchors pipeline supplies `anchorX/anchorY/contentBox`). Welcome Dock may go 1536×1024 (wide, low scene). |
| `ground.webp` | 2048×1024 | RGB, q80+ | The terrain underfoot. **Seamless horizontal tile.** Horizon rim (the bright edge line the code draws today) along the top edge; texture interest fades toward the bottom so the walking character stays readable. |

Registration per zone (produced offline, consumed by the texture-backed
builder): mid-art anchor + content box, **beacon anchor** as a fraction of
the mid canvas, and any engine-FX anchor points (flame base, beam pivot —
see per-zone notes).

## Style — match the main island exactly

Same register as ASSET-SPEC: **Wind Waker-adjacent cel** — flat vivid fills,
soft top-edge highlight band, minimal shading, bold `#23201c` ink outline
reading ~4–5 px at final render scale on **structures and props**. Interiors
are environments, so: NO outlines on sky gradients, sea bands, or ground
washes — ink is for the built/solid things (the code art already follows
this). No baked character shadows. Warm, rounded, chunky; nothing spindly.

- **Palette anchors** (shared with ASSET-SPEC): sand `#ecdcae`, meadow
  `#a8d46a`, timber `#b07a44` / dark wood `#6e4a2a`, warm glow `#fff1a8`,
  stone `#8d8475`, accent red `#e23b3b`, gold `#ffce4a`, ink `#23201c`.
- Each interior's palette below is **measured from the shipped code art** —
  treat those hexes as the mood target, not paint-by-numbers.
- The mid-layer landmark must read as the same building the child just
  tapped on the world map (reference the matching `landmarks/*.webp`).
- The resident guide (`public/guides/*.webp`, 480×640 cutouts) appears over
  these interiors in the dialogue overlay — interiors should flatter the
  guides' colours, never fight them.

## Engine-drawn effects the art must leave room for

The engine animates these ON TOP of the painted layers each frame. Paint the
static base; leave the marked region clean:

| Zone | Engine FX over the art |
|---|---|
| Campfire Circle | The flame itself (3-tone `#ff7a2d`/`#ffd23d`/`#fff1a8`) + warm ground glow — paint the fire pit UNLIT (logs + stone ring only) |
| Treehouse Hideaway | Door glow; gentle canopy sway (whole mid rotates ±0.7°) |
| Lighthouse Point | Rotating beam cone from the lantern room; door glow |
| Art Hut | Easel glow (theme accent tint) |
| Arcade Cove | Blinking marquee dots above each cabinet; green-cabinet glow; shoreline foam lines |
| Welcome Dock | Sign glow; moored-boat bob (boat may be a separate cutout, see notes); shoreline foam |
| Calm Beach | Meditation-circle glow (slow 1.6 Hz calm pulse); shoreline foam |
| Star Market | Stall glow (see scene brief) |
| Lazy Lagoon | Lily-pad glow; water foam (see scene brief) |

Also screen-fixed on top everywhere: the exit tab hugging the left edge at
`0.6 × screenH` (keep far-left mid/ground art low-detail), the practice
card + dim scrim, and the tap-ripple FX.

## The 9 interiors

### 1. Campfire Circle — Bruno the Bear
Cozy dusk clearing; "pull up a log and get cozy." **Sky** deep indigo
`#221a3a` → ember orange `#e29a55`, soft moon high-left (`#fff3d6`).
**Far** dark hill band `#1d2436` with two silhouette pine lines `#141a14` /
`#0e120e` ringing the clearing. **Mid** the stone fire ring (alternating
`#9a9088`/`#827a72` stones), crossed logs `#5a3c22`/`#6e4a2a` — **unlit**;
the flame is engine FX and is the beacon. **Ground** dark earth `#3a2a1c`
with a firelit wash near the horizon, ember speckle, and two log seats
flanking the ring. Discovery tint `0xff9a3d`.

### 2. Treehouse Hideaway — Olive the Owl
Deep forest, dappled light; imagination headquarters. **Sky** canopy-dark
green `#17352a` → leaf-lit `#86b878`, with 4–5 soft vertical light shafts
(`#eafff0`, very low alpha). **Far** towering trunk-and-canopy silhouettes
`#0c1d14` / `#08130d` over `#102219`. **Mid** the great tree: trunk
`#6e4a2a`, round layered canopy in theme foliage green, plank platform +
cabin `#b07a44` with pitched `#5a3c22` roof, lit window `#ffe39a`, rope
ladder to the ground — beacon = the warm cabin **door `#ffcf6e`**.
**Ground** rich soil `#3a2c1e`, rim `#5c4730`, arching roots + a few
red-cap mushrooms (`#d8552f` / `#e9ddc4`). Tint `0xffcf6e`.

### 3. Lighthouse Point — Wally the Whale
Dramatic-but-safe cliff top; the thinking spot. **Sky** stormy slate
`#3c466a` breaking to gold `#f2c074` at the horizon, low sun glow
`#fff0c0`, a few dark clouds `#3a3550`. **Far** sea band `#2e4a6a` with
`#9fd0e6` glints + headland silhouettes `#27314a`. **Mid** the white tower
`#fafafa` with red `#e23b3b` spiral stripes, dark lantern-room frame
`#4a3b2c` with `#fff1a8` glass, red cap, on a rock base — beacon = the
**door `#ffd870`** at its foot; the rotating beam pivots from the lantern
room (engine FX). **Ground** grey cliff rock `#6f6e6a`, rim `#9a988f`,
darker crack line running the clearing. Tint `0xffe79a`.

### 4. Art Hut — Fern the Fox
Bright cheerful midday; "let's make something amazing." **Sky** clear blue
`#7ec8ef` → `#e6f6ff`, high sun `#fff6c8`. **Far** soft rolling meadow
hills `#9fd06a` / `#86c25a` with tiny distant trees. **Mid** the paint-box
hut (theme-accent walls, `#4aa6c9` roof, `#5a3c22` door, `#ffe39a` window)
hung with little framed paintings (`#ff8aa3`, `#6fb84a`, `#ffd23d`,
`#6aa6ff`) — beacon = the **easel with a started canvas** standing
front-right of the hut. **Ground** meadow grass `#6fb84a`, rim `#a7e25a`,
scattered five-colour flowers. Tint = theme accent.

### 5. Arcade Cove — Mango the Monkey
High-energy beach arcade at sunset. **Sky** vivid violet `#5b2a7a` →
`#ffae5e`, big low sun `#ffd98a` with a glitter trail on the water.
**Far** sunset sea `#7a3f86` with warm `#ffd0a0` shimmer (foam lines are
engine FX). **Mid** three arcade cabinets (`#4a5bd0`, `#e2456b`,
`#22b07a`) with glowing screens (`#9be7ff`; mint `#aef9d2` on the green
one) and `#ffe14d` control panels, under a white-and-accent striped awning
— beacon = the **green right-hand cabinet**; marquee dots above each
cabinet are engine FX. **Ground** sunset-lit sand `#caa46a`, rim
`#ffce8f`. Tint `0x6affc0`.

### 6. Welcome Dock — Captain Pete the Pelican
Golden morning; where every adventure begins. **Sky** morning blue
`#9cc4e6` → warm `#ffe6b3`, gentle sun upper-left `#fff3cf`. **Far** calm
sea `#5fb6c9` with pale `#cdeef2` glints + one tiny far island (green tuft
on a `#6e4a2a` trunk). **Mid** mooring posts `#6e4a2a` with a slack rope
`#d8c49a`, a moored sailboat (`#b5763f` hull, `#cf9457` gunwale, off-white
sail) — deliver the boat as its **own cutout** so the engine can keep its
gentle bob — and the **welcome sign**: `#ffcf6e` panel on a post, `#e2456b`
trim, three painted dots (`#e2456b` `#4a5bd0` `#22b07a`) = the beacon.
**Ground** weathered dock planks `#a9763f` with darker seams — the whole
walk is ON the dock. Tint `0xffe6a0`.

### 7. Calm Beach — Shelly the Turtle
The most peaceful zone; home of Wave Breathing. **Sky** pastel dawn lilac
`#bba9d6` → peach `#ffdcc6`, small soft sun `#fff0e0`. **Far** glassy sea
`#8fc6d2` with `#e6f6f7` glints; slow foam lines are engine FX and pace
the breathing practice — keep the shoreline clean for them. **Mid** a
leaning beach umbrella (theme-accent canopy, `#6e4a2a` pole), a stacked
4-stone cairn (`#9a9088` → `#c2b8a6`), and the **meditation circle traced
in the sand** (`#caa46a` ring, `#fff0cf` inner) = the beacon, glowing calm
blue. **Ground** pale soft sand `#ecdcae`, rim `#fff0cf`. Tint `0xbfe6ff`.
**This interior auto-dims behind the practice card on entry** — it must be
serene at 50% dim, nothing busy.

### 8. Star Market — Rascal the Raccoon  *(no bespoke code scene — new)*
"Check out all the shiny stuff!" Early evening so the shine reads. Build
around the Mode-1 stall art (`landmarks/store-01.webp` — tall timber
market stall). **Sky** dusk teal → warm gold, first stars pricking
through. **Far** low island tree line silhouettes with a string of tiny
warm lights sagging between poles. **Mid** the market stall, awning up,
shelves stacked with star-themed goods (gold `#ffce4a` stars, jars,
pinwheels), lantern strings framing it — beacon = the **glowing counter
lantern / star jar**. **Ground** trodden warm earth path (timber
`#b07a44` boards near the stall) with a stray star-coin sparkle or two.
Tint gold `0xffce4a`. Raccoon-flavoured clutter welcome — tidy chaos.

### 9. Lazy Lagoon — Finn the Frog  *(no bespoke code scene — new)*
"Kick back and chill." Note the Mode-1 art (`landmarks/lagoon-01.webp`) is
a flat top-down pond — this interior needs the invented **elevation view**
of the same lagoon. Lazy warm afternoon. **Sky** hazy green-gold. **Far**
soft jungle-fringe silhouettes + a low rocky spill feeding the lagoon.
**Mid** the still lagoon edge: big lily pads, cattails, a half-sunk log,
dragonflies (static; any motion is engine FX) — beacon = **Finn's biggest
lily pad**, subtly haloed. **Ground** mossy bank greens into damp sand at
the waterline. Tint soft lily green (suggest `0xaee27a`). Everything
droops, floats, or lounges — nothing upright or busy.

## Open questions

- **Layer kit vs. single wide painting per zone**: this spec assumes 4
  layers to preserve the shipped parallax depth. A single full-scene
  painting would kill the parallax — confirm the layer approach before
  production.
- **Star Market / Lazy Lagoon scene briefs** are invented here (no code
  precedent) — approve the briefs above before those two are painted.
- **Welcome Dock boat** as a separate cutout (to keep the bob animation) is
  this spec's recommendation; a static baked boat is the cheaper fallback.
- Engine work to land this art (texture-backed `buildZoneEnv`) should be
  scheduled alongside the first delivered zone so registration values can
  be tuned against real art.
