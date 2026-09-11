import { Container, Graphics, Sprite, Text, type Texture } from "pixi.js";
import type { AvatarConfig, ThemePalette, ZoneKey } from "../types";
import type { ZoneInterior, ZoneTap } from "./ZoneInterior";
import { getZoneDialogue } from "../content/loader";
import { debugLog } from "./debug";
import {
  DECOR_ITEMS,
  HOTSPOTS,
  LEAF_SIZES,
  backButtonRect,
  coverRect,
  hitPill,
  hitRect,
  layoutHotspots,
  loadDecor,
  newPuzzle,
  saveDecor,
  storyPages,
  tapLeaf,
  toggleDecor,
  type DecorId,
  type HotspotId,
  type PlacedHotspot,
  type PuzzleState,
  type Rect,
} from "./treehouseModel";

/**
 * Treehouse Hideaway — Mode 2 as a SINGLE PAINTED ROOM.
 *
 * The other eight interiors are side-scrolling parallax scenes (ZoneView):
 * a child walks right until they find a beacon. Treehouse deliberately is not
 * that. It is one stationary room, everything visible at once, with three
 * large labelled buttons over the painting — Decorate, Leaf Puzzle, Story
 * Nook — plus an obvious way back to the island.
 *
 * There is no camera, no world width, no walk target and no avatar sprite in
 * here. Nothing in this class scrolls.
 *
 * ART CONTRACT: the room is a single painted image set through
 * `setBackground()` and drawn COVER-fit. Until that art lands the class draws
 * a warm code-built stand-in so the room is reviewable — see `drawFallback`.
 * All interface text is drawn HERE, in code, over the painting; none of it
 * may be baked into the artwork.
 */

const INK = 0x23201c;
/** Warm scrim behind an open activity card (matches the practice player). */
const SCRIM = 0x1a1206;
const CARD = 0xfdf3e0;
const HONEY = 0xe8a33d;
const FONT = '"Trebuchet MS", "Segoe UI", system-ui, sans-serif';

export interface TreehouseRoomOptions {
  reducedMotion: boolean;
}

/** Which activity card is open, if any. */
type OpenPanel = HotspotId | null;

export class TreehouseRoom implements ZoneInterior {
  readonly container = new Container();

  private bgLayer = new Container();
  private decorLayer = new Container();
  private hotspotLayer = new Container();
  private uiLayer = new Container();
  private panelLayer = new Container();
  private fx = new Container();

  private w = 0;
  private h = 0;
  private elapsed = 0;
  private bgTex?: Texture;
  /** The painting's on-screen rect (cover-fit); decor + hotspots anchor to it. */
  private img: Rect = { x: 0, y: 0, w: 0, h: 0 };

  private spots: PlacedHotspot[] = [];
  private backRect: Rect = { x: 0, y: 0, w: 0, h: 0 };

  private open: OpenPanel = null;
  /** Hit regions inside the open card, resolved by `handleTap`. */
  private panelHits: { id: string; rect: Rect }[] = [];
  private closeRect: Rect | null = null;

  private decor: DecorId[] = [];
  private savedToast = 0;
  private puzzle: PuzzleState = newPuzzle(1);
  private shake = 0;
  private storyPage = 0;
  private pages: string[] = [];

  private ripples: { g: Graphics; age: number }[] = [];

  constructor(private opts: TreehouseRoomOptions) {
    this.container.addChild(
      this.bgLayer,
      this.decorLayer,
      this.hotspotLayer,
      this.uiLayer,
      this.panelLayer,
      this.fx,
    );
    this.panelLayer.visible = false;
    this.container.visible = false;
  }

  // ── ZoneInterior ──────────────────────────────────────────────────

  /** `zone` and `cfg` are part of the shared interior contract; this room is
   *  Treehouse-only and draws no avatar, so neither is used. */
  enter(_zone: ZoneKey, _palette: ThemePalette, _cfg: AvatarConfig | null, w: number, h: number): void {
    this.decor = loadDecor();
    this.puzzle = newPuzzle(Date.now() & 0xffff);
    this.pages = storyPages(getZoneDialogue("treehouse_hideaway"));
    this.storyPage = 0;
    this.closePanel();
    this.build(w, h);
    this.container.visible = true;
    debugLog(
      `[island-scene] TreehouseRoom.enter ${w}x${h} — single room, no scroll ` +
        `(bg=${this.bgTex ? "painted" : "FALLBACK"}, decor=${this.decor.length}, pages=${this.pages.length})`,
    );
  }

