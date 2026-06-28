import { Container, Sprite, Texture } from "pixi.js";

/**
 * LayeredIsland — the world map composed from individual illustrated sprites
 * instead of one flat painting. Pure presentation: it owns no world data and
 * never reads input. Build it with the six textures, then call `layout()` with
 * the island's world-space bounds; it sizes + scatters every layer to fit.
 *
 * Layer stack (bottom → top): water · sand · grass tufts · rocks · trees.
 * Landmarks and avatars are drawn ABOVE this container by the renderer.
 *
 * The scatter is fully deterministic (seeded PRNG) so the island looks the
 * same on every load and every build. Phase 1 is static — no animation here.
 */
export interface IslandTextures {
  water: Texture;
  sand: Texture;
  grass: Texture;
  rock: Texture;
  tree01: Texture;
  tree02: Texture;
}

export interface IslandBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

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
  private readonly grass = new Container();
  private readonly rocks = new Container();
  private readonly trees = new Container();

  constructor(private readonly tex: IslandTextures) {
    this.water = new Sprite(tex.water);
    this.sand = new Sprite(tex.sand);
    this.water.anchor.set(0.5);
    this.sand.anchor.set(0.5);

    // Bottom → top. Grass/rocks/trees are y-sorted internally.
    this.container.addChild(this.water, this.sand, this.grass, this.rocks, this.trees);
    for (const c of [this.container, this.water, this.sand, this.grass, this.rocks, this.trees]) {
      c.eventMode = "none";
    }
    this.trees.sortableChildren = true;
    this.rocks.sortableChildren = true;
    this.grass.sortableChildren = true;
  }

  /**
   * Size + place every layer to fit the island world-bounds. Idempotent: clears
   * and rebuilds the scattered layers each call (deterministic), so it is safe
   * to re-run on rebuild/resize.
   */
  layout(b: IslandBounds): void {
    const cx = (b.minX + b.maxX) / 2;
    const cy = (b.minY + b.maxY) / 2;
    const islandW = Math.max(1, b.maxX - b.minX);
    const islandH = Math.max(1, b.maxY - b.minY);

    // SAND — cover the island footprint so every landmark sits on land.
    const sandW = islandW * 1.12;
    const sandScale = sandW / this.tex.sand.width;
    const sandH = this.tex.sand.height * sandScale;
    this.sand.scale.set(sandScale);
    this.sand.position.set(cx, cy);

    // WATER — sand is ~70% of the canvas width, so the water canvas is larger;
    // fill comfortably past the island in both axes.
    const canvasW = sandW / 0.7;
    const waterScale = Math.max(
      canvasW / this.tex.water.width,
      (islandH * 1.5) / this.tex.water.height,
    );
    this.water.scale.set(waterScale);
    this.water.position.set(cx, cy);

    // Half-extents of the sand ellipse used for scatter placement.
    const shx = sandW / 2;
    const shy = sandH / 2;

    // Base on-screen sizes, expressed as a fraction of island height, so the
    // scene reads the same regardless of the absolute world scale.
    const treeUnit = (islandH * 0.3) / this.tex.tree01.height;
    const grassUnit = (islandH * 0.13) / this.tex.grass.height;
    const rockUnit = (islandH * 0.16) / this.tex.rock.height;

    this.scatterGrass(cx, cy, shx, shy, grassUnit);
    this.scatterRocks(cx, cy, shx, shy, rockUnit);
    this.scatterTrees(cx, cy, shx, shy, treeUnit);
  }

  /** A sprite anchored at its base (so it "stands" on its placement point). */
  private stamp(layer: Container, tex: Texture, x: number, y: number, scale: number, rot = 0): void {
    const s = new Sprite(tex);
    s.anchor.set(0.5, 1);
    s.position.set(x, y);
    s.scale.set(scale);
    s.rotation = rot;
    s.eventMode = "none";
    s.zIndex = y; // y-sort: lower on screen draws in front
    layer.addChild(s);
  }

  // Layer 3 — grass tufts toward the edges and between zones.
  private scatterGrass(cx: number, cy: number, shx: number, shy: number, unit: number): void {
    this.grass.removeChildren();
    const r = rng(0x6a55);
    const N = 9;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2 + (r() - 0.5) * 0.6;
      const rad = 0.5 + r() * 0.42; // bias outward
      const x = cx + Math.cos(a) * shx * rad;
      const y = cy + Math.sin(a) * shy * rad;
      const scale = (0.4 + r() * 0.4) * unit;
      const rot = (r() - 0.5) * 0.2; // ±0.1 rad
      this.stamp(this.grass, this.tex.grass, x, y, scale, rot);
    }
  }

  // Layer 4 — rocks on the sand, some clustered near the edges.
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

  // Layer 5 — trees ringing the outer edge, alternating sprite, varied scale.
  private scatterTrees(cx: number, cy: number, shx: number, shy: number, unit: number): void {
    this.trees.removeChildren();
    const r = rng(0x9e3d);
    const N = 11;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2 + (r() - 0.5) * 0.28;
      const rad = 0.86 + r() * 0.12; // ring just inside / over the sand edge
      const x = cx + Math.cos(a) * shx * rad;
      const y = cy + Math.sin(a) * shy * rad;
      // Alternate sprite by parity → no two adjacent trees share a sprite.
      const tex = i % 2 === 0 ? this.tex.tree01 : this.tex.tree02;
      const scale = (0.5 + r() * 0.5) * unit; // 0.5–1.0 of the base unit
      this.stamp(this.trees, tex, x, y, scale);
    }
  }
}
