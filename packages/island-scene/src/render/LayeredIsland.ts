import { Container, Sprite, Texture } from "pixi.js";

/**
 * LayeredIsland — the world map composed from individual illustrated sprites
 * over the painted terrain base. Pure presentation: it owns no world data and
 * never reads input. Build it with the textures, then call `layout()` with the
 * island's world-space bounds, the landmark marks and the shared y-sort layer.
 *
 * Depth: the flat ground (water · beach rim · sand · beach patch) lives in this
 * container at the very back. Every *prop* (grass, rocks, flowers, bushes,
 * trees) is stamped into the renderer's shared `propLayer` — the SAME container
 * the landmark + avatar sprites live in — each keyed by its base world-Y. That
 * single sorted pass means a tree in front of a building (lower on screen)
 * correctly occludes it, and a tree behind does not.
 *
 * The terrain art (sand-base-v2) bakes in colour variation, hills and sandy
 * beach edges, so the only ground overlay is the thin beach-rim strip plus a
 * small sandy patch under the beach. The scatter is deterministic (seeded PRNG).
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

export interface LandmarkMark {
  key: string;
  x: number;
  y: number;
  w: number;
  /** Tree keep-out radius in world pixels — no tree base may sit inside it. */
  clear: number;
  ground: "grass" | "sand";
}

export interface IslandLayoutOpts {
  cx: number;
  cy: number;
  spanW: number;
  waterW: number;
  waterH: number;
  landmarks?: readonly LandmarkMark[];
  /** Shared y-sorted container (renderer's `entities`) that the props join so
   *  they interleave by depth with the landmark + avatar sprites. */
  propLayer?: Container;
}

/**
 * Grove + scattered trees as [nx, ny, texNum(1|2), scale]. Positions, textures
 * and scales were chosen (by sampling the sand alpha + every landmark's sprite
 * box) so that under the global y-sort NO tree canopy occludes a landmark from
 * the front — they sit in the open gaps and frame the structures.
 */
const TREE_DEFS: ReadonlyArray<readonly [number, number, 1 | 2, number]> = [
  [0.49, -0.328, 1, 0.45],  // west of the lighthouse
  [-0.027, 0.647, 1, 0.40], // southern gap (between campfire + dock)
  [0.264, 0.65, 1, 0.40],
  [0.257, 0.552, 2, 0.40],
  [-0.084, 0.59, 2, 0.36],
  [0.103, 0.88, 1, 0.45],
  [0.689, 0.283, 2, 0.32], // east, beside the arcade/lagoon
  [0.744, 0.416, 1, 0.45],
];

// Treehouse forest — a dense stand kept strictly BEHIND (north of) the
// treehouse so the towering building always reads in front of it. Smaller
// trees; exempt from the treehouse keep-out so they crowd in close.
const CLUSTER_TREE_OFFSETS: ReadonlyArray<readonly [number, number]> = [
  [-0.412, -0.577], [-0.566, -0.647], [-0.286, -0.56], [-0.484, -0.742],
  [-0.323, -0.701], [-0.621, -0.7], [-0.175, -0.557],
];

// Three EXTRA-large ancient trees (tree-01 @0.5) tucked right behind the
// treehouse to make it feel deep in a legendary forest.
const EPIC_TREE_OFFSETS: ReadonlyArray<readonly [number, number]> = [
  [-0.48, -0.531], [-0.352, -0.537], [-0.403, -0.477],
];

// Illustrated bushes (bush-01 / bush-02).
const BUSH_OFFSETS: ReadonlyArray<readonly [number, number]> = [
  [-0.269, -0.607], [-0.126, -0.593], [-0.571, -0.461], [0.248, -0.457],
  [-0.243, -0.404], [-0.076, -0.133], [0.331, 0.060], [-0.758, 0.096],
  [0.527, 0.887],
];

// Small gap-filler bushes [nx, ny, scale] near the campfire/arcade/lighthouse.
const GAP_BUSHES: ReadonlyArray<readonly [number, number, number]> = [
  [0.196, 0.284, 0.35], [0.688, 0.121, 0.34],
  [0.787, -0.026, 0.32], [0.871, -0.022, 0.33], [0.901, 0.066, 0.36],
];

