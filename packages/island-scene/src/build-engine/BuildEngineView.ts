import { Container, Graphics, Text } from "pixi.js";
import { getBuildItem, type BuildItemDef } from "../content/buildItems";
import { diamondPoly, screenToTile, tileCenter } from "../render/iso";
import { placementCells, planPlacementUpdate } from "./engine";
import type { BuildEvent, BuildRegion, BuildState, Placement } from "./types";

/**
 * BuildEngineView — the engine's Pixi half (Session 5). STATE-IN/EVENTS-OUT:
 * `setState(state)` diffs against what's on screen (planPlacementUpdate, the
 * sceneDiff pattern) and creates/removes/updates ONE display bundle per
 * placement — placing an item never rebuilds the scene (`stats` proves it in
 * tests). Taps emit BuildEvents through `onEvent`; the view applies nothing
 * itself, so a remote channel that feeds the same reducer drives this view
 * with zero changes (the Session 6 contract).
 *
 * Until illustrated item art lands (ASSET-SPEC.md), every item renders as a
 * placeholder: a category-colored rounded block sized to its footprint, its
 * name underneath, and a small direction notch showing rotation.
 */

const INK = 0x23201c;
/** Category → placeholder fill (warm, distinct, matching island palette temps). */
const CATEGORY_COLORS: Record<BuildItemDef["category"], number> = {
  structures: 0xc98a4b, // warm timber
  nature: 0x7cbf6b,     // leaf green
  figures: 0xf2b8c6,    // soft rose
  comfort: 0xf4d36b,    // lantern gold
};

export interface BuildEngineViewOptions {
  region: BuildRegion;
  /** Cells to draw the placement grid over (the buildable meadow + beach). */
  buildableCells: readonly { x: number; y: number }[];
  onEvent: (event: BuildEvent) => void;
  reducedMotion: boolean;
}

interface PlacementBundle {
  container: Container;
  sig: string;
}

export class BuildEngineView {
  /** Grid overlay (below placements). */
  readonly gridLayer = new Container();
  /** Y-sorted placements. Add to the scene's entity layer. */
  readonly itemLayer = new Container();
  /** Selection ring + rotate/remove chips (screen-space of the world). */
  readonly uiLayer = new Container();

  /** Display-work counters — the "placing one item never triggers a full
   *  rebuild" contract is asserted against these (see sceneDiff/X6). */
  readonly stats = { fullRebuilds: 0, bundlesBuilt: 0, bundlesRemoved: 0 };

  private bundles = new Map<string, PlacementBundle>();
  private state: BuildState = { version: 1, placements: [] };
  private selectedId: string | null = null;
  private rotateHit: { x: number; y: number; r: number } | null = null;
  private removeHit: { x: number; y: number; r: number } | null = null;

  constructor(private opts: BuildEngineViewOptions) {
    this.itemLayer.sortableChildren = true;
    this.gridLayer.eventMode = "none";
    this.itemLayer.eventMode = "none";
    this.uiLayer.eventMode = "none";
    this.drawGrid();
  }

  getState(): BuildState {
    return this.state;
  }

  /**
   * STATE IN. Diff by value → targeted bundle work only. A same-content state
   * (e.g. the echo of an event we emitted) is a strict no-op.
   */
  setState(state: BuildState): void {
    const plan = planPlacementUpdate(this.state.placements, state.placements);
    this.state = state;
    if (plan.isNoop) return;
    for (const id of plan.remove) this.destroyBundle(id);
    for (const p of plan.update) {
      this.destroyBundle(p.id);
      this.buildBundle(p);
    }
    for (const p of plan.add) this.buildBundle(p);
    // Keep the selection only if its placement survived.
    if (this.selectedId && !state.placements.some((p) => p.id === this.selectedId)) {
      this.select(null);
    } else if (this.selectedId) {
      this.drawSelection();
    }
  }

  /** Full teardown + rebuild — reset/load-save only, never a placement. */
  reset(state: BuildState): void {
    this.stats.fullRebuilds++;
    for (const id of [...this.bundles.keys()]) this.destroyBundle(id);
    this.state = { version: 1, placements: [] };
    this.select(null);
    this.setState(state);
  }

