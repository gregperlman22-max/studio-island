import { BlurFilter, Container, Graphics, Sprite, Text, type Texture } from "pixi.js";
import type { AvatarConfig, ThemePalette, ZoneKey } from "../types";
import type { ZoneInterior, ZoneTap } from "./ZoneInterior";
import { getZoneDialogue } from "../content/loader";
import { debugLog } from "./debug";
import { drawDecor, drawHotspotIcon, drawLeaf, drawLeafTick } from "./treehouseDecorArt";
import { QuestTable } from "../quest/QuestTable";
import type { OlivePoseKey } from "../quest/questTableModel";
import { TABLE, questRoomFit } from "../quest/questTableModel";
import {
  ART_EDGE_TOP,
  ART_FILL_TOP_FAR,
  DECOR_ITEMS,
  HOTSPOTS,
  LEAF_SIZES,
  backButtonRect,
  coverRect,
  roomFit,
  hitPill,
  hitRect,
  layoutHotspots,
  loadDecor,
  MIN_TAP,
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
  type RoomFit,
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
 * There is no camera, no world width and no walk target in here. Nothing in
 * this class scrolls.
 *
 * S-89 / EC-1 — TWO NOTES THAT SUPERSEDE EARLIER COMMENTS IN THIS FILE:
 *
 * 1. The room now hosts the QUEST TABLE: the painted round table becomes a
 *    magical object a child picks up, with a miniature world rising from it.
 *    It is NOT a fourth activity card. It is drawn in the room's own
 *    perspective with the room lit around it, and it deliberately does not use
 *    `drawPanel`/`panelLayer` — those draw a scrimmed card, which is exactly
 *    what the Quest Table must never become. See QuestTable.ts.
 * 2. This room previously drew no avatar at all, documented as intentional.
 *    That no longer holds while the Quest Table is in use: the child's chosen
 *    Island Friend and Olive both stand on the floor either side of the table
 *    (issue #6 plumbing). With the table closed the room is unchanged — whether
 *    the Friend should simply live in this room is a separate design question
 *    and is NOT answered here.
 *
 * ART CONTRACT: the room is the single painted image
 * (assets/interiors/treehouse-hideaway.webp), set through `setBackground()`
 * and drawn COVER-fit. That painting is the design authority. All interface
 * text is drawn HERE, in code, over it; none of it is baked into the artwork,
 * so the art can be repainted without touching a label. When the texture is
 * unavailable — a load failure, or the moment before it decodes — the room
 * shows a plain warm ground (`drawPlaceholderGround`), never a mock room.
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
  private questLayer = new Container();
  private fx = new Container();

  /** The Quest Table. Owns the diorama, the two room characters and the
   *  illustrated choices; draws into `questLayer`, above the room and below
   *  the tap FX. */
  private quest: QuestTable;
  private questOpen = false;
  /** Screen rect of the table top, the tap target that opens the table. */
  private tableRect: Rect = { x: 0, y: 0, w: 0, h: 0 };

  private w = 0;
  private h = 0;
  private elapsed = 0;
  private bgTex?: Texture;
  /** The painting's on-screen rect; decor + hotspots anchor to it. On portrait
   *  viewports it is pulled back from cover so the whole room reads (see
   *  roomFit), and the leftover height is filled with the art's edge tones. */
  private img: RoomFit = { x: 0, y: 0, w: 0, h: 0, mode: "cover" };

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
    this.quest = new QuestTable({ reducedMotion: opts.reducedMotion });
    this.container.addChild(
      this.bgLayer,
      this.decorLayer,
      this.questLayer,
      this.hotspotLayer,
      this.uiLayer,
      this.panelLayer,
      this.fx,
    );
    this.questLayer.addChild(this.quest.container);
    this.panelLayer.visible = false;
    this.container.visible = false;
  }

  // ── ZoneInterior ──────────────────────────────────────────────────

  /** `zone` and `palette` are part of the shared interior contract; this room
   *  is Treehouse-only and painted, so neither is used. `cfg`/`avatarTex` ARE
   *  used now — the Quest Table stands the chosen Island Friend in the room. */
  enter(
    _zone: ZoneKey,
    _palette: ThemePalette,
    _cfg: AvatarConfig | null,
    w: number,
    h: number,
    avatarTex?: Texture,
  ): void {
    // Assigned UNCONDITIONALLY, including undefined. Guarding this on a truthy
    // texture meant a child who switched from a friend whose art had loaded to
    // one whose art had not kept seeing the FIRST friend — the room would
    // happily show someone else's character as theirs.
    this.quest.setTextures({ friend: avatarTex });
    this.closeQuest();
    this.decor = loadDecor();
    this.puzzle = newPuzzle(Date.now() & 0xffff);
    this.pages = storyPages(getZoneDialogue("treehouse_hideaway"));
    this.storyPage = 0;
    this.closePanel();
    this.build(w, h);
    this.container.visible = true;
    debugLog(
      `[island-scene] TreehouseRoom.enter ${w}x${h} — single room, no scroll ` +
        `(bg=${this.bgTex ? "painted" : "awaiting art"}, decor=${this.decor.length}, pages=${this.pages.length})`,
    );
  }

  hide(): void {
    this.container.visible = false;
    this.closePanel();
    this.closeQuest();
  }

  get active(): boolean {
    return this.container.visible;
  }

  resize(w: number, h: number): void {
    if (!this.active && this.w === 0) return;
    this.build(w, h);
  }

  /** Theme changes don't reskin a painted room. The avatar texture DOES matter:
   *  this is how a late-arriving texture reaches the Quest Table, and how a
   *  CHANGE of friend clears the previous one. */
  restyle(_palette: ThemePalette, _cfg: AvatarConfig | null, avatarTex?: Texture): void {
    // Unconditional, for the same reason as `enter`: this is the call that
    // carries a SELECTION CHANGE as well as a late-arriving texture, so an
    // undefined texture has to be able to clear stale art rather than be
    // ignored.
    this.quest.setTextures({ friend: avatarTex });
  }

  /** Olive's art, and the three island characters standing in as the group in
   *  the miniature story. Supplied by the renderer, which owns every texture
   *  cache; safe before or after `enter`. */
  setQuestCast(
    olive: Texture | undefined,
    group: Texture[],
    olivePoses?: Partial<Record<OlivePoseKey, Texture>>,
  ): void {
    this.quest.setTextures({ olive, group, olivePoses });
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

    // The Quest Table, while it is in use, gets first refusal on every tap —
    // but only inside its own affordances. A tap that lands on nothing does
    // NOT close it: a child resting a finger on the room should not put the
    // magical object down.
    if (this.questOpen) {
      const q = this.quest.handleTap(sx, sy);
      if (q === "close") {
        this.closeQuest();
        return "move";
      }
      if (q === "choice") return "activity";
      // Back to Island still works with the table open.
      if (hitRect(this.backRect, sx, sy)) return "exit";
      return "move";
    }

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

    // VISIBLE CONTROLS FIRST. The Quest Table's target is the whole painted
    // table — large, and with no border of its own — so testing it before the
    // three activity pills let it shadow anything drawn over it. A child who
    // taps a pill must get that pill's activity, whatever is underneath.
    // `clearOf` keeps them from overlapping in the first place; this ordering
    // is the belt to that braces, and the two are tested together.
    const spot = this.spots.find((s) => hitPill(s, sx, sy));
    if (spot) {
      this.openPanel(spot.id);
      return "activity";
    }

    if (hitRect(this.tableRect, sx, sy)) {
      this.openQuest();
      return "activity";
    }
    return "move";
  }

  update(dt: number): void {
    if (!this.container.visible) return;
    this.elapsed += dt;
    this.tickRipples(dt);
    this.quest.update(dt);

    if (this.savedToast > 0) {
      this.savedToast = Math.max(0, this.savedToast - dt);
      if (this.savedToast === 0 && this.open === "decorate") this.drawPanel();
    }
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt);
      if (this.open === "puzzle") this.drawPanel();
    }

    // Gentle breathing on the pills + the table marker so they read as
    // tappable. Silent while the table is in use — nothing in the room should
    // be competing with the story on it.
    if (!this.opts.reducedMotion && !this.open && !this.questOpen) {
      const pulse = 1 + 0.02 * Math.sin(this.elapsed * 2.2);
      for (const child of this.hotspotLayer.children) child.scale.set(pulse);
    }
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }

  /** Whether the Quest Table is in use — surfaced for tests + diagnostics. */
  get questTableOpen(): boolean {
    return this.questOpen;
  }

  // ── Room ──────────────────────────────────────────────────────────

  private build(w: number, h: number): void {
    this.w = w;
    this.h = h;
    // With the Quest Table in use the subject is narrower and specific —
    // Olive, the table, the Friend — and that band must never be cropped.
    // `questRoomFit` pulls the framing back only when it would be (phone
    // portrait); desktop and tablet get the room's normal fit unchanged.
    const fit = this.questOpen ? questRoomFit : roomFit;
    this.img = this.bgTex
      ? fit(this.bgTex.width, this.bgTex.height, w, h)
      : { x: 0, y: 0, w, h, mode: "cover" };

    this.drawBackground();
    this.drawDecor();
    this.layoutTableRect();

    // The three activity pills step aside while the table is in use: they are
    // the room's OTHER things to do, and leaving them up would turn a shared
    // object into a screen with a toolbar.
    // The pills are laid out AROUND the Quest Table's tap target, so none of
    // them can end up sitting on it (see clearOf in treehouseModel).
    const layout = layoutHotspots(this.img, w, h, this.questOpen ? undefined : this.tableRect);
    this.spots = this.questOpen ? [] : layout.spots;
    this.drawHotspots();
    if (this.questOpen) this.quest.relayout(this.img, w, h);

    this.backRect = backButtonRect(w, h);
    this.drawBack();

    if (this.open) this.drawPanel();
    debugLog(
      `[island-scene] TreehouseRoom layout → hotspots ${this.questOpen ? "hidden (quest)" : layout.mode}` +
        ` fit=${this.img.mode}`,
    );
  }

  private drawBackground(): void {
    this.bgLayer.removeChildren().forEach((c) => c.destroy());
    if (this.bgTex) {
      if (this.img.mode === "portrait") this.bgLayer.addChild(this.drawPortraitFill());
      const s = new Sprite(this.bgTex);
      s.position.set(this.img.x, this.img.y);
      s.width = this.img.w;
      s.height = this.img.h;
      this.bgLayer.addChild(s);
      return;
    }
    this.bgLayer.addChild(this.drawPlaceholderGround());
  }

  /**
   * Shown ONLY when the painting is unavailable: a load failure, or the brief
   * moment before the texture decodes on a cold cache. It is deliberately a
   * plain warm ground, NOT a mock room — the painted art is the design
   * authority and nothing here should ever be mistaken for it.
   *
   * (This replaced the code-built stand-in room that stood in before
   * treehouse-hideaway.webp shipped.)
   */
  private drawPlaceholderGround(): Container {
    const { w, h } = this;
    const c = new Container();
    const g = new Graphics();
    const bands = 16;
    for (let i = 0; i < bands; i++) {
      const t = i / (bands - 1);
      const r = Math.round(0x7a + t * 0x2c);
      const gr = Math.round(0x55 + t * 0x25);
      const b = Math.round(0x33 + t * 0x16);
      g.rect(0, (h * i) / bands, w, h / bands + 1).fill((r << 16) | (gr << 8) | b);
    }
    c.addChild(g);
    return c;
  }

  /**
   * Portrait framing backdrop.
   *
   * On a tablet the painting is shown at full width, which leaves height over.
   * Rather than bar that space off, we fill the whole viewport with the SAME
   * painting, cover-fit, blurred and dimmed. The colour, light direction and
   * shapes behind the art are therefore the room's own — it reads as depth
   * around a framed view, not as a letterbox. A warm gradient sits underneath
   * so the screen is still right if the blur filter is unavailable.
   */
  private drawPortraitFill(): Container {
    const c = new Container();
    const { x, y, w, h } = this.img;

    // 1. Warm base, ramping off the painting's own edge tones.
    const base = new Graphics();
    const BANDS = 20;
    const near = parseInt(ART_EDGE_TOP.slice(1), 16);
    const far = parseInt(ART_FILL_TOP_FAR.slice(1), 16);
    for (let i = 0; i < BANDS; i++) {
      const t = i / (BANDS - 1);
      const mix = (shift: number): number => {
        const a = (near >> shift) & 0xff;
        const b = (far >> shift) & 0xff;
        return Math.round(b + (a - b) * t);
      };
      base.rect(0, (this.h * i) / BANDS, this.w, this.h / BANDS + 1)
        .fill((mix(16) << 16) | (mix(8) << 8) | mix(0));
    }
    c.addChild(base);

    // 2. The room itself, blurred and pushed back.
    if (this.bgTex) {
      // Over-scaled past cover so the blurred content does NOT line up with
      // the crisp painting in front of it — that misalignment is what makes it
      // read as depth rather than as a doubled image.
      const cover = coverRect(this.bgTex.width, this.bgTex.height, this.w, this.h);
      const zoom = 1.3;
      const amb = new Sprite(this.bgTex);
      amb.width = cover.w * zoom;
      amb.height = cover.h * zoom;
      amb.position.set(
        cover.x - (cover.w * (zoom - 1)) / 2,
        cover.y - (cover.h * (zoom - 1)) / 2,
      );
      amb.alpha = 0.8;
      try {
        amb.filters = [new BlurFilter({ strength: Math.max(10, this.w * 0.02) })];
      } catch {
        // No filter support — keep it faint so it can't read as a second room.
        amb.alpha = 0.25;
      }
      c.addChild(amb);
      const scrim = new Graphics();
      scrim.rect(0, 0, this.w, this.h).fill({ color: 0x2a1708, alpha: 0.34 });
      c.addChild(scrim);
    }

    // 3. A soft drop shadow so the crisp painting sits in FRONT of all that.
    const edge = new Graphics();
    for (let i = 1; i <= 5; i++) {
      edge.rect(x - i * 2, y - i * 2, w + i * 4, h + i * 4)
        .stroke({ width: 4, color: 0x120a02, alpha: 0.1 });
    }
    c.addChild(edge);
    return c;
  }

  /** The child's saved decorations, sitting in the room itself. */
  private drawDecor(): void {
    this.decorLayer.removeChildren().forEach((c) => c.destroy());
    // Scaled off the PAINTING, not the viewport, so a decoration keeps its
    // size relative to the furniture around it at every framing.
    const size = Math.max(46, Math.min(132, this.img.w * 0.078));
    for (const item of DECOR_ITEMS) {
      if (!this.decor.includes(item.id)) continue;
      const g = new Graphics();
      g.position.set(
        this.img.x + item.ax * this.img.w,
        this.img.y + item.ay * this.img.h,
      );
      drawDecor(item.id, g, size);
      this.decorLayer.addChild(g);
    }
  }

  // ── Quest Table ───────────────────────────────────────────────────

  /**
   * The tap target that picks the table up: the painted table's TOP SURFACE,
   * resolved to screen space. Anchored to the art (not the viewport) so it
   * stays on the table at every framing, exactly like HOTSPOTS.
   *
   * Generously padded past the painted ellipse — a child aiming at a table
   * aims at the table, not at a 30px-tall band of wood.
   */
  private layoutTableRect(): void {
    const cx = this.img.x + TABLE.cx * this.img.w;
    const cy = this.img.y + TABLE.cy * this.img.h;
    const w = Math.max(MIN_TAP * 1.6, TABLE.halfW * 2 * this.img.w);
    const h = Math.max(MIN_TAP, TABLE.topRy * 4.2 * this.img.h);
    this.tableRect = { x: cx - w / 2, y: cy - h / 2, w, h };
  }

  /**
   * The invitation, drawn ON the table while it is closed: a leaf-bound book
   * with a warm glow under it, plus a small label. Not a pill — the whole
   * point is that the child taps an object in the room, so the affordance has
   * to be an object.
   *
   * STAND-IN ART. Production replaces this with the painted closed Quest
   * Table dressing — see ASSET-SPEC-S89.md.
   */
  private drawTableMarker(): void {
    if (this.questOpen) return;
    const cx = this.tableRect.x + this.tableRect.w / 2;
    const cy = this.tableRect.y + this.tableRect.h / 2;
    const s = Math.max(30, Math.min(84, this.img.w * 0.048));
    const c = new Container();
    c.position.set(cx, cy);

    const g = new Graphics();
    // Warm glow on the wood.
    g.ellipse(0, s * 0.3, s * 1.25, s * 0.42).fill({ color: HONEY, alpha: 0.2 });
    g.ellipse(0, s * 0.3, s * 0.85, s * 0.28).fill({ color: HONEY, alpha: 0.22 });
    // A closed book, seen at the room's angle.
    g.roundRect(-s * 0.52, -s * 0.36, s * 1.04, s * 0.62, s * 0.08)
      .fill(0x6e4a2a)
      .stroke({ width: 3.5, color: INK });
    g.roundRect(-s * 0.44, -s * 0.3, s * 0.92, s * 0.14, s * 0.05)
      .fill({ color: 0xffffff, alpha: 0.28 });
    // Pages edge.
    g.roundRect(-s * 0.46, 0.04 * s, s * 0.92, s * 0.14, s * 0.04)
      .fill(0xf2e4c4)
      .stroke({ width: 2.5, color: INK });
    // A leaf clasp, tying it to the Treehouse.
    g.ellipse(s * 0.18, -s * 0.06, s * 0.2, s * 0.12).fill(0x6fae52).stroke({ width: 2.5, color: INK });
    c.addChild(g);

    const label = new Text({
      text: "Quest Table",
      style: {
        fontFamily: FONT,
        fontSize: Math.max(13, Math.min(18, s * 0.28)),
        fontWeight: "900",
        fill: 0xfffaf0,
        stroke: { color: INK, width: 4 },
      },
    });
    label.anchor.set(0.5, 0);
    label.position.set(0, s * 0.5);
    c.addChild(label);
    this.hotspotLayer.addChild(c);
  }

  private openQuest(): void {
    this.questOpen = true;
    this.closePanel();
    // Re-run the room build so the framing pulls back to take in the table
    // and both characters, then open the table into that framing.
    this.build(this.w, this.h);
    this.quest.open(this.img, this.w, this.h);
    debugLog("[island-scene] Quest Table → picked up");
  }

  private closeQuest(): void {
    if (!this.questOpen) {
      this.quest.close();
      return;
    }
    this.questOpen = false;
    this.quest.close();
    this.build(this.w, this.h);
    debugLog("[island-scene] Quest Table → put down");
  }

  private drawHotspots(): void {
    this.hotspotLayer.removeChildren().forEach((c) => c.destroy());
    this.drawTableMarker();
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

      const icon = new Graphics();
      icon.position.set(-s.w / 2 + s.h * 0.46, 0);
      drawHotspotIcon(s.id, icon, s.h * 0.6);
      c.addChild(icon);

      const label = new Text({
        text: s.label,
        style: { fontFamily: FONT, fontSize, fontWeight: "800", fill: INK },
      });
      label.anchor.set(0, 0.5);
      const textLeft = -s.w / 2 + s.h * 0.86;
      // Same fit rule as the back pill: the pill is sized from the viewport and
      // the label from its own metrics, so on a narrow tablet "Leaf Puzzle"
      // could run out past its pill and into the next one. Shrink to fit.
      const room = s.w / 2 - 12 - textLeft;
      if (label.width > room && label.width > 0) label.scale.set(room / label.width);
      label.position.set(textLeft, 0);
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
    // The pill is sized from the viewport, the label from its own metrics, so
    // on a narrow phone the text can be wider than the pill. Shrink it to fit
    // rather than letting it spill over the painting.
    const room = r.w - 22;
    if (label.width > room && label.width > 0) label.scale.set(room / label.width);
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
      // Selected tiles get a honey ring and a tick rather than a honey flood:
      // filling them drowned the illustration that says what they are.
      g.roundRect(cx, cy, tw, th, 16)
        .fill(on ? 0xfff6e4 : 0xffffff)
        .stroke({ width: 3, color: INK });
      if (on) {
        g.roundRect(cx + 4, cy + 4, tw - 8, th - 8, 12)
          .stroke({ width: 4, color: HONEY });
      }
      this.panelLayer.addChild(g);
      if (on) {
        const tick = new Graphics();
        drawLeafTick(tick, cx + tw - 17, cy + 17, 12);
        this.panelLayer.addChild(tick);
      }

      const icon = new Graphics();
      icon.position.set(cx + tw / 2, cy + th * 0.4);
      drawDecor(item.id, icon, Math.min(th * 0.62, 62));
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

      const wobbling =
        this.shake > 0 && this.puzzle.wrongRank === leaf.rank && !this.opts.reducedMotion;
      const offsetX = wobbling ? Math.sin(this.shake * 44) * 7 : 0;
      // A settled tilt per slot so the row reads as gathered leaves rather
      // than a row of identical icons; solved ones straighten up.
      const tilt = solved ? 0 : (leaf.slot - 1.5) * 0.13 + (leaf.rank % 2 ? 0.06 : -0.05);

      const g = new Graphics();
      drawLeaf(g, cx, midY, { size, tilt, solved, offsetX });
      this.panelLayer.addChild(g);

      if (solved) {
        const tick = new Graphics();
        drawLeafTick(tick, cx + offsetX, midY + size * 0.62, Math.max(9, size * 0.17));
        this.panelLayer.addChild(tick);
      }
    }

    // Progress dots.
    const dotY = r.y + r.h * 0.86;
    const dots = new Graphics();
    LEAF_SIZES.forEach((_, i) => {
      const cx = r.x + r.w / 2 + (i - (LEAF_SIZES.length - 1) / 2) * 22;
      const done = i < this.puzzle.progress;
      dots.circle(cx, dotY, done ? 8 : 7)
        .fill(done ? 0x6fae52 : 0xe4d6bb)
        .stroke({ width: 2.5, color: INK });
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