/**
 * Coarse on-sand masks for sand-base-v2, packed 4 cells/hex char, row-major,
 * over an SAND_MASK_W × SAND_MASK_H grid covering normalised [-1,1]². SAND_MASK
 * is eroded ~12px (props sit just inside the coast); FLOWER_MASK is eroded
 * ~50px (flowers sit well clear of the waterline).
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
const FLOWER_MASK = [
  "00000000000000000000", "00000000000000000000", "00000000000000000000", "000001f8000000000000",
  "000003ff000000000000", "00000fff800000000000", "00001fffe00000000000", "00007fffe00000000000",
  "0000ffffe00000000000", "0003fffff00000000000", "0003fffff80000000000", "0007fffffe0000000000",
  "0007ffffffe000000000", "003fffffffc000000000", "007fffffffc000000000", "007fffffffc000000000",
  "00ffffffffc000000000", "007fffffffe000070000", "001ffffffff0001f8000", "0007ffffffffc03f0000",
  "0003ffffffffe03f0000", "0001fffffffff0ff0000", "0000ffffffffffff8000", "0000ffffffffffff8000",
  "0000ffffffffffffe000", "0000ffffffffffffc000", "0000ffffffffffffc000", "0001ffffffffffffc000",
  "0003ffffffffffffc000", "00ffffffffffffffc000", "03ffffffffffffffe000", "07fffffffffffffff000",
  "0ffffffffffffffff800", "0ffffffffffffffffe00", "1fffffffffffffffff80", "1fffffffffffffffffe0",
  "1e0ffffffffffffffff0", "0803fffffffffffffff0", "0000fffffffffffffff8", "00007ffffffffffffff8",
  "00007ffffffffffffff8", "00003ffffffffffffff0", "00003fffffffffffffc0", "00007ffffffffffffc00",
  "00007ffffffffffff000", "00007fffffffffffe000", "00007fffffffffffe000", "0000ffffffffffffc000",
  "0001ffffffffffffc000", "00ffffffffffffffc000", "003fffffffffffffc000", "001fffff7fffffffc000",
  "000ffff80fffffffe000", "000ffff007fffffff000", "0007ffe003fffffff800", "0003ff8003fffffff800",
  "0000f80003fc1ff84000", "0000000003f807e00000", "0000000007f003c00000", "000000000fe000000000",
  "0000000007e000000000", "00000000000000000000", "00000000000000000000", "00000000000000000000",
].join("");

function decodeMask(hex: string): Uint8Array {
  const bits = new Uint8Array(SAND_MASK_W * SAND_MASK_H);
  const hexPerRow = Math.ceil(SAND_MASK_W / 4);
  for (let j = 0; j < SAND_MASK_H; j++) {
    const row = hex.slice(j * hexPerRow, j * hexPerRow + hexPerRow);
    for (let i = 0; i < SAND_MASK_W; i++) {
      bits[j * SAND_MASK_W + i] = (parseInt(row[i >> 2], 16) >> (3 - (i & 3))) & 1;
    }
  }
  return bits;
}
const SAND_BITS = decodeMask(SAND_MASK);
const FLOWER_BITS = decodeMask(FLOWER_MASK);

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
  /** Thin warm "dry beach foam" strip around the coast. */
  private readonly beachRim: Sprite;
  private readonly beachRimMask: Sprite;
  /** Soft golden sand clearing under the calm-beach landmark. */
  private readonly beachPatch: Sprite;

  // Props go into the renderer's shared y-sort layer; we track them to clear on
  // each layout.
  private propLayer: Container = this.container;
  private propSprites: Sprite[] = [];

  // Current sand registration (set each layout), for world ↔ normalised maths.
  private cx0 = 0;
  private cy0 = 0;
  private shx0 = 0;
  private shy0 = 0;

  constructor(private readonly tex: IslandTextures) {
    this.water = new Sprite(tex.water);
    this.sand = new Sprite(tex.sand);
    this.water.anchor.set(0.5);
    this.sand.anchor.set(0.5);

    this.beachRim = new Sprite(Texture.WHITE);
    this.beachRim.tint = 0xffedb0;
    this.beachRimMask = new Sprite(tex.sand);
    for (const s of [this.beachRim, this.beachRimMask]) s.anchor.set(0.5);
    this.beachRim.mask = this.beachRimMask;

    // Golden, feathered sand patch (a beach should be on sand, not grass).
    this.beachPatch = new Sprite(this.radialTexture([
      [0.0, "rgba(232, 201, 122, 0.95)"],
      [0.55, "rgba(232, 201, 122, 0.9)"],
      [1.0, "rgba(232, 201, 122, 0)"],
    ]) ?? Texture.EMPTY);
    this.beachPatch.anchor.set(0.5);

    // Flat ground only — water · beach rim · sand · beach patch. The props are
    // added to the shared y-sort layer in layout().
    this.container.addChild(
      this.water, this.beachRim, this.beachRimMask, this.sand, this.beachPatch,
    );
    for (const c of [this.container, this.water, this.beachRim, this.beachRimMask,
      this.sand, this.beachPatch]) {
      c.eventMode = "none";
    }
  }

  /** A centred radial-gradient canvas texture (undefined when there's no DOM). */
  private radialTexture(stops: ReadonlyArray<readonly [number, string]>): Texture | undefined {
    if (typeof document === "undefined") return undefined;
    const S = 256;
    const cnv = document.createElement("canvas");
    cnv.width = cnv.height = S;
    const ctx = cnv.getContext("2d");
    if (!ctx) return undefined;
    const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    for (const [off, color] of stops) g.addColorStop(off, color);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, S, S);
    return Texture.from(cnv);
  }

  layout(o: IslandLayoutOpts): void {
    const sandW = o.spanW;
    const sandScale = sandW / this.tex.sand.width;
    const sandH = this.tex.sand.height * sandScale;
    this.sand.scale.set(sandScale);
    this.sand.position.set(o.cx, o.cy);

    this.beachRimMask.scale.set(sandScale * 1.02);
    this.beachRimMask.position.set(o.cx, o.cy);
    this.beachRim.width = sandW * 1.02;
    this.beachRim.height = sandH * 1.02;
    this.beachRim.position.set(o.cx, o.cy);

    this.coverWater(o.cx, o.cy, o.waterW, o.waterH);

    const shx = sandW / 2;
    const shy = sandH / 2;
    this.cx0 = o.cx; this.cy0 = o.cy; this.shx0 = shx; this.shy0 = shy;
    const marks = o.landmarks ?? [];

    // Sandy patch under the calm beach (≈200×140, feathered), below the grass.
    const beach = marks.find((m) => m.key === "calm_beach");
    if (beach) {
      this.beachPatch.visible = true;
      this.beachPatch.position.set(beach.x, beach.y);
      this.beachPatch.width = 200;
      this.beachPatch.height = 140;
    } else {
      this.beachPatch.visible = false;
    }

    // Reset the prop layer + clear last build's props.
    for (const s of this.propSprites) s.destroy();
    this.propSprites = [];
    this.propLayer = o.propLayer ?? this.container;

    const rockUnit = (sandH * 0.14) / this.tex.rock.height;

    this.scatterGrass(o.cx, o.cy, shx, shy, marks);
    this.scatterRocks(o.cx, o.cy, shx, shy, rockUnit);
    this.scatterFlowers(o.cx, o.cy, shx, shy, marks);
    this.scatterBushes(o.cx, o.cy, shx, shy);
    this.scatterTrees(o.cx, o.cy, shx, shy, marks);
  }

  private onSand(nx: number, ny: number, bits: Uint8Array): boolean {
    const i = Math.floor(((nx + 1) / 2) * SAND_MASK_W);
    const j = Math.floor(((ny + 1) / 2) * SAND_MASK_H);
    if (i < 0 || j < 0 || i >= SAND_MASK_W || j >= SAND_MASK_H) return false;
    return bits[j * SAND_MASK_W + i] === 1;
  }

  /** Snap a world point onto sand (deep = pull well inside, for flowers). */
  private snapToSand(x: number, y: number, deep = false): [number, number] {
    if (this.shx0 === 0) return [x, y];
    const bits = deep ? FLOWER_BITS : SAND_BITS;
    const nx = (x - this.cx0) / this.shx0;
    const ny = (y - this.cy0) / this.shy0;
    if (this.onSand(nx, ny, bits)) return [x, y];
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
          if (bits[j * SAND_MASK_W + i] !== 1) continue;
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

  /** Stamp a base-anchored prop into the shared y-sort layer (snapped to sand). */
  private stamp(tex: Texture, x: number, y: number, scale: number, rot = 0, deep = false): void {
    [x, y] = this.snapToSand(x, y, deep);
    const s = new Sprite(tex);
    s.anchor.set(0.5, 1);
    s.position.set(x, y);
    s.scale.set(scale);
    s.rotation = rot;
    s.eventMode = "none";
    s.zIndex = y; // y-sort across all nature + landmarks
    this.propLayer.addChild(s);
    this.propSprites.push(s);
  }

  private scatterGrass(
    cx: number, cy: number, shx: number, shy: number, marks: readonly LandmarkMark[],
  ): void {
    const r = rng(0x6a55);
    const clearings = marks.filter((m) => m.ground === "sand");
    const inClearing = (x: number, y: number): boolean =>
      clearings.some((m) => Math.hypot(x - m.x, y - m.y) < 56 + m.w * 11);

    const patch = (x: number, y: number, n: number, lo: number, hi: number): void => {
      for (let k = 0; k < n; k++) {
        this.stamp(this.tex.grass, x + (r() - 0.5) * 46, y + (r() - 0.5) * 22,
          lo + r() * (hi - lo), (r() - 0.5) * 0.3);
      }
    };

    for (const m of marks) {
      if (m.ground !== "grass") continue;
      const spread = 24 + m.w * 7;
      for (let k = 0; k < 4; k++) {
        const a = (k / 4) * Math.PI * 2 + r() * 1.0;
        this.stamp(this.tex.grass, m.x + Math.cos(a) * spread * (0.55 + r() * 0.5),
          m.y + 8 + Math.abs(Math.sin(a)) * spread * 0.35, 0.2 + r() * 0.15, (r() - 0.5) * 0.3);
      }
      for (let k = 0; k < 3; k++) {
        const a = r() * Math.PI * 2;
        patch(m.x + Math.cos(a) * spread * (1.3 + r() * 0.7),
          m.y + 4 + Math.sin(a) * spread * 0.5, 2, 0.38, 0.62);
      }
    }

    const EDGE = 16;
    for (let i = 0; i < EDGE; i++) {
      const a = (i / EDGE) * Math.PI * 2 + (r() - 0.5) * 0.5;
      const rad = 0.72 + r() * 0.16;
      const x = cx + Math.cos(a) * shx * rad, y = cy + Math.sin(a) * shy * rad;
      if (!inClearing(x, y)) patch(x, y, 2, 0.32, 0.66);
    }

    const FILL = 18;
    for (let i = 0; i < FILL; i++) {
      const a = (i / FILL) * Math.PI * 2 + (r() - 0.5) * 0.9;
      const rad = 0.16 + r() * 0.56;
      const x = cx + Math.cos(a) * shx * rad, y = cy + Math.sin(a) * shy * rad;
      if (!inClearing(x, y)) patch(x, y, 2 + (r() < 0.5 ? 1 : 0), 0.34, 0.7);
    }
  }

  private scatterRocks(cx: number, cy: number, shx: number, shy: number, unit: number): void {
    const r = rng(0x12c9);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + (r() - 0.5) * 0.8;
      const rad = 0.55 + r() * 0.4;
      this.stamp(this.tex.rock, cx + Math.cos(a) * shx * rad, cy + Math.sin(a) * shy * rad,
        (0.3 + r() * 0.3) * unit);
    }
  }

  /**
   * Flower clusters. flower-01 hugs the calm beach (kept near the shore); every
   * other flower is snapped to the DEEP mask so it sits well clear of the water
   * edge (no flowers appearing to grow in the ocean).
   */
  private scatterFlowers(
    cx: number, cy: number, shx: number, shy: number, marks: readonly LandmarkMark[],
  ): void {
    const r = rng(0xf10a);
    const at = (key: string) => marks.find((m) => m.key === key);
    const flower = (x: number, y: number, bush: boolean, deep: boolean): void => {
      this.stamp(bush ? this.tex.flowerBush01 : this.tex.flower01, x, y,
        0.25 + r() * 0.25, (r() - 0.5) * 0.16, deep);
    };
    const near = (m: LandmarkMark | undefined, n: number, bush: boolean, spread: number, deep: boolean): void => {
      if (!m) return;
      for (let k = 0; k < n; k++) {
        const a = r() * Math.PI * 2;
        flower(m.x + Math.cos(a) * spread * (0.8 + r() * 0.7),
          m.y + 6 + Math.sin(a) * spread * 0.5, bush, deep);
      }
    };

    // Calm-beach flowers stay near the shore (deep = false); the rest pull in.
    near(at("calm_beach"), 3, false, 64, false);
    near(at("lazy_lagoon"), 3, false, 60, true);
    for (let i = 0; i < 3; i++) {
      const a = Math.PI * (0.6 + i * 0.28) + (r() - 0.5) * 0.2;
      const rad = 0.7 + r() * 0.16;
      flower(cx + Math.cos(a) * shx * rad, cy + Math.sin(a) * shy * rad, false, true);
    }
    near(at("treehouse_hideaway"), 2, true, 70, true);
    near(at("art_hut"), 2, true, 58, true);
    near(at("star_market"), 2, true, 56, true);

    const interior: ReadonlyArray<readonly [number, number, boolean]> = [
      [-0.05, 0.30, true], [0.30, -0.10, false], [-0.30, 0.05, false],
    ];
    for (const [nx, ny, bush] of interior) flower(cx + nx * shx, cy + ny * shy, bush, true);
  }

  private scatterBushes(cx: number, cy: number, shx: number, shy: number): void {
    const r = rng(0xb05e);
    BUSH_OFFSETS.forEach(([nx, ny], i) => {
      this.stamp(i % 2 === 0 ? this.tex.bush01 : this.tex.bush02,
        cx + nx * shx, cy + ny * shy, 0.3 + r() * 0.3, (r() - 0.5) * 0.16);
    });
    GAP_BUSHES.forEach(([nx, ny, scale], i) => {
      this.stamp(i % 2 === 0 ? this.tex.bush01 : this.tex.bush02,
        cx + nx * shx, cy + ny * shy, scale, (r() - 0.5) * 0.16);
    });
  }

  coverWater(cx: number, cy: number, w: number, h: number): void {
    const s = Math.max(w / this.tex.water.width, h / this.tex.water.height);
    this.water.scale.set(s);
    this.water.position.set(cx, cy);
  }

  /**
   * Trees. Grove/scatter trees carry an explicit texture + scale chosen to stay
   * clear of every landmark under the y-sort. The treehouse forest (cluster +
   * epic) sits behind the treehouse and is exempt from its keep-out.
   */
  private scatterTrees(
    cx: number, cy: number, shx: number, shy: number, marks: readonly LandmarkMark[],
  ): void {
    const r = rng(0x9e3d);
    const place = (nx: number, ny: number, tex: Texture, scale: number, skipKey?: string): void => {
      const [x, y] = this.keepOff(cx + nx * shx, cy + ny * shy, marks, skipKey);
      this.stamp(tex, x, y, scale);
    };
    for (const [nx, ny, texNum, scale] of TREE_DEFS) {
      place(nx, ny, texNum === 1 ? this.tex.tree01 : this.tex.tree02, scale);
    }
    // Treehouse forest — smaller trees, behind the building.
    CLUSTER_TREE_OFFSETS.forEach(([nx, ny], i) => {
      place(nx, ny, i % 2 === 0 ? this.tex.tree02 : this.tex.tree01, 0.28 + r() * 0.05, "treehouse_hideaway");
    });
    // Epic ancient trees — large, directly behind the treehouse.
    for (const [nx, ny] of EPIC_TREE_OFFSETS) {
      place(nx, ny, this.tex.tree01, 0.5, "treehouse_hideaway");
    }
  }

  /** Push (x, y) radially out of any landmark's circular keep-out. */
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