  hide(): void {
    this.container.visible = false;
    this.closePanel();
  }

  get active(): boolean {
    return this.container.visible;
  }

  resize(w: number, h: number): void {
    if (!this.active && this.w === 0) return;
    this.build(w, h);
  }

  /** Theme/avatar prop changes don't reskin a painted room; kept for the
   *  shared interior contract. */
  restyle(_palette: ThemePalette, _cfg: AvatarConfig | null): void {
    // no-op by design
  }

  /**
   * Drop in the painted room art. Safe to call before or after `enter` — the
   * room simply redraws with the texture once it arrives, so a slow image can
   * never block the child from opening an activity.
   */
  setBackground(tex: Texture | undefined): void {
    this.bgTex = tex;
    if (this.w > 0) this.build(this.w, this.h);
  }

  handleTap(sx: number, sy: number): ZoneTap {
    this.spawnRipple(sx, sy);

    // An open card swallows every tap beneath it.
    if (this.open) {
      if (this.closeRect && hitRect(this.closeRect, sx, sy)) {
        this.closePanel();
        return "move";
      }
      const hit = this.panelHits.find((p) => hitRect(p.rect, sx, sy));
      if (hit) this.onPanelHit(hit.id);
      else this.closePanel(); // tapping the scrim closes, like the guide card
      return "move";
    }

    if (hitRect(this.backRect, sx, sy)) return "exit";

    const spot = this.spots.find((s) => hitPill(s, sx, sy));
    if (spot) {
      this.openPanel(spot.id);
      return "activity";
    }
    return "move";
  }

