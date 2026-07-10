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

    const INK = 0x23201c;
    switch (this.normalize(kind)) {
      case "tree": {
        // Epic, expressive tree: tall characterful trunk + big rounded canopy,
        // bold outline, flat cel fill with a light highlight (Wind Waker).
        const trunk = shade(p?.land ?? "#7a5a3a", -0.5);
        const leaf = hexNum(p?.foliage ?? "#5fb35a");
        const leafLit = shade(p?.foliage ?? "#5fb35a", 0.24);
        const leafDark = shade(p?.foliage ?? "#5fb35a", -0.22);
        g.poly([-6, 4, -4, -30, 4, -30, 6, 4]).fill(trunk).stroke({ width: 3, color: INK });
        g.circle(0, -44, 23).fill(leaf).stroke({ width: 4, color: INK });
        g.circle(-17, -36, 15).fill(leaf).stroke({ width: 4, color: INK });
        g.circle(18, -38, 14).fill(leaf).stroke({ width: 4, color: INK });
        g.circle(2, -54, 14).fill(leaf).stroke({ width: 4, color: INK });
        // re-fill centers to hide inner outlines, then highlight + shadow
        g.circle(0, -44, 21).fill(leaf);
        g.circle(-6, -50, 9).fill({ color: hexNum(leafLit), alpha: 0.85 });
        g.ellipse(8, -34, 12, 7).fill({ color: hexNum(leafDark), alpha: 0.4 });
        break;
      }
      case "rock": {
        // Bold-outlined layered boulder.
        const base = shade(p?.landAlt ?? "#9b8a6a", -0.18);
        const lit = shade(p?.landAlt ?? "#9b8a6a", 0.22);
        g.ellipse(0, 1, 17, 7).fill({ color: 0x000000, alpha: 0.18 });
        g.poly([-15, 2, -10, -14, 2, -20, 14, -12, 16, 0]).fill(base).stroke({ width: 4, color: INK });
        g.poly([-2, -18, 6, -19, 12, -10, 2, -9]).fill({ color: hexNum(lit), alpha: 0.7 });
        break;
      }
      case "mushroom": {
        g.roundRect(-2.5, -6, 5, 8, 2).fill(0xf3e7cf).stroke({ width: 2.5, color: INK });
        g.ellipse(0, -8, 9, 6).fill(0xe2553c).stroke({ width: 3, color: INK });
        g.circle(-3, -9, 1.6).fill(0xfff0e0);
        g.circle(2.5, -7, 1.2).fill(0xfff0e0);
        break;
      }
      case "shell": {
        const sh = hexNum(p?.accent ?? "#ff8aa3");
        g.poly([0, 3, -7, -7, -2.5, -8, 0, -3, 2.5, -8, 7, -7]).fill(sh).stroke({ width: 2.5, color: INK });
        break;
      }
      case "boat": {
        // Little beached dinghy (the free-build island's ferry stop): hull,
        // interior, bench seat, and a leaning oar. Bold-outlined like all art.
        const hull = 0x9a6b40;
        g.ellipse(0, 2, 20, 6).fill({ color: 0x000000, alpha: 0.18 }); // contact shadow
        g.poly([-19, -4, 19, -4, 13, 5, -13, 5]).fill(hull).stroke({ width: 3, color: INK });
        g.poly([-14, -4, 14, -4, 10, 1, -10, 1]).fill(shade(hull, 0.25));
        g.roundRect(-8, -4, 16, 3, 1).fill(shade(hull, -0.2)); // bench
        g.moveTo(10, -4).lineTo(20, -18).stroke({ width: 2.5, color: shade(hull, -0.35) }); // oar
        g.ellipse(21, -19, 3, 5).fill(shade(hull, -0.1)).stroke({ width: 2, color: INK });
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
    if (k.includes("boat") || k.includes("dinghy")) return "boat";
    return "shrub";
  }

  destroy(): void {
    for (const tex of this.cache.values()) tex.destroy(true);
    this.cache.clear();
  }
}
