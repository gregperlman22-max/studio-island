# Zone interior paintings

Drop the final painted **Treehouse Hideaway** room in here as:

    treehouse-hideaway.webp

`src/render/treehouseArt.ts` picks it up with a build-time glob — no code
change needed. While this folder holds no image, `TreehouseRoom` draws a warm
code-built stand-in instead and never requests a file (so no 404s).

Spec: one full-room illustration, ~2048×1152 (16:9), **no interface text or
buttons baked in** (every label is drawn in code over the art), subject kept
clear of the outer ~8% because the image is drawn cover-fit and crops on
extreme aspect ratios.
