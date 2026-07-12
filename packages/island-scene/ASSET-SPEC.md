# ASSET-SPEC — Free-Build Island Item Sprites

Production spec for the 31 build-item illustrations in
`content/build-items.json`. Until these land, the engine renders placeholder
colored blocks; dropping a finished sprite in requires **no code change**
beyond registering its file (the `sprite` key in build-items.json is already
assigned).

## Style — match the existing island art exactly

Reference the shipped landmark art (`src/assets/landmarks/*.webp`) and world
sprites (`src/assets/sprites/*.webp`): the register is **Wind Waker-adjacent
cel**: flat vivid fills, soft top-edge highlight band, minimal shading, and a
**bold dark ink outline** — `#23201c`, weight reading ~4–5 px at final render
scale. Warm, rounded, chunky silhouettes; nothing spindly or realistic. No
baked ground shadows (the engine draws contact shadows); no baked background
— **clean RGBA cutouts** like `sprites/tree-01.webp`.

- **Palette anchors** (sample from shipped art): sand `#ecdcae`, meadow
  `#a8d46a`, timber `#b07a44` / dark wood `#6e4a2a`, warm glow `#fff1a8`,
  stone `#8d8475`, accent red `#e23b3b`, gold `#ffce4a`, ink `#23201c`.
- **Figures are ANIMAL-ADJACENT-SAFE**: the child/adult/baby figures are
  simple rounded "peg people" with NO skin-tone realism, NO hair detail, NO
  gender coding — warm neutral tones (e.g. `#e8c9a0` body, single accent
  garment color). The knight reads by helmet + tiny shield; the dragon is
  round, friendly, big-eyed — a plush toy, not a monster.

## Format & registration

- **File**: WebP (lossy q80+, alpha), RGBA cutout, no padding beyond ~8 px.
- **Canvas**: 512×512 for 1×1-footprint items; 768×512 for 2×1; 768×768 for
  2×2. Content fills ~85% of canvas width.
- **Anchor**: bottom-center of the object's ground contact = bottom-center
  of the opaque content (the engine base-pins sprites the way landmarks are
  pinned — see `LANDMARK_ART` anchors). Flat ground items (blanket, pond,
  garden bed) are drawn in the island's isometric top-down (2:1 diamond)
  perspective instead of elevation view.
- **Rotation**: 4 quarter-turn variants are NOT required. One ¾-view sprite
  per item; the engine mirrors horizontally for E/W where it helps
  (fence/bridge/bench/gate DO need a second variant rotated to the
  perpendicular axis — mark [R] below).
- **Delivery naming**: exactly the `sprite` key + `.webp`, e.g.
  `build/comfort/lantern.webp` under `public/`.

## The 31 items

| Sprite key | Item | Footprint | Notes |
|---|---|---|---|
| build/structures/small-house | Small House | 2×2 | timber + warm window, pitched roof |
| build/structures/treehouse | Treehouse | 2×2 | mini cousin of the landmark treehouse |
| build/structures/fence [R] | Fence | 1×1 | 3-plank section, tileable ends |
| build/structures/bridge [R] | Bridge | 2×1 | arched planks (pairs with pond) |
| build/structures/gate [R] | Gate | 1×1 | fence-matched arch, slightly open |
| build/structures/tent | Tent | 2×2 | striped canvas, open flap |
| build/nature/tree-oak | Oak Tree | 1×1 | round canopy (kin of tree-01) |
| build/nature/tree-pine | Pine Tree | 1×1 | stacked cones (kin of tree-02) |
| build/nature/tree-palm | Palm Tree | 1×1 | leaning trunk, beachy |
| build/nature/bush | Bush | 1×1 | kin of bush-01 |
| build/nature/flowers | Flowers | 1×1 | small cluster; may sit on garden bed |
| build/nature/rock | Rock | 1×1 | kin of rock-01, smaller |
| build/nature/pond | Pond | 2×2 | FLAT top-down water diamond, sandy rim |
| build/nature/garden-bed [R] | Garden Bed | 2×1 | FLAT tilled soil box (a surface) |
| build/figures/child | Child | 1×1 | peg person, small |
| build/figures/adult-1 | Grown-up | 1×1 | peg person, tall, accent color A |
| build/figures/adult-2 | Grown-up 2 | 1×1 | peg person, tall, accent color B |
| build/figures/baby | Baby | 1×1 | seated peg, tiny |
| build/figures/dog | Dog | 1×1 | chunky, floppy ears |
| build/figures/cat | Cat | 1×1 | chunky, curled tail |
| build/figures/bird | Island Bird | 1×1 | may perch on surfaces |
| build/figures/crab | Beach Crab | 1×1 | friendly, big claws |
| build/figures/knight | Brave Knight | 1×1 | peg person + round helm + tiny shield |
| build/figures/dragon | Friendly Dragon | 2×2 | the one "big feeling" figure — plush, warm |
| build/comfort/campfire | Campfire | 1×1 | mini of the landmark ring, unlit-warm |
| build/comfort/lantern | Lantern | 1×1 | glows `#fff1a8`; sits on tables |
| build/comfort/bench [R] | Bench | 2×1 | timber, cozy |
| build/comfort/table [R] | Table | 2×1 | sturdy top (it's a surface) |
| build/comfort/blanket | Picnic Blanket | 2×2 | FLAT top-down checkered diamond |
| build/comfort/swing | Swing | 1×1 | frame + rope seat |
| build/comfort/mailbox | Mailbox | 1×1 | little flag up |

## Main-island dinghy — the build-island entry point

The little beached dinghy beside Welcome Dock is how the child ferries to
the free-build island, and it is still a code-drawn placeholder
(`TextureProvider.bake("boat")`): hull + bench + leaning oar in ~43×29 code
px. It deserves real art — it's a tappable entry point and should read as
inviting.

- **Scene**: a friendly beached rowing dinghy, ¾ view, nose up the sand —
  warm timber hull `#9a6b40` family, visible bench seat, one oar leaning
  over the gunwale. Same register as everything above: chunky, rounded,
  bold ink outline, top-edge highlight. No water — it sits on the main
  island's beach (sand `#ecdcae`).
- **Canvas / format**: 512×512 WebP RGBA cutout, content ~85% of canvas
  width, bottom-center anchored at the hull's ground contact, no baked
  shadow (the engine draws the contact-shadow ellipse).
- **Delivery**: `public/build/world/dinghy.webp`.
- **Registration note — NOT drop-in**: unlike the 31 build items, the
  decoration pipeline has no size normalization (`buildDecorations`
  multiplies native texture size by the layout scale only, and the host
  places the dinghy at tile (38, 41), scale 1.4). Swapping in a 512-px
  texture therefore needs a small engine change: a file-backed decoration
  provider that normalizes the sprite to the code-drawn footprint (~43
  world px wide at scale 1) so the layout doesn't shift.

**Optional (nice-to-have):** a dedicated build-island arrival background
(the sail cinematic currently reuses the main island's `arrival-bg`).
