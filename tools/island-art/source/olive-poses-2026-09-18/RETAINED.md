# Retained on 2026-09-18 — candidates, NOT integrated

The Olive pose pack exactly as received, unmodified. All ten files verify
against the pack's own `manifest.json` (SHA-256 and byte count, 0 mismatches).

**Nothing here ships.** This folder is outside `public/` and outside
`src/assets/`, nothing imports it, and no runtime code was changed to receive
it. Olive still falls back to the generic `Owl.webp` at runtime, logged once, as
before. These are candidates for the next art-integration turn.

## What was measured here (independently, not taken on trust)

Measured from the three runtime WebPs with the same alpha > 32 threshold the
pack used, and with the repo's own content-bounds convention
(`render/contentBounds.ts`):

| pose | canvas | contentH | feetY | bbox centreX | **foot centreX** | foot shift vs neutral |
|---|---|---|---|---|---|---|
| neutral | 480 × 640 RGBA | 512 px | 0.8922 | 0.5000 | 0.5104 | — |
| encouraging | 480 × 640 RGBA | 512 px | 0.8906 | 0.5000 | 0.3937 | **−56 px (−10.9% of her height)** |
| listening | 480 × 640 RGBA | 512 px | 0.8922 | 0.5000 | 0.4813 | −14 px (−2.7%) |

This reproduces `pose-metadata.json` exactly, and it matches §2 of
ASSET-SPEC-S89.md: 480 × 640, feet at the content bbox bottom, and these three
poses.

**The sideways-hop risk is real, but not by the mechanism the pack's README
describes.** It warns that "the extended encouraging wing shifts the whole-image
bounding-box center". Measured, the bbox centre is **0.5000 for all three** —
the exporter already re-centred each cutout on the canvas. The hop comes from
the opposite direction: because the bbox centres agree, anchoring on bbox centre
(which is what `contentBounds.centerX` returns) lines up the *boxes* and
therefore moves the *bird*, since the outstretched wing is padded on one side
only.

`render/avatarTexture.ts`'s `PIVOT_OVERRIDES` is the mechanism for this and is
currently empty. The entries the measurements call for:

```ts
const PIVOT_OVERRIDES: Record<string, { centerX?: number; feetY?: number }> = {
  "olive-neutral.webp":     { centerX: 0.5104 },
  "olive-encouraging.webp": { centerX: 0.3937 },
  "olive-listening.webp":   { centerX: 0.4813 },
};
```

Not applied: applying it means wiring pose selection, which is the next turn's
work, and an override on a texture nothing loads yet would be dead code. The
numbers are recorded here so that turn starts from measurement rather than from
eyeballing.

## Still unverified — nothing below was checked

In the running game: in-room scale against the Treehouse painting, contrast over
that painting, readable expression at 390 px, wing clipping, floating feet, and
every real-device check. The pack states the same, and it is right to.