  /**
   * Resolve a WORLD-space tap.
   *  - selection chips (↻ / ✕) → emit rotate/remove for the selected item;
   *  - a placed item → select it (shows the chips);
   *  - empty space → clear selection. Returns true when the tap was consumed
   *    (callers then skip their own tap handling, e.g. drag-less placement).
   */
  handleTap(wx: number, wy: number): boolean {
    const inCircle = (h: { x: number; y: number; r: number } | null) =>
      !!h && Math.hypot(wx - h.x, wy - h.y) <= h.r;
    if (this.selectedId) {
      const selected = this.state.placements.find((p) => p.id === this.selectedId);
      if (selected && inCircle(this.rotateHit)) {
        this.opts.onEvent({
          type: "rotate",
          id: selected.id,
          rotation: (((selected.rotation + 1) % 4) as Placement["rotation"]),
        });
        return true;
      }
      if (selected && inCircle(this.removeHit)) {
        this.opts.onEvent({ type: "remove", id: selected.id });
        return true;
      }
    }
    const hit = this.placementAt(wx, wy);
    if (hit) {
      this.select(hit.id);
      return true;
    }
    if (this.selectedId) {
      this.select(null);
      return true; // the tap closed the selection; don't also place/walk
    }
    return false;
  }

  /** The buildable grid cell under a world point, or null (water/dock/off-
   *  island). This is the tap-to-place target resolver: the renderer calls it
   *  when a tap wasn't consumed by selection UI, and the host places the
   *  armed palette item there. */
  cellAt(wx: number, wy: number): { x: number; y: number } | null {
    const tile = screenToTile(wx, wy);
    return this.opts.region.buildable(tile.x, tile.y) ? tile : null;
  }

  /** The topmost placement whose footprint diamond(s) contain the world point. */
  placementAt(wx: number, wy: number): Placement | null {
    let best: Placement | null = null;
    let bestY = -Infinity;
    for (const p of this.state.placements) {
      const item = getBuildItem(p.itemId);
      if (!item) continue;
      for (const c of placementCells(p, item)) {
        const ctr = tileCenter(c.x, c.y);
        // Diamond hit-test via the iso metric (|dx|/hw + |dy|/hh <= 1).
        const dx = Math.abs(wx - ctr.x) / 32;
        const dy = Math.abs(wy - ctr.y) / 16;
        if (dx + dy <= 1 && ctr.y > bestY) {
          bestY = ctr.y;
          best = p;
        }
      }
    }
    return best;
  }

  select(id: string | null): void {
    this.selectedId = id;
    this.drawSelection();
  }

  get selected(): string | null {
    return this.selectedId;
  }

  destroy(): void {
    this.gridLayer.destroy({ children: true });
    this.itemLayer.destroy({ children: true });
    this.uiLayer.destroy({ children: true });
    this.bundles.clear();
  }

  // ── Display bundles ─────────────────────────────────────────────

