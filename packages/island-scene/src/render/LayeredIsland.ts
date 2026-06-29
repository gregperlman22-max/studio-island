import { Container, Sprite, Texture } from "pixi.js";

/**
 * LayeredIsland — the world map composed from individual illustrated sprites
 * over the painted terrain base. Pure presentation: it owns no world data and
 * never reads input. Build it with the textures, then call `layout()` with the
 * island's world-space bounds (and the landmark marks); it sizes + scatters
 * every layer to fit and keeps vegetation on the sand and off the landmarks.
 *
 * Layer stack (bottom → top): water · beach rim · sand · rocks · grass ·
 * bushes · flowers · trees. Landmarks and avatars are drawn ABOVE this
 * container by the renderer, so a landmark is always visible on top of nature.
 *
 * The terrain art (sand-base-v2) already bakes in colour variation, hills and
 * sandy beach edges, so there are no code colour/elevation overlays — only the
 * thin beach-rim strip that helps the island pop off the water.
 *
 * The scatter is fully deterministic (seeded PRNG) so the island looks the
 * same on every load and every build.
 */
export interface IslandTextures {
  water: Texture;
  sand: Texture;
  grass: Texture;
  rock: Texture;
  tree01: Texture;
  tree02: Texture;
  bush01: Texture;
  bush02: Texture;
  flower01: Texture;
  flowerBush01: Texture;
}

/**
 * A landmark's world-space footprint, handed in so the vegetation scatter can
 * (a) ring grassy structures with green so they feel planted, (b) keep small
 * sandy clearings at the beach/dock/campfire, and (c) push trees off the
 * building sprites so they frame rather than cover them.
 */
export interface LandmarkMark {
  /** Zone key (so the flower scatter can target specific landmarks). */
  key: string;
  /** World-pixel centre x of the footprint. */
  x: number;
  /** World-pixel base/centre y of the footprint. */
  y: number;
  /** Footprint width in grid tiles (sizes the grass ring). */
  w: number;
  /** Tree keep-out radius in world pixels — no tree base may sit inside it. */
  clear: number;
  /**
   * "grass" structures get a green ring + base tufts; "sand" structures
   * (campfire, welcome dock, calm beach) stay on bare sand and act as a grass
   * exclusion clearing.
   */
  ground: "grass" | "sand";
}

export interface IslandLayoutOpts {
  /**
   * Sand/island footprint, pinned to the painted-ground registration so the
   * landmarks line up. The sand is centered at (cx, cy) and scaled so its
   * width equals `spanW`.
   */
  cx: number;
  cy: number;
  spanW: number;
  /** World rect (centered on cx, cy) the water must blanket edge-to-edge —
   *  sized to the viewport at the most-zoomed-out level so there are no gaps. */
  waterW: number;
  waterH: number;
  /** Landmark footprints in world space (for grass rings + tree keep-out). */
  landmarks?: readonly LandmarkMark[];
}

/**
 * Baked tree positions, as offsets normalised to the sand half-extents
 * (x = cx + nx·shx, y = cy + ny·shy). Off-shape positions are snapped onto the
 * sand at runtime (see snapToSand) so they stay on the new irregular silhouette.
 * The trees form natural groves: a lighthouse-adjacent tree, a southern grove
 * and a couple of lone slope trees.
 */
const TREE_OFFSETS: ReadonlyArray<readonly [number, number]> = [
  // Lighthouse — one framing tree to the west only (grove trees that crossed
  // the tall tower were removed and replaced with short bushes at its base).
  [0.607, -0.278],
  // Southern grove — frames the arcade/lazy lagoon from below.
  [0.198, 0.745], [0.289, 0.757], [0.710, 0.404], [0.469, 0.471], [0.409, 0.659],
  // Scattered individuals on the interior slopes.
  [-0.420, -0.193], [0.118, -0.352],
];

// Treehouse forest — the densest stand, tightly grouped around and behind the
// Treehouse Hideaway so it reads as a structure standing IN the woods. These
// are exempt from the treehouse keep-out so they can sit intentionally close.
const CLUSTER_TREE_OFFSETS: ReadonlyArray<readonly [number, number]> = [
  [-0.389, -0.683], [-0.197, -0.246], [-0.446, -0.402], [-0.573, -0.667],
  [-0.536, -0.385], [-0.574, -0.217], [-0.645, -0.684],
];

