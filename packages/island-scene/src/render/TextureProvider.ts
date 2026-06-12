import { Graphics, Texture, type Renderer } from "pixi.js";
import type { ThemePalette } from "../types";
import { hexNum, shade } from "./iso";

/**
 * Abstraction over where pixels come from. Milestone 1/2 generate everything
 * programmatically from the active palette; a later phase can swap in a
 * provider backed by hand-made or generated sprite atlases WITHOUT touching
 * scene logic — the renderer only ever asks for a decoration by `kind`.
 */
export interface TextureProvider {
  /** A bottom-anchored texture for a decoration kind (tree, rock, …). */
  getDecoration(kind: string): Texture;
  /** Rebuild palette-dependent textures after a theme swap. */
  refresh(palette: ThemePalette): void;
  destroy(): void;
}

/**
 * Programmatic provider: draws simple, charming procedural props (trees,
 * rocks, reeds) tinted by the theme palette and bakes them to GPU textures.
 */
export class ProgrammaticTextureProvider implements TextureProvider {
  private cache = new Map<string, Texture>();
  private palette: ThemePalette | null = null;

  constructor(private renderer: Renderer) {}

  refresh(palette: ThemePalette): void {
    this.palette = palette;
    for (const tex of this.cache.values()) tex.destroy(true);
    this.cache.clear();
  }

  getDecoration(kind: string): Texture {
    const existing = this.cache.get(kind);
    if (existing) return existing;
    const tex = this.bake(kind);
    this.cache.set(kind, tex);
    return tex;
  }

  private bake(kind: string): Texture {
    const p = this.palette;
    const g = new Graphics();

    switch (this.normalize(kind)) {
      case "tree": {
        const trunk = shade(p?.land ?? "#7a5a3a", -0.45);
        const leaf = hexNum(p?.foliage ?? "#5fb35a");
        const leafDark = shade(p?.foliage ?? "#5fb35a", -0.25);
        g.roundRect(-4, -14, 8, 18, 3).fill(trunk);
        g.ellipse(0, -22, 16, 14).fill(leafDark);
        g.ellipse(-3, -26, 13, 12).fill(leaf);
        g.ellipse(5, -24, 10, 9).fill(leaf);
        break;
      }
      case "rock": {
        const base = shade(p?.landAlt ?? "#9b8a6a", -0.15);
        const lit = shade(p?.landAlt ?? "#9b8a6a", 0.2);
        g.ellipse(0, 0, 14, 8).fill(shade(p?.land ?? "#7a5a3a", -0.5));
        g.roundRect(-12, -12, 24, 14, 6).fill(base);
        g.roundRect(-9, -12, 12, 7, 4).fill(lit);
        break;
      }
      default: {
        // Generic shrub fallback for unknown decoration kinds.
        const leaf = hexNum(p?.foliage ?? "#5fb35a");
        g.ellipse(0, -6, 11, 9).fill(shade(p?.foliage ?? "#5fb35a", -0.2));
        g.ellipse(-2, -9, 9, 8).fill(leaf);
      }
    }

    const tex = this.renderer.generateTexture(g);
    g.destroy();
    return tex;
  }

  private normalize(kind: string): string {
    const k = kind.toLowerCase();
    if (k.includes("tree") || k.includes("clover") || k.includes("fern")) return "tree";
    if (k.includes("rock") || k.includes("stone") || k.includes("cairn") || k.includes("driftwood")) return "rock";
    return "shrub";
  }

  destroy(): void {
    for (const tex of this.cache.values()) tex.destroy(true);
    this.cache.clear();
  }
}
