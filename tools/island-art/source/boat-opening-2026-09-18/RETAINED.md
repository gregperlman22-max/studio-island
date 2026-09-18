# Retained on 2026-09-18 — queued visual direction, NOT implemented

The boat-opening concept package exactly as received. All five files verify
against the package's own `SHA256SUMS.txt`.

**Nothing here ships.** Outside `public/` and `src/assets/`; nothing imports it.
The arrival cinematic (`render/ArrivalView.ts`, `BOAT_ART`, `ARRIVAL_BG_URL`)
is unchanged. This is art direction for later boat work, retained so it lives
with the code; it is not an instruction to begin that work.

Approved direction: approach the sun-emblem Welcome Dock → slow alongside →
the **selected Friend** steps onto the landing, Captain Pete aboard behind.
Doug is the example only; runtime shows the child's actual Friend, never baked
into scenery. `03-arrival-corrected.png` is the only arrival candidate.

## Noted on inspection — concrete dependencies for the later work

- All three are **1672 × 941, opaque, flattened** — no alpha, no layers. Not
  registered to one camera: the dock's angle and the boat's crop differ frame
  to frame (the boat is cut at the left edge in 01 and 03). Runtime needs
  separate environment / water / boat back / boat front / sail / dock-occluder
  / Friend / Pete layers at one shared camera and dock geometry — as the
  package itself says.
- `01-approach.png` carries the stronger wake and sparkle the README asks to
  soften; carry the calmer water of 02/03 forward.
- The Treehouse in all three already shows the approved exterior (blue-green
  roof, leaf door, lookout, curved stairs) — consistent with §10 of
  ASSET-SPEC-S89.md, and a reminder that exterior is still outstanding.
- Existing `BOAT_ART` is a two-layer back/front split with the rider between;
  that mechanism is the right shape for the new boat and should be kept.