// Illustrated bushes (bush-01 / bush-02), clustered near the treehouse forest
// and scattered along landmark edges.
const BUSH_OFFSETS: ReadonlyArray<readonly [number, number]> = [
  [-0.269, -0.607], [-0.126, -0.593], [-0.571, -0.461], [0.248, -0.457],
  [-0.243, -0.404], [-0.076, -0.133], [0.331, 0.060], [-0.758, 0.096],
  [0.527, 0.887],
];

// Small gap-filler bushes [nx, ny, scale] placed where canopy-overlapping trees
// were removed near the campfire, arcade and lighthouse. Bushes are short, so
// they fill the greenery without a tall canopy that could cover a landmark.
const GAP_BUSHES: ReadonlyArray<readonly [number, number, number]> = [
  [0.196, 0.284, 0.35], // SE of the campfire (centre stays open)
  [0.688, 0.121, 0.34], // right of the arcade
  [0.787, -0.026, 0.32], // lighthouse base — west
  [0.871, -0.022, 0.33], // lighthouse base — east
  [0.901, 0.066, 0.36], // lighthouse base — lower-right
];

/**
 * Coarse on-sand mask for sand-base-v2, sampled from the (eroded) alpha so
 * sprites sit a touch inside the coastline. Cell (i, j) of an SAND_MASK_W ×
 * SAND_MASK_H grid covers normalised x = i/W·2−1 … and y = j/H·2−1; a set bit
 * means "sand here". Packed 4 cells per hex char, row-major. snapToSand uses it
 * to move any off-shape sprite to the nearest valid on-sand position.
 */
const SAND_MASK_W = 80, SAND_MASK_H = 64;
const SAND_MASK = [
  "00000000000000000000", "000001f8000000000000", "000007ff800000000000", "00000fffc00000000000",
  "00001fffe00000000000", "0000fffff80000000000", "0001fffff80000000000", "0003fffff80000000000",
  "0007fffff80000000000", "0007fffffe0000000000", "000fffffffe000000000", "003ffffffffc00000000",
  "00fffffffff800000000", "00fffffffff800000000", "01fffffffff000000000", "03fffffffff000078000",
  "03fffffffff8001fc000", "03ffffffffffe07fe000", "00ffffffffffe0ffe000", "00fffffffffff8ffc000",
  "001fffffffffffffc000", "0007ffffffffffffc000", "0007ffffffffffffe000", "0003ffffffffffffff80",
  "0003ffffffffffffffe0", "0003fffffffffffff9e0", "0003fffffffffffff000", "01fffffffffffffff000",
  "03fffffffffffffff000", "0ffffffffffffffff000", "0ffffffffffffffffc00", "3fffffffffffffffff00",
  "3fffffffffffffffffc0", "3fffffffffffffffffe0", "7ffffffffffffffffff8", "7ffffffffffffffffffc",
  "7ffffffffffffffffffc", "7ffffffffffffffffffe", "1e0ffffffffffffffffe", "1c03fffffffffffffffe",
  "0001fffffffffffffffe", "0000fffffffffffffffe", "0001fffffffffffffffc", "0001fffffffffffffff8",
  "0001ffffffffffffffe0", "0041fffffffffffffc00", "00c3fffffffffffff800", "01fffffffffffffff000",
  "03fffffffffffffff000", "03fffffffffffffff000", "03fffffffffffffff000", "01fffffffffffffff800",
  "007ffffffffffffffc00", "003fffff7fffffffff00", "003ffffc0fffffffff00", "001ffff80fffffffff00",
  "0007ffe00ffffffffe00", "0007ffc03ffffffffc00", "0000f8003ffe1ff84000", "000000003ff80fe00000",
  "000000003ff807c00000", "000000001ff000000000", "0000000007e000000000", "00000000000000000000",
].join("");

/** Decode the packed hex mask once into a flat 0/1 lookup. */
const SAND_BITS: Uint8Array = (() => {
  const bits = new Uint8Array(SAND_MASK_W * SAND_MASK_H);
  const hexPerRow = Math.ceil(SAND_MASK_W / 4);
  for (let j = 0; j < SAND_MASK_H; j++) {
    const row = SAND_MASK.slice(j * hexPerRow, j * hexPerRow + hexPerRow);
    for (let i = 0; i < SAND_MASK_W; i++) {
      const v = parseInt(row[i >> 2], 16);
      bits[j * SAND_MASK_W + i] = (v >> (3 - (i & 3))) & 1;
    }
  }
  return bits;
})();