  update(dt: number): void {
    if (!this.container.visible) return;
    this.elapsed += dt;
    this.tickRipples(dt);

    if (this.savedToast > 0) {
      this.savedToast = Math.max(0, this.savedToast - dt);
      if (this.savedToast === 0 && this.open === "decorate") this.drawPanel();
    }
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt);
      if (this.open === "puzzle") this.drawPanel();
    }

    // Gentle breathing on the three buttons so they read as tappable.
    if (!this.opts.reducedMotion && !this.open) {
      const pulse = 1 + 0.02 * Math.sin(this.elapsed * 2.2);
      for (const child of this.hotspotLayer.children) child.scale.set(pulse);
    }
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }

  // ── Room ──────────────────────────────────────────────────────────

  private build(w: number, h: number): void {
    this.w = w;
    this.h = h;
    this.img = this.bgTex
      ? coverRect(this.bgTex.width, this.bgTex.height, w, h)
      : { x: 0, y: 0, w, h };

    this.drawBackground();
    this.drawDecor();

    const layout = layoutHotspots(this.img, w, h);
    this.spots = layout.spots;
    this.drawHotspots();

    this.backRect = backButtonRect(w, h);
    this.drawBack();

    if (this.open) this.drawPanel();
    debugLog(`[island-scene] TreehouseRoom layout → hotspots ${layout.mode}`);
  }

  private drawBackground(): void {
    this.bgLayer.removeChildren().forEach((c) => c.destroy());
    if (this.bgTex) {
      const s = new Sprite(this.bgTex);
      s.position.set(this.img.x, this.img.y);
      s.width = this.img.w;
      s.height = this.img.h;
      this.bgLayer.addChild(s);
      return;
    }
    this.bgLayer.addChild(this.drawFallback());
  }

  /**
   * TEMPORARY stand-in for the painted room — a warm, deliberately simple
   * interior so the layout and all three activities can be reviewed before
   * the final artwork exists. It is NOT the visual target and should be
   * deleted the day the painting lands (see setBackground / ASSET STATUS).
   */
  private drawFallback(): Container {
    const { w, h } = this;
    const c = new Container();
    const g = new Graphics();

    // Honey-wood wall, warmer toward the floor.
    const bands = 22;
    for (let i = 0; i < bands; i++) {
      const t = i / (bands - 1);
      const r = Math.round(0x6d + t * 0x3e);
      const gr = Math.round(0x49 + t * 0x2f);
      const b = Math.round(0x2a + t * 0x18);
      g.rect(0, (h * i) / bands, w, h / bands + 1).fill((r << 16) | (gr << 8) | b);
    }
    // Plank seams.
    for (let y = h * 0.08; y < h * 0.72; y += Math.max(26, h * 0.07)) {
      g.rect(0, y, w, 2).fill({ color: 0x4a3320, alpha: 0.35 });
    }
    // Floor.
    g.rect(0, h * 0.72, w, h * 0.28).fill(0x8a5c31);
    g.rect(0, h * 0.72, w, 4).fill({ color: 0xd9a463, alpha: 0.5 });

    // Central living tree.
    g.poly([w * 0.44, h * 0.78, w * 0.46, h * 0.1, w * 0.54, h * 0.1, w * 0.56, h * 0.78])
      .fill(0x6b4526)
      .stroke({ width: 4, color: INK });
    g.ellipse(w * 0.5, h * 0.78, w * 0.12, h * 0.03).fill(0x5a381e);

    // Round windows with golden evening light.
    for (const cx of [w * 0.16, w * 0.84]) {
      const r = Math.min(w, h) * 0.11;
      g.circle(cx, h * 0.32, r).fill(0xf6d08a).stroke({ width: 5, color: 0x5a3c22 });
      g.circle(cx, h * 0.32, r * 0.98).fill({ color: 0xffe9b8, alpha: 0.55 });
    }

    // Reading nook + lanterns.
    g.roundRect(w * 0.68, h * 0.6, w * 0.22, h * 0.16, 16).fill(0xc07a4a).stroke({ width: 4, color: INK });
    for (const cx of [w * 0.3, w * 0.7]) {
      g.circle(cx, h * 0.2, Math.min(w, h) * 0.035).fill(0xffca6b).stroke({ width: 3, color: INK });
      g.circle(cx, h * 0.2, Math.min(w, h) * 0.075).fill({ color: 0xffca6b, alpha: 0.16 });
    }

    // Warm vignette so code-drawn UI still reads against it.
    g.rect(0, 0, w, h).fill({ color: 0x2a1a0c, alpha: 0.12 });
    c.addChild(g);
    return c;
  }

  /** The child's saved decorations, sitting in the room itself. */
  private drawDecor(): void {
    this.decorLayer.removeChildren().forEach((c) => c.destroy());
    const size = Math.max(26, Math.min(54, Math.min(this.w, this.h) * 0.07));
    for (const item of DECOR_ITEMS) {
      if (!this.decor.includes(item.id)) continue;
      const t = new Text({ text: item.icon, style: { fontSize: size } });
      t.anchor.set(0.5);
      t.position.set(
        this.img.x + item.ax * this.img.w,
        this.img.y + item.ay * this.img.h,
      );
      this.decorLayer.addChild(t);
    }
  }

  private drawHotspots(): void {
    this.hotspotLayer.removeChildren().forEach((c) => c.destroy());
    for (const s of this.spots) {
      const c = new Container();
      c.position.set(s.x, s.y);
      const fontSize = Math.max(15, Math.min(21, s.h * 0.3));

      const g = new Graphics();
      g.roundRect(-s.w / 2, -s.h / 2, s.w, s.h, s.h / 2)
        .fill({ color: CARD, alpha: 0.95 })
        .stroke({ width: 4, color: INK });
      g.roundRect(-s.w / 2 + 5, -s.h / 2 + 5, s.w - 10, s.h * 0.34, s.h / 3)
        .fill({ color: 0xffffff, alpha: 0.5 });
      c.addChild(g);

      const icon = new Text({ text: s.icon, style: { fontSize: fontSize * 1.5 } });
      icon.anchor.set(0.5);
      icon.position.set(-s.w / 2 + s.h * 0.46, 0);
      c.addChild(icon);

      const label = new Text({
        text: s.label,
        style: { fontFamily: FONT, fontSize, fontWeight: "800", fill: INK },
      });
      label.anchor.set(0, 0.5);
      label.position.set(-s.w / 2 + s.h * 0.86, 0);
      c.addChild(label);

      this.hotspotLayer.addChild(c);
    }
  }

  private drawBack(): void {
    this.uiLayer.removeChildren().forEach((c) => c.destroy());
    const r = this.backRect;
    const g = new Graphics();
    g.roundRect(r.x, r.y, r.w, r.h, r.h / 2)
      .fill({ color: CARD, alpha: 0.95 })
      .stroke({ width: 4, color: INK });
    this.uiLayer.addChild(g);
    const label = new Text({
      text: "← Back to Island",
      style: {
        fontFamily: FONT,
        fontSize: Math.max(14, Math.min(19, r.h * 0.32)),
        fontWeight: "800",
        fill: INK,
      },
    });
    label.anchor.set(0.5);
    label.position.set(r.x + r.w / 2, r.y + r.h / 2);
    this.uiLayer.addChild(label);
  }

  // ── Activity cards ────────────────────────────────────────────────

  private openPanel(id: HotspotId): void {
    this.open = id;
    if (id === "story") this.storyPage = 0;
    if (id === "puzzle" && this.puzzle.done) this.puzzle = newPuzzle(Date.now() & 0xffff);
    this.panelLayer.visible = true;
    this.drawPanel();
    debugLog(`[island-scene] treehouse activity → ${id}`);
  }

  private closePanel(): void {
    this.open = null;
    this.panelHits = [];
    this.closeRect = null;
    this.panelLayer.visible = false;
    this.panelLayer.removeChildren().forEach((c) => c.destroy());
  }

  /** Card geometry shared by all three activities. */
  private cardRect(): Rect {
    const w = Math.min(this.w * 0.86, 520);
    const h = Math.min(this.h * 0.7, 430);
    return { x: (this.w - w) / 2, y: (this.h - h) / 2, w, h };
  }

  private drawPanel(): void {
    this.panelLayer.removeChildren().forEach((c) => c.destroy());
    this.panelHits = [];
    if (!this.open) return;

    const scrim = new Graphics();
    scrim.rect(0, 0, this.w, this.h).fill({ color: SCRIM, alpha: 0.5 });
    this.panelLayer.addChild(scrim);

    const r = this.cardRect();
    const card = new Graphics();
    card.roundRect(r.x, r.y, r.w, r.h, 26).fill(CARD).stroke({ width: 5, color: INK });
    card.roundRect(r.x + 6, r.y + 6, r.w - 12, r.h * 0.16, 20).fill({ color: 0xffffff, alpha: 0.55 });
    this.panelLayer.addChild(card);

    const titles: Record<HotspotId, string> = {
      decorate: "Decorate",
      puzzle: "Leaf Puzzle",
      story: "Story Nook",
    };
    const title = new Text({
      text: titles[this.open],
      style: {
        fontFamily: FONT,
        fontSize: Math.max(20, Math.min(30, r.h * 0.075)),
        fontWeight: "900",
        fill: INK,
      },
    });
    title.anchor.set(0.5, 0);
    title.position.set(r.x + r.w / 2, r.y + r.h * 0.045);
    this.panelLayer.addChild(title);

    // Close ✕ — generously sized for small fingers.
    const cs = 50;
    this.closeRect = { x: r.x + r.w - cs - 8, y: r.y + 8, w: cs, h: cs };
    const close = new Graphics();
    const ccx = this.closeRect.x + cs / 2;
    const ccy = this.closeRect.y + cs / 2;
    close.circle(ccx, ccy, 20).fill({ color: 0xffffff, alpha: 0.92 }).stroke({ width: 3, color: INK });
    close
      .moveTo(ccx - 7, ccy - 7).lineTo(ccx + 7, ccy + 7)
      .moveTo(ccx + 7, ccy - 7).lineTo(ccx - 7, ccy + 7)
      .stroke({ width: 4, color: INK });
    this.panelLayer.addChild(close);

    if (this.open === "decorate") this.drawDecoratePanel(r);
    else if (this.open === "puzzle") this.drawPuzzlePanel(r);
    else this.drawStoryPanel(r);
  }

  private drawDecoratePanel(r: Rect): void {
    const hint = this.bodyText(
      "Tap to add or remove.",
      r.x + r.w / 2,
      r.y + r.h * 0.17,
      r.w * 0.86,
    );
    this.panelLayer.addChild(hint);

    // 2 × 2 grid of big toggle tiles.
    const cols = 2;
    const gap = 14;
    const tw = (r.w * 0.78 - gap) / cols;
    const th = Math.min(tw * 0.72, r.h * 0.2);
    const left = r.x + (r.w - (tw * cols + gap)) / 2;
    const top = r.y + r.h * 0.3;

    DECOR_ITEMS.forEach((item, i) => {
      const cx = left + (i % cols) * (tw + gap);
      const cy = top + Math.floor(i / cols) * (th + gap);
      const on = this.decor.includes(item.id);
      const rect: Rect = { x: cx, y: cy, w: tw, h: th };
      this.panelHits.push({ id: `decor:${item.id}`, rect });

      const g = new Graphics();
      g.roundRect(cx, cy, tw, th, 16)
        .fill(on ? HONEY : 0xffffff)
        .stroke({ width: on ? 5 : 3, color: INK });
      this.panelLayer.addChild(g);

      const icon = new Text({ text: item.icon, style: { fontSize: Math.min(th * 0.42, 40) } });
      icon.anchor.set(0.5);
      icon.position.set(cx + tw / 2, cy + th * 0.38);
      this.panelLayer.addChild(icon);

      const label = new Text({
        text: item.label,
        style: { fontFamily: FONT, fontSize: 15, fontWeight: "800", fill: INK },
      });
      label.anchor.set(0.5);
      label.position.set(cx + tw / 2, cy + th * 0.78);
      this.panelLayer.addChild(label);
    });

    if (this.savedToast > 0) {
      const t = new Text({
        text: "Saved ✓",
        style: { fontFamily: FONT, fontSize: 17, fontWeight: "900", fill: 0x2f6b3a },
      });
      t.anchor.set(0.5);
      t.position.set(r.x + r.w / 2, r.y + r.h * 0.93);
      this.panelLayer.addChild(t);
    }
  }

  private drawPuzzlePanel(r: Rect): void {
    const msg = this.puzzle.done
      ? "You did it! 🍃"
      : "Tap the leaves from smallest to biggest.";
    this.panelLayer.addChild(
      this.bodyText(msg, r.x + r.w / 2, r.y + r.h * 0.17, r.w * 0.86),
    );

    const slotW = (r.w * 0.82) / LEAF_SIZES.length;
    const left = r.x + (r.w - slotW * LEAF_SIZES.length) / 2;
    const midY = r.y + r.h * 0.56;
    const maxLeaf = Math.min(slotW * 0.82, r.h * 0.26);

    for (const leaf of this.puzzle.leaves) {
      const size = maxLeaf * LEAF_SIZES[leaf.rank];
      const cx = left + slotW * leaf.slot + slotW / 2;
      const solved = leaf.rank < this.puzzle.progress;
      // Hit box is the full slot, never the small leaf — a tiny target is a
      // tiny target however pretty the leaf is.
      const rect: Rect = {
        x: left + slotW * leaf.slot,
        y: midY - maxLeaf * 0.75,
        w: slotW,
        h: maxLeaf * 1.5,
      };
      if (!this.puzzle.done) this.panelHits.push({ id: `leaf:${leaf.rank}`, rect });

      const wobble =
        this.shake > 0 && this.puzzle.wrongRank === leaf.rank && !this.opts.reducedMotion
          ? Math.sin(this.shake * 44) * 7
          : 0;

      const g = new Graphics();
      g.ellipse(cx + wobble, midY, size * 0.42, size * 0.62)
        .fill(solved ? 0x8fc46a : 0x5f9e46)
        .stroke({ width: 4, color: INK });
      g.moveTo(cx + wobble, midY + size * 0.62).lineTo(cx + wobble, midY + size * 0.86)
        .stroke({ width: 4, color: 0x6e4a2a });
      g.moveTo(cx + wobble, midY - size * 0.55).lineTo(cx + wobble, midY + size * 0.55)
        .stroke({ width: 2, color: 0x2f6b3a, alpha: 0.5 });
      if (solved) {
        const tick = new Text({ text: "✓", style: { fontSize: 20, fill: 0x2f6b3a, fontWeight: "900" } });
        tick.anchor.set(0.5);
        tick.position.set(cx + wobble, midY + size * 0.95);
        this.panelLayer.addChild(g, tick);
      } else {
        this.panelLayer.addChild(g);
      }
    }

    // Progress dots.
    const dotY = r.y + r.h * 0.86;
    const dots = new Graphics();
    LEAF_SIZES.forEach((_, i) => {
      const cx = r.x + r.w / 2 + (i - (LEAF_SIZES.length - 1) / 2) * 22;
      dots.circle(cx, dotY, 7).fill(i < this.puzzle.progress ? 0x5f9e46 : 0xd9cbb2).stroke({ width: 2, color: INK });
    });
    this.panelLayer.addChild(dots);
  }

  private drawStoryPanel(r: Rect): void {
    const page = this.pages[this.storyPage] ?? "";
    const last = this.storyPage >= this.pages.length - 1;

    const body = this.bodyText(page, r.x + r.w / 2, r.y + r.h * 0.24, r.w * 0.8);
    body.style.fontSize = Math.max(16, Math.min(21, r.h * 0.052));
    this.panelLayer.addChild(body);

    // Page dots.
    const dotY = r.y + r.h * 0.72;
    const dots = new Graphics();
    this.pages.forEach((_, i) => {
      const cx = r.x + r.w / 2 + (i - (this.pages.length - 1) / 2) * 20;
      dots.circle(cx, dotY, 6).fill(i === this.storyPage ? 0x6e4a2a : 0xd9cbb2).stroke({ width: 2, color: INK });
    });
    this.panelLayer.addChild(dots);

    // Advance / finish pill.
    const bw = Math.min(r.w * 0.56, 240);
    const bh = 58;
    const rect: Rect = { x: r.x + (r.w - bw) / 2, y: r.y + r.h * 0.8, w: bw, h: bh };
    this.panelHits.push({ id: last ? "story:done" : "story:next", rect });
    const g = new Graphics();
    g.roundRect(rect.x, rect.y, bw, bh, bh / 2).fill(HONEY).stroke({ width: 4, color: INK });
    this.panelLayer.addChild(g);
    const label = new Text({
      text: last ? "The End" : "Next →",
      style: { fontFamily: FONT, fontSize: 19, fontWeight: "900", fill: INK },
    });
    label.anchor.set(0.5);
    label.position.set(rect.x + bw / 2, rect.y + bh / 2);
    this.panelLayer.addChild(label);
  }

  private bodyText(text: string, cx: number, top: number, wrapWidth: number): Text {
    const t = new Text({
      text,
      style: {
        fontFamily: FONT,
        fontSize: 17,
        fontWeight: "600",
        fill: INK,
        align: "center",
        wordWrap: true,
        wordWrapWidth: wrapWidth,
        lineHeight: 25,
      },
    });
    t.anchor.set(0.5, 0);
    t.position.set(cx, top);
    return t;
  }

  /** Route a tap that landed on a hit region inside the open card. */
  private onPanelHit(id: string): void {
    const [kind, value] = id.split(":");
    if (kind === "decor") {
      this.decor = toggleDecor(this.decor, value as DecorId);
      if (saveDecor(this.decor)) this.savedToast = 1.6;
      this.drawDecor();
      this.drawPanel();
      return;
    }
    if (kind === "leaf") {
      const before = this.puzzle.progress;
      this.puzzle = tapLeaf(this.puzzle, Number(value));
      if (this.puzzle.progress === before) this.shake = 0.4;
      this.drawPanel();
      return;
    }
    if (kind === "story") {
      if (value === "done") this.closePanel();
      else {
        this.storyPage = Math.min(this.storyPage + 1, this.pages.length - 1);
        this.drawPanel();
      }
    }
  }

  // ── Tap feedback ──────────────────────────────────────────────────

  private spawnRipple(sx: number, sy: number): void {
    if (this.opts.reducedMotion) return;
    const g = new Graphics();
    g.circle(0, 0, 14).stroke({ width: 3, color: 0xffffff, alpha: 0.95 });
    g.position.set(sx, sy);
    this.fx.addChild(g);
    this.ripples.push({ g, age: 0 });
  }

  private tickRipples(dt: number): void {
    for (let i = this.ripples.length - 1; i >= 0; i--) {
      const r = this.ripples[i];
      r.age += dt;
      const t = r.age / 0.55;
      if (t >= 1) {
        r.g.destroy();
        this.ripples.splice(i, 1);
        continue;
      }
      r.g.scale.set(1 + t * 2.4);
      r.g.alpha = 1 - t;
    }
  }
}