  private buildBundle(p: Placement): void {
    const item = getBuildItem(p.itemId);
    if (!item) return;
    this.stats.bundlesBuilt++;
    const container = new Container();

    const cells = placementCells(p, item);
    // Footprint pad: one soft diamond per occupied cell.
    const pad = new Graphics();
    for (const c of cells) {
      pad.poly(diamondPoly(c.x, c.y)).fill({ color: CATEGORY_COLORS[item.category], alpha: 0.28 });
      pad.poly(diamondPoly(c.x, c.y)).stroke({ width: 2, color: INK, alpha: 0.35 });
    }
    container.addChild(pad);

    // Placeholder body: rounded block anchored at the footprint's center-front,
    // height cueing the item type (figures short, structures tall).
    const ctr = this.footprintCenter(cells);
    const w = 26 + (Math.max(...cells.map((c) => c.x)) - Math.min(...cells.map((c) => c.x)) + 1) * 14;
    const h = item.category === "structures" ? 54 : item.category === "figures" ? 34 : 26;
    const body = new Graphics();
    body
      .roundRect(ctr.x - w / 2, ctr.y - h, w, h, 8)
      .fill(CATEGORY_COLORS[item.category])
      .stroke({ width: 3, color: INK });
    body
      .roundRect(ctr.x - w / 2 + 3, ctr.y - h + 3, w - 6, h * 0.3, 6)
      .fill({ color: 0xffffff, alpha: 0.35 });
    // Rotation notch: a small ink dot on the facing edge (N/E/S/W).
    const notchAngle = (p.rotation * Math.PI) / 2 - Math.PI / 2;
    body
      .circle(ctr.x + Math.cos(notchAngle) * (w / 2 - 7), ctr.y - h / 2 + Math.sin(notchAngle) * (h / 2 - 7), 3.5)
      .fill(INK);
    container.addChild(body);

    const label = new Text({
      text: item.name,
      style: {
        fontFamily: '"Trebuchet MS", "Segoe UI", system-ui, sans-serif',
        fontSize: 11,
        fontWeight: "800",
        fill: 0xffffff,
        stroke: { color: INK, width: 3 },
      },
    });
    label.anchor.set(0.5, 0);
    label.position.set(ctr.x, ctr.y + 2);
    container.addChild(label);

    // Stackables ride visually higher, as if on their surface.
    if (item.stackable) container.position.y -= 14;

    container.zIndex = ctr.y + (item.stackable ? 0.5 : 0.3);
    this.itemLayer.addChild(container);
    this.bundles.set(p.id, { container, sig: `${p.itemId}|${p.cell.x}|${p.cell.y}|${p.rotation}` });
  }

  private destroyBundle(id: string): void {
    const b = this.bundles.get(id);
    if (!b) return;
    this.stats.bundlesRemoved++;
    b.container.destroy({ children: true });
    this.bundles.delete(id);
  }

  private footprintCenter(cells: { x: number; y: number }[]): { x: number; y: number } {
    let sx = 0;
    let sy = 0;
    for (const c of cells) {
      const ctr = tileCenter(c.x, c.y);
      sx += ctr.x;
      sy += ctr.y;
    }
    return { x: sx / cells.length, y: sy / cells.length };
  }

  // ── Grid + selection chrome ─────────────────────────────────────

  private drawGrid(): void {
    const g = new Graphics();
    for (const c of this.opts.buildableCells) {
      g.poly(diamondPoly(c.x, c.y)).stroke({ width: 1, color: INK, alpha: 0.14 });
    }
    this.gridLayer.addChild(g);
  }

  private drawSelection(): void {
    this.uiLayer.removeChildren().forEach((c) => c.destroy());
    this.rotateHit = null;
    this.removeHit = null;
    const p = this.selectedId
      ? this.state.placements.find((x) => x.id === this.selectedId)
      : null;
    if (!p) return;
    const item = getBuildItem(p.itemId);
    if (!item) return;
    const cells = placementCells(p, item);
    const ctr = this.footprintCenter(cells);

    const ring = new Graphics();
    for (const c of cells) {
      ring.poly(diamondPoly(c.x, c.y)).stroke({ width: 3, color: 0xffce4a, alpha: 0.95 });
    }
    this.uiLayer.addChild(ring);

    // Two chips above the item: ↻ rotate and ✕ remove (world-space hit circles).
    const chipY = ctr.y - 74;
    const chip = (cx: number, glyph: string, fill: number): { x: number; y: number; r: number } => {
      const g = new Graphics();
      g.circle(cx, chipY, 16).fill({ color: fill, alpha: 0.95 }).stroke({ width: 3, color: INK });
      const t = new Text({
        text: glyph,
        style: { fontFamily: "system-ui, sans-serif", fontSize: 16, fontWeight: "900", fill: INK },
      });
      t.anchor.set(0.5);
      t.position.set(cx, chipY);
      this.uiLayer.addChild(g, t);
      return { x: cx, y: chipY, r: 20 };
    };
    this.rotateHit = chip(ctr.x - 22, "↻", 0xffffff);
    this.removeHit = chip(ctr.x + 22, "✕", 0xffb3a7);
  }
}