/** Small deterministic PRNG (mulberry32) — same seed ⇒ same island. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class LayeredIsland {
  readonly container = new Container();

  private readonly water: Sprite;
  private readonly sand: Sprite;
  /** Warm, slightly-lighter sand silhouette peeking out around the coast —
   *  a thin "dry beach foam" strip that separates the island from the water. */
  private readonly beachRim: Sprite;
  private readonly beachRimMask: Sprite;
  private readonly grass = new Container();
  private readonly rocks = new Container();
  private readonly flowers = new Container();
  private readonly bushes = new Container();
  private readonly trees = new Container();

  // Current sand registration (set each layout), used to map world ↔ normalised
  // for the on-sand snap.
  private cx0 = 0;
  private cy0 = 0;
  private shx0 = 0;
  private shy0 = 0;

  constructor(private readonly tex: IslandTextures) {
    this.water = new Sprite(tex.water);
    this.sand = new Sprite(tex.sand);
    this.water.anchor.set(0.5);
    this.sand.anchor.set(0.5);

    // Beach rim: a flat warm-cream fill in the island's silhouette, scaled a
    // touch larger than the sand and sitting just beneath it, so only a thin
    // lighter strip shows around the coastline.
    this.beachRim = new Sprite(Texture.WHITE);
    this.beachRim.tint = 0xffedb0;
    this.beachRimMask = new Sprite(tex.sand);
    for (const s of [this.beachRim, this.beachRimMask]) s.anchor.set(0.5);
    this.beachRim.mask = this.beachRimMask;

    // Bottom → top: water · beach rim · sand · rocks · grass · bushes ·
    // flowers · trees. Landmarks/avatars draw above this whole container
    // (the renderer's `entities`), so structures always sit on top of nature.
    this.container.addChild(
      this.water, this.beachRim, this.beachRimMask, this.sand,
      this.rocks, this.grass, this.bushes, this.flowers, this.trees,
    );
    for (const c of [this.container, this.water, this.beachRim, this.beachRimMask,
      this.sand, this.grass, this.rocks, this.flowers, this.bushes, this.trees]) {
      c.eventMode = "none";
    }
    this.trees.sortableChildren = true;
    this.rocks.sortableChildren = true;
    this.grass.sortableChildren = true;
    this.bushes.sortableChildren = true;
    this.flowers.sortableChildren = true;
  }

  /**
   * Size + place every layer. The sand is pinned to the painted-ground
   * registration (cx/cy/spanW); the water blankets the requested rect; the
   * props scatter over the sand (snapped onto the silhouette). Idempotent and
   * deterministic, so it is safe to re-run on rebuild/resize.
   */
  layout(o: IslandLayoutOpts): void {
    // SAND — pinned to the registration.
    const sandW = o.spanW;
    const sandScale = sandW / this.tex.sand.width;
    const sandH = this.tex.sand.height * sandScale;
    this.sand.scale.set(sandScale);
    this.sand.position.set(o.cx, o.cy);

    // BEACH RIM — same silhouette, nudged ~2% larger and pinned under the sand
    // so a thin warmer strip shows around the coast (≈10–16px dry-sand foam).
    this.beachRimMask.scale.set(sandScale * 1.02);
    this.beachRimMask.position.set(o.cx, o.cy);
    this.beachRim.width = sandW * 1.02;
    this.beachRim.height = sandH * 1.02;
    this.beachRim.position.set(o.cx, o.cy);

    // WATER — blanket the requested rect edge-to-edge (no gaps at any zoom).
    this.coverWater(o.cx, o.cy, o.waterW, o.waterH);

    // Half-extents of the sand used for scatter placement + the on-sand snap.
    const shx = sandW / 2;
    const shy = sandH / 2;
    this.cx0 = o.cx; this.cy0 = o.cy; this.shx0 = shx; this.shy0 = shy;
    const marks = o.landmarks ?? [];

    const rockUnit = (sandH * 0.14) / this.tex.rock.height;

    this.scatterGrass(o.cx, o.cy, shx, shy, marks);
    this.scatterRocks(o.cx, o.cy, shx, shy, rockUnit);
    this.scatterFlowers(o.cx, o.cy, shx, shy, marks);
    this.scatterBushes(o.cx, o.cy, shx, shy);
    this.scatterTrees(o.cx, o.cy, shx, shy, marks);
  }

  /** True if the normalised point (nx, ny ∈ [-1, 1]) is on sand. */
  private onSand(nx: number, ny: number): boolean {
    const i = Math.floor(((nx + 1) / 2) * SAND_MASK_W);
    const j = Math.floor(((ny + 1) / 2) * SAND_MASK_H);
    if (i < 0 || j < 0 || i >= SAND_MASK_W || j >= SAND_MASK_H) return false;
    return SAND_BITS[j * SAND_MASK_W + i] === 1;
  }

  /**
   * Snap a world point onto the sand: if it's already on the silhouette, return
   * it unchanged; otherwise spiral out through the mask to the nearest sand cell
   * and return that cell's world centre. Keeps every prop on the irregular shape.
   */
  private snapToSand(x: number, y: number): [number, number] {
    if (this.shx0 === 0) return [x, y];
    const nx = (x - this.cx0) / this.shx0;
    const ny = (y - this.cy0) / this.shy0;
    if (this.onSand(nx, ny)) return [x, y];
    const i0 = Math.floor(((nx + 1) / 2) * SAND_MASK_W);
    const j0 = Math.floor(((ny + 1) / 2) * SAND_MASK_H);
    for (let rad = 1; rad < SAND_MASK_W; rad++) {
      let best: [number, number] | null = null;
      let bestD = Infinity;
      for (let dj = -rad; dj <= rad; dj++) {
        for (let di = -rad; di <= rad; di++) {
          if (Math.max(Math.abs(di), Math.abs(dj)) !== rad) continue;
          const i = i0 + di, j = j0 + dj;
          if (i < 0 || j < 0 || i >= SAND_MASK_W || j >= SAND_MASK_H) continue;
          if (SAND_BITS[j * SAND_MASK_W + i] !== 1) continue;
          const d = di * di + dj * dj;
          if (d < bestD) { bestD = d; best = [i, j]; }
        }
      }
      if (best) {
        const snx = ((best[0] + 0.5) / SAND_MASK_W) * 2 - 1;
        const sny = ((best[1] + 0.5) / SAND_MASK_H) * 2 - 1;
        return [this.cx0 + snx * this.shx0, this.cy0 + sny * this.shy0];
      }
    }
    return [x, y];
  }

  /**
   * Heavy, lush grass coverage (grass-01). Three passes: a green ring + base
   * tufts around every grassy landmark; an inner-edge band; interior fill.
   * Small sandy clearings are preserved around the campfire, welcome dock and
   * calm beach (the "sand" landmarks), which double as grass exclusion zones.
   */
  private scatterGrass(
    cx: number, cy: number, shx: number, shy: number, marks: readonly LandmarkMark[],
  ): void {
    this.grass.removeChildren();
    const r = rng(0x6a55);
    const clearings = marks.filter((m) => m.ground === "sand");
    const inClearing = (x: number, y: number): boolean =>
      clearings.some((m) => {
        const rad = 56 + m.w * 11; // keep the dock approach / beach / fire bare
        return Math.hypot(x - m.x, y - m.y) < rad;
      });

    // A green patch = a few tufts jittered around a point.
    const patch = (x: number, y: number, n: number, lo: number, hi: number): void => {
      for (let k = 0; k < n; k++) {
        const jx = x + (r() - 0.5) * 46;
        const jy = y + (r() - 0.5) * 22;
        this.stamp(this.grass, this.tex.grass, jx, jy, lo + r() * (hi - lo), (r() - 0.5) * 0.3);
      }
    };

    // Pass 1 — green clearings: a planted pad + ring patches at each grassy
    // landmark so the structure feels rooted in the landscape.
    for (const m of marks) {
      if (m.ground !== "grass") continue;
      const spread = 24 + m.w * 7;
      for (let k = 0; k < 4; k++) {
        const a = (k / 4) * Math.PI * 2 + r() * 1.0;
        const x = m.x + Math.cos(a) * spread * (0.55 + r() * 0.5);
        const y = m.y + 8 + Math.abs(Math.sin(a)) * spread * 0.35;
        this.stamp(this.grass, this.tex.grass, x, y, 0.2 + r() * 0.15, (r() - 0.5) * 0.3);
      }
      for (let k = 0; k < 3; k++) {
        const a = r() * Math.PI * 2;
        const x = m.x + Math.cos(a) * spread * (1.3 + r() * 0.7);
        const y = m.y + 4 + Math.sin(a) * spread * 0.5;
        patch(x, y, 2, 0.38, 0.62);
      }
    }

    // Pass 2 — inner-edge band just inside the treeline.
    const EDGE = 16;
    for (let i = 0; i < EDGE; i++) {
      const a = (i / EDGE) * Math.PI * 2 + (r() - 0.5) * 0.5;
      const rad = 0.72 + r() * 0.16; // 0.72–0.88
      const x = cx + Math.cos(a) * shx * rad;
      const y = cy + Math.sin(a) * shy * rad;
      if (inClearing(x, y)) continue;
      patch(x, y, 2, 0.32, 0.66);
    }

    // Pass 3 — interior fill between the landmarks (dense, clustered).
    const FILL = 18;
    for (let i = 0; i < FILL; i++) {
      const a = (i / FILL) * Math.PI * 2 + (r() - 0.5) * 0.9;
      const rad = 0.16 + r() * 0.56; // 0.16–0.72
      const x = cx + Math.cos(a) * shx * rad;
      const y = cy + Math.sin(a) * shy * rad;
      if (inClearing(x, y)) continue;
      patch(x, y, 2 + (r() < 0.5 ? 1 : 0), 0.34, 0.7);
    }
  }

  // Rocks on the sand, some clustered near the edges.
  private scatterRocks(cx: number, cy: number, shx: number, shy: number, unit: number): void {
    this.rocks.removeChildren();
    const r = rng(0x12c9);
    const N = 5;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2 + (r() - 0.5) * 0.8;
      const rad = 0.55 + r() * 0.4;
      const x = cx + Math.cos(a) * shx * rad;
      const y = cy + Math.sin(a) * shy * rad;
      const scale = (0.3 + r() * 0.3) * unit;
      this.stamp(this.rocks, this.tex.rock, x, y, scale);
    }
  }

  /**
   * Illustrated flower clusters (flower-01 / flower-bush-01), scale 0.25–0.5.
   * flower-01 hugs the water edges (calm beach, lazy lagoon, inner shore);
   * flower-bush-01 clusters by the treehouse, art hut and star market; a few
   * are scattered across the interior for discovery moments.
   */
  private scatterFlowers(
    cx: number, cy: number, shx: number, shy: number, marks: readonly LandmarkMark[],
  ): void {
    this.flowers.removeChildren();
    const r = rng(0xf10a);
    const at = (key: string) => marks.find((m) => m.key === key);

    const flower = (x: number, y: number, bush: boolean): void => {
      const tex = bush ? this.tex.flowerBush01 : this.tex.flower01;
      this.stamp(this.flowers, tex, x, y, 0.25 + r() * 0.25, (r() - 0.5) * 0.16);
    };
    const near = (m: LandmarkMark | undefined, n: number, bush: boolean, spread: number): void => {
      if (!m) return;
      for (let k = 0; k < n; k++) {
        const a = r() * Math.PI * 2;
        flower(m.x + Math.cos(a) * spread * (0.8 + r() * 0.7),
          m.y + 6 + Math.sin(a) * spread * 0.5, bush);
      }
    };

    near(at("calm_beach"), 3, false, 64);
    near(at("lazy_lagoon"), 3, false, 60);
    for (let i = 0; i < 3; i++) {
      const a = Math.PI * (0.6 + i * 0.28) + (r() - 0.5) * 0.2; // SW arc
      const rad = 0.7 + r() * 0.16;
      flower(cx + Math.cos(a) * shx * rad, cy + Math.sin(a) * shy * rad, false);
    }

    near(at("treehouse_hideaway"), 2, true, 70);
    near(at("art_hut"), 2, true, 58);
    near(at("star_market"), 2, true, 56);

    const interior: ReadonlyArray<readonly [number, number, boolean]> = [
      [-0.05, 0.30, true], [0.30, -0.10, false], [-0.30, 0.05, false],
    ];
    for (const [nx, ny, bush] of interior) {
      flower(cx + nx * shx, cy + ny * shy, bush);
    }
  }

  // Illustrated bushes (bush-01 / bush-02), mix of both, scale 0.3–0.6.
  private scatterBushes(cx: number, cy: number, shx: number, shy: number): void {
    this.bushes.removeChildren();
    const r = rng(0xb05e);
    BUSH_OFFSETS.forEach(([nx, ny], i) => {
      const tex = i % 2 === 0 ? this.tex.bush01 : this.tex.bush02;
      const scale = 0.3 + r() * 0.3; // 0.3–0.6
      const rot = (r() - 0.5) * 0.16;
      this.stamp(this.bushes, tex, cx + nx * shx, cy + ny * shy, scale, rot);
    });
    // Gap fillers where overlapping trees were removed (fixed smaller scale).
    GAP_BUSHES.forEach(([nx, ny, scale], i) => {
      const tex = i % 2 === 0 ? this.tex.bush01 : this.tex.bush02;
      this.stamp(this.bushes, tex, cx + nx * shx, cy + ny * shy, scale, (r() - 0.5) * 0.16);
    });
  }

  /**
   * Position + uniform-scale the water sprite so it blankets a world rect of
   * `w × h` centered on (cx, cy), with no gaps. Cheap; call on resize so the
   * ocean keeps filling the viewport at every zoom level.
   */
  coverWater(cx: number, cy: number, w: number, h: number): void {
    const s = Math.max(w / this.tex.water.width, h / this.tex.water.height);
    this.water.scale.set(s);
    this.water.position.set(cx, cy);
  }

  /** A sprite anchored at its base, snapped onto the sand silhouette. */
  private stamp(layer: Container, tex: Texture, x: number, y: number, scale: number, rot = 0): void {
    [x, y] = this.snapToSand(x, y);
    const s = new Sprite(tex);
    s.anchor.set(0.5, 1);
    s.position.set(x, y);
    s.scale.set(scale);
    s.rotation = rot;
    s.eventMode = "none";
    s.zIndex = y; // y-sort: lower on screen draws in front
    layer.addChild(s);
  }

  // Trees. Baked grove/scatter offsets, kept off the landmark sprites via the
  // per-landmark keep-out and snapped onto the sand silhouette by `stamp`.
  private scatterTrees(
    cx: number, cy: number, shx: number, shy: number, marks: readonly LandmarkMark[],
  ): void {
    this.trees.removeChildren();
    const r = rng(0x9e3d);
    const place = (nx: number, ny: number, tex: Texture, scale: number, skipKey?: string): void => {
      const [x, y] = this.keepOff(cx + nx * shx, cy + ny * shy, marks, skipKey);
      this.stamp(this.trees, tex, x, y, scale);
    };
    TREE_OFFSETS.forEach(([nx, ny], i) => {
      const even = i % 2 === 0;
      place(nx, ny, even ? this.tex.tree01 : this.tex.tree02, even ? 0.35 + r() * 0.1 : 0.28 + r() * 0.1);
    });
    // Treehouse forest cluster: smaller, dense trees, allowed to sit close to
    // the treehouse (skip its keep-out) so it reads as IN the woods.
    CLUSTER_TREE_OFFSETS.forEach(([nx, ny], i) => {
      place(nx, ny, i % 2 === 0 ? this.tex.tree01 : this.tex.tree02, 0.25 + r() * 0.07, "treehouse_hideaway");
    });
  }

  /**
   * If (x, y) falls inside any landmark's circular keep-out, push it radially
   * outward to the keep-out edge so the tree sits clear of the structure.
   * Returns the nudged [x, y].
   */
  private keepOff(x: number, y: number, marks: readonly LandmarkMark[], skipKey?: string): [number, number] {
    for (let pass = 0; pass < 2; pass++) {
      for (const m of marks) {
        if (m.key === skipKey) continue;
        const dx = x - m.x, dy = y - m.y;
        const d = Math.hypot(dx, dy);
        if (d < m.clear) {
          const ang = d === 0 ? -Math.PI / 2 : Math.atan2(dy, dx);
          x = m.x + Math.cos(ang) * m.clear;
          y = m.y + Math.sin(ang) * m.clear;
        }
      }
    }
    return [x, y];
  }
}
