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
        // Rounded, leafy tree with dappled highlights.
        const trunk = shade(p?.land ?? "#7a5a3a", -0.5);
        const leaf = hexNum(p?.foliage ?? "#5fb35a");
        const leafDark = shade(p?.foliage ?? "#5fb35a", -0.28);
        const leafLit = shade(p?.foliage ?? "#5fb35a", 0.22);
        g.roundRect(-4, -18, 8, 22, 3).fill(trunk);
        g.ellipse(0, -28, 19, 17).fill(leafDark);
        g.ellipse(-4, -33, 15, 14).fill(leaf);
        g.ellipse(6, -30, 12, 11).fill(leaf);
        g.ellipse(-2, -37, 8, 7).fill(leafLit);
        break;
      }
      case "rock": {
        // Layered stack to suggest a little height (mountain feel).
        const base = shade(p?.landAlt ?? "#9b8a6a", -0.2);
        const mid = shade(p?.landAlt ?? "#9b8a6a", -0.05);
        const lit = shade(p?.landAlt ?? "#9b8a6a", 0.22);
        g.ellipse(0, 0, 16, 8).fill(shade(p?.land ?? "#7a5a3a", -0.55));
        g.roundRect(-13, -14, 26, 16, 7).fill(base);
        g.roundRect(-9, -22, 18, 12, 6).fill(mid);
        g.roundRect(-6, -22, 8, 6, 3).fill(lit);
        break;
      }
      case "mushroom": {
        g.roundRect(-2, -6, 4, 7, 2).fill(0xf3e7cf);
        g.ellipse(0, -7, 8, 5).fill(0xd9534f);
        g.circle(-3, -8, 1.4).fill(0xfff0e0);
        g.circle(2, -6, 1.1).fill(0xfff0e0);
        break;
      }
      case "shell": {
        const sh = hexNum(p?.accent ?? "#ff8aa3");
        g.ellipse(0, -1, 7, 6).fill(sh);
        for (let i = -2; i <= 2; i++) {
          g.moveTo(0, 1).lineTo(i * 3, -7).stroke({ width: 1, color: 0xffffff, alpha: 0.6 });
        }
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
    if (k.includes("mushroom") || k.includes("toadstool")) return "mushroom";
    if (k.includes("shell") || k.includes("starfish")) return "shell";
    return "shrub";
  }

  destroy(): void {
    for (const tex of this.cache.values()) tex.destroy(true);
    this.cache.clear();
  }
}
