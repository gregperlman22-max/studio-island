import { Container, Graphics, Sprite, Text, type Texture } from "pixi.js";
import { getContentBounds } from "../render/avatarTexture";
import type { Rect } from "../render/treehouseModel";
import {
  drawCardFace,
  drawChoiceArt,
  drawClearing,
  drawNoticeMark,
  drawScrub,
  drawStoneStack,
  drawTray,
} from "./dioramaArt";
import {
  EC1_CHOICES,
  EC1_PROMPT,
  OLIVE_ANCHOR,
  OLIVE_H,
  applyChoice,
  atImage,
  choiceById,
  closeTabRect,
  dioramaStage,
  hitCard,
  layoutChoiceCards,
  openingScene,
  promptBottom,
  trayRect,
  type ChoiceId,
  type DioramaScene,
  type PlacedCard,
} from "./questTableModel";

/**
 * The Quest Table — a magical object IN the Treehouse.
 *
 * EC-1 SCOPE: this proves the composition and the interaction. One beat, two
 * choices, a miniature world that visibly changes. The seven-beat engine, the
 * three age bands, voice, rewind and patches are later S-89 work.
 *
 * THE RULE THIS CLASS IS BUILT AROUND — and the reason it is not a panel:
 *
 *   The room is never dimmed, never scrimmed and never replaced. The Treehouse
 *   stays lit around the table the entire time. The diorama rises FROM the
 *   painted table, in the room's own perspective. Olive stands on the room's
 *   floorboards beside it. The choices sit on a wooden tray hanging off the
 *   table's own near rim.
 *
 * If a future change adds a full-screen scrim behind this, or moves the
 * choices to a bottom sheet pinned to the viewport, the Quest Table has become
 * the generic overlay it was explicitly designed not to be. `questTable.test.ts`
 * asserts both halves of that — no scrim, and every card inside the tray — so
 * the regression is caught rather than noticed six months later.
 *
 * Layer order, back → front:
 *   Olive (room-anchored) → diorama + tray on the table → choice cards on the
 *   tray → prompt + outcome text
 *
 * Olive sits BEHIND the diorama deliberately: she is further into the room than
 * the table's front edge, so the table overlaps her the way a real one would.
 * The child's Friend appears ONLY in the miniature world — see OLIVE_ANCHOR in
 * questTableModel for why the room-scale duplicate was removed.
 */

const INK = 0x23201c;
const CARD = 0xfdf3e0;
const HONEY = 0xe8a33d;
const FONT = '"Trebuchet MS", "Segoe UI", system-ui, sans-serif';

/** How long the miniature world takes to rise from the table (seconds). */
const RISE_DUR = 0.55;
/** Which of the three players looks up when the child waves — the one standing
 *  nearest them. Deliberately not named: the group are temporary stand-ins
 *  drawn from the island's existing cast and no supporting character has been
 *  approved, so no copy in this beat names anyone. */
const NOTICER = 2;

export interface QuestTableTextures {
  /** The child's chosen Island Friend. */
  friend?: Texture;
  /** Olive. EC-1 falls back to the existing generic guide owl — see
   *  ASSET-SPEC-S89.md; the upgraded Olive is an acceptance dependency. */
  olive?: Texture;
  /** Three of the island's existing characters, standing in as the group the
   *  Friend wants to join. Real shipped art, no new asset required. */
  group: Texture[];
}

/** What a tap inside the open table resolved to. */
export type QuestTap = "choice" | "close" | "none";

/**
 * Where everything in the miniature world actually ended up on the last draw,
 * in stage-local px.
 *
 * Recorded because the two outcomes are CLAIMS ABOUT A PICTURE — "the Friend
 * stops short of the group", "the one nearest them visibly looks up" — and a
 * test that only checks the scene's state fields would pass while the drawing
 * overlapped, obscured the stone stack, or moved nobody. This is the drawn
 * geometry, so those claims can be asserted rather than described.
 */
export interface DrawnWorld {
  friend: { x: number; y: number; w: number };
  group: { x: number; y: number; w: number }[];
  stack: { x: number; w: number };
  /** Index of the player who looks up, or -1 when nobody is. */
  noticer: number;
  /** Whether the "someone looked up" mark was drawn. */
  noticeMark: boolean;
}

export class QuestTable {
  readonly container = new Container();

  private charLayer = new Container();
  private stageLayer = new Container();
  private cardLayer = new Container();
  private textLayer = new Container();

  private img: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private w = 0;
  private h = 0;
  private elapsed = 0;
  private rise = 0;

  private tex: QuestTableTextures = { group: [] };
  private scene: DioramaScene = openingScene();
  private cards: PlacedCard[] = [];
  private closeRect: Rect = { x: 0, y: 0, w: 0, h: 0 };
  /** The choice the child has made, if any. Null = still choosing. */
  private chosen: ChoiceId | null = null;
  /** Drawn geometry from the last frame — see DrawnWorld. */
  private world: DrawnWorld = { friend: { x: 0, y: 0, w: 0 }, group: [], stack: { x: 0, w: 0 }, noticer: -1, noticeMark: false };

  constructor(private opts: { reducedMotion: boolean }) {
    this.container.addChild(this.charLayer, this.stageLayer, this.cardLayer, this.textLayer);
    this.container.visible = false;
  }

  get active(): boolean {
    return this.container.visible;
  }

  /** The choice made so far — surfaced for tests and diagnostics. */
  get choice(): ChoiceId | null {
    return this.chosen;
  }

  /** Where the miniature world was actually drawn — see DrawnWorld. */
  get lastWorld(): DrawnWorld {
    return this.world;
  }

  setTextures(tex: Partial<QuestTableTextures>): void {
    this.tex = { ...this.tex, ...tex, group: tex.group ?? this.tex.group };
    if (this.active) this.draw();
  }

  /** Open the table. `img` is the room painting's on-screen rect. */
  open(img: Rect, w: number, h: number): void {
    this.img = img;
    this.w = w;
    this.h = h;
    this.scene = openingScene();
    this.chosen = null;
    this.rise = this.opts.reducedMotion ? 1 : 0;
    this.container.visible = true;
    this.draw();
  }

  close(): void {
    this.container.visible = false;
    this.chosen = null;
    this.clear();
  }

  /** Re-layout for a new size / framing without losing the child's choice. */
  relayout(img: Rect, w: number, h: number): void {
    this.img = img;
    this.w = w;
    this.h = h;
    if (this.active) this.draw();
  }

  handleTap(sx: number, sy: number): QuestTap {
    if (!this.active) return "none";
    if (hitCard(this.closeRect, sx, sy)) return "close";
    // Once a choice is made the cards are spent: this beat's job is done and
    // the outcome is what the child should be reading.
    if (this.chosen) return "none";
    const hit = this.cards.find((c) => hitCard(c, sx, sy));
    if (!hit) return "none";
    this.chosen = hit.id as ChoiceId;
    this.scene = applyChoice(this.scene, this.chosen);
    // Re-run the rise so the scene change is something the eye catches.
    if (!this.opts.reducedMotion) this.rise = 0.55;
    this.draw();
    return "choice";
  }

  update(dt: number): void {
    if (!this.active) return;
    this.elapsed += dt;
    if (this.rise < 1) {
      this.rise = Math.min(1, this.rise + dt / RISE_DUR);
      this.drawStage();
    }
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }

  // ── Drawing ───────────────────────────────────────────────────────

  private clear(): void {
    for (const layer of [this.charLayer, this.stageLayer, this.cardLayer, this.textLayer]) {
      layer.removeChildren().forEach((c) => c.destroy());
    }
  }

  private draw(): void {
    this.clear();
    this.drawCharacters();
    this.drawStage();
    this.drawCards();
    this.drawText();
  }

  /**
   * Anchor a character sprite on its measured feet and scale it by its VISIBLE
   * content height — the same content-bounds rule the world map and the boat
   * cinematic use, so a friend is the same size here as everywhere else and a
   * future 3/4 pose with different padding needs no per-site tuning.
   */
  private placeCharacter(tex: Texture, px: number, x: number, y: number, faceLeft: boolean): Container {
    const c = new Container();
    const shadow = new Graphics();
    shadow.ellipse(0, 0, px * 0.26, px * 0.07).fill({ color: 0x2a1a0c, alpha: 0.26 });
    c.addChild(shadow);
    const s = new Sprite(tex);
    const b = getContentBounds(tex);
    if (b) {
      s.anchor.set(b.centerX, b.feetY);
      s.scale.set(px / (b.contentH * (tex.height || 1)));
    } else {
      s.anchor.set(0.5, 1);
      s.scale.set(px / (tex.height || px));
    }
    if (faceLeft) s.scale.x *= -1;
    c.addChild(s);
    c.position.set(x, y);
    return c;
  }

  /** A stand-in body, used only when a character texture hasn't loaded. Never
   *  a face — a wrong face is worse than no face. */
  private placeholderCharacter(px: number, tint: number): Container {
    const c = new Container();
    const g = new Graphics();
    g.ellipse(0, 0, px * 0.26, px * 0.07).fill({ color: 0x2a1a0c, alpha: 0.26 });
    g.roundRect(-px * 0.2, -px * 0.86, px * 0.4, px * 0.86, px * 0.18)
      .fill({ color: tint, alpha: 0.5 })
      .stroke({ width: 3, color: INK, alpha: 0.4 });
    c.addChild(g);
    return c;
  }

  /**
   * Olive, standing on the room's floor beside the table.
   *
   * Only Olive. The child's Friend is in the miniature world and nowhere else —
   * a second, room-scale copy of the same character made the small one (the one
   * actually in the story) read as the lesser of the two.
   */
  private drawCharacters(): void {
    const olivePx = OLIVE_H * this.img.h;
    const at = atImage(this.img, OLIVE_ANCHOR.ax, OLIVE_ANCHOR.ay);
    const node = this.tex.olive
      ? this.placeCharacter(this.tex.olive, olivePx, at.x, at.y, false)
      : this.placeholderCharacter(olivePx, 0x8a6a44);
    node.position.set(at.x, at.y);
    this.charLayer.addChild(node);
  }

  /** The miniature world on the table top. */
  private drawStage(): void {
    this.stageLayer.removeChildren().forEach((c) => c.destroy());
    const st = dioramaStage(this.img);
    const ease = this.rise * this.rise * (3 - 2 * this.rise);

    const root = new Container();
    root.position.set(st.cx, st.cy);

    const ground = new Graphics();
    drawClearing(ground, st.rx, st.depth);
    root.addChild(ground);

    // Everything above the ground plane grows in as the world rises.
    const world = new Container();
    world.scale.set(1, Math.max(0.02, ease));
    world.alpha = Math.min(1, ease * 1.4);

    const unit = st.rx * 0.18;

    // A back rank of undergrowth, so the clearing has a far edge and the
    // miniature world reads as a place rather than a green plate.
    const scrub = new Graphics();
    drawScrub(scrub, st.rx, st.depth);
    world.addChild(scrub);

    // The group's game, back-left of the clearing.
    const stack = new Graphics();
    const stackX = -st.rx * 0.14;
    stack.position.set(stackX, -st.depth * 0.18);
    drawStoneStack(stack, this.scene.stones, unit);
    world.addChild(stack);
    // Widest stone is ~0.92 * unit, plus the two spares out to ~1.85 * unit.
    const drawn: DrawnWorld = {
      friend: { x: 0, y: 0, w: 0 },
      group: [],
      stack: { x: stackX, w: unit * 1.84 },
      noticer: -1,
      noticeMark: false,
    };

    // The three island characters already playing. Temporary stand-ins drawn
    // from the island's existing cast; none of them is a named or approved
    // character, and no copy in this beat names one.
    // `dy` is depth into the clearing (negative = further back), and scale
    // follows it, so the group reads as standing around a space rather than
    // side by side on a line.
    const groupSpots: { dx: number; dy: number; s: number }[] = [
      { dx: -0.5, dy: -0.34, s: 0.86 },
      { dx: -0.16, dy: -0.52, s: 0.74 },
      { dx: 0.2, dy: -0.12, s: 1.0 },
    ];
    groupSpots.forEach((spot, i) => {
      const tex = this.tex.group[i];
      // The one nearest the child's Friend is the one who looks up.
      const noticing = i === NOTICER && this.scene.group === "one-noticing";
      const px = st.height * 0.5 * spot.s * (noticing ? 1.12 : 1);
      // Noticing is a MOVEMENT, not a mirror. These sprites are close to
      // symmetric front-facing portraits, so flipping one is nearly invisible;
      // stepping out of the circle toward the Friend, standing a little taller
      // and carrying a notice mark is what actually reads at miniature size.
      const x = st.rx * (spot.dx + (noticing ? 0.16 : 0));
      const y = st.depth * (spot.dy + (noticing ? 0.22 : 0));
      const node = tex
        ? this.placeCharacter(tex, px, x, y, false)
        : this.placeholderCharacter(px, 0x9d9384);
      if (!tex) node.position.set(x, y);
      world.addChild(node);
      // A character's drawn width is ~0.6 of its height in this art.
      drawn.group.push({ x, y, w: px * 0.6 });
      if (noticing) {
        drawn.noticer = i;
        drawn.noticeMark = true;
        const mark = new Graphics();
        drawNoticeMark(mark, px * 0.34);
        mark.position.set(x + px * 0.3, y - px * 1.02);
        world.addChild(mark);
      }
    });
    if (drawn.noticer < 0) drawn.noticer = NOTICER;

    // The child's Friend, in the miniature world. Where they stand IS the
    // outcome of the choice: at the edge, part-way across, or waving.
    // A shade larger than the group, so a child picks themselves out of the
    // miniature world at a glance.
    const friendPx = st.height * 0.62;
    const pose = this.scene.friend;
    // "edge" reads as APART from the group — the premise of the beat. Walking
    // over closes most of that gap but STOPS SHORT of the circle: landing in
    // among them would read as "I joined in", which is exactly what did not
    // happen, and would cover both the nearest player and the stone stack.
    // Walking over closes the gap and steps back INTO the clearing, but stops
    // with a clear margin between the Friend and the nearest player — the exact
    // margin questTable.test.ts asserts, because "stops short" is a claim about
    // the picture, not about a state field.
    const fx = st.rx * (pose === "approaching" ? 0.55 : 0.68);
    const fy = st.depth * (pose === "approaching" ? 0.05 : 0.34);
    const mini = this.tex.friend
      ? this.placeCharacter(this.tex.friend, friendPx, fx, fy, true)
      : this.placeholderCharacter(friendPx, 0x6fae52);
    if (!this.tex.friend) mini.position.set(fx, fy);
    if (pose === "waving") {
      // Motion arcs beside the Friend, NOT a drawn-on arm.
      //
      // The six friends ship as front-facing portraits with no wave pose, and
      // grafting a limb onto one looks exactly like what it is. Arcs say
      // "waving" without claiming to be anatomy, and they read at miniature
      // size where a small arm would not.
      // PRODUCTION: a real wave pose — see ASSET-SPEC-S89.md.
      const arcs = new Graphics();
      const w = Math.max(1.6, friendPx * 0.05);
      for (let i = 0; i < 3; i++) {
        arcs
          .arc(0, 0, friendPx * (0.3 + i * 0.16), -1.35, -0.25)
          .stroke({ width: w, color: 0x4f8f3a, alpha: 0.95 - i * 0.24 });
      }
      arcs.position.set(fx + friendPx * 0.1, fy - friendPx * 0.78);
      world.addChild(arcs);
    }
    world.addChild(mini);
    drawn.friend = { x: fx, y: fy, w: friendPx * 0.6 };
    this.world = drawn;

    root.addChild(world);
    this.stageLayer.addChild(root);

    // The tray hangs off the table's near rim, in the same layer as the table's
    // own furniture, so the choices on it are part of the object.
    if (!this.chosen) {
      const tray = trayRect(this.img, this.w, this.h);
      const g = new Graphics();
      drawTray(g, tray.w, tray.h);
      g.position.set(tray.x + tray.w / 2, tray.y + tray.h / 2);
      this.stageLayer.addChild(g);
    }
  }

  /** The illustrated choices, lying on the rug in front of the table. */
  private drawCards(): void {
    this.cardLayer.removeChildren().forEach((c) => c.destroy());
    this.cards = this.chosen
      ? []
      : layoutChoiceCards(this.img, this.w, this.h, EC1_CHOICES.map((c) => c.id));

    for (const card of this.cards) {
      const choice = choiceById(card.id as ChoiceId);
      const c = new Container();
      c.position.set(card.x + card.w / 2, card.y + card.h / 2);

      const face = new Graphics();
      drawCardFace(face, card.w, card.h, false);
      c.addChild(face);

      const art = new Graphics();
      art.position.set(0, -card.h * 0.12);
      drawChoiceArt(art, choice.id, Math.min(card.w * 0.62, card.h * 0.78));
      c.addChild(art);

      const label = new Text({
        text: choice.label,
        style: {
          fontFamily: FONT,
          fontSize: Math.max(14, Math.min(20, card.h * 0.17)),
          fontWeight: "800",
          fill: INK,
          align: "center",
        },
      });
      label.anchor.set(0.5, 1);
      // The pill is sized from the framing and the label from its own metrics,
      // so a long label can outgrow a narrow card. Shrink rather than spill.
      const room = card.w - 16;
      if (label.width > room && label.width > 0) label.scale.set(room / label.width);
      label.position.set(0, card.h / 2 - 8);
      c.addChild(label);

      this.cardLayer.addChild(c);
    }
  }

  /**
   * The prompt before a choice, the outcome after it.
   *
   * Both sit ON the room — a soft parchment strip above the table, not a
   * header bar across the top of the screen. Progress ("beat 1 of 7") is
   * deliberately absent at EC-1: the pips belong with the real engine.
   */
  private drawText(): void {
    this.textLayer.removeChildren().forEach((c) => c.destroy());
    const st = dioramaStage(this.img);

    const chosen = this.chosen ? choiceById(this.chosen) : null;
    const line = chosen ? chosen.observed : EC1_PROMPT;
    const olive = chosen ? chosen.olive : null;

    const padX = 22;
    const padY = 14;
    const maxW = Math.min(this.w - 40 - padX * 2, this.img.w * 0.56);
    const size = Math.max(15, Math.min(21, this.img.h * 0.028));

    const body = new Text({
      text: line,
      style: {
        fontFamily: FONT, fontSize: size, fontWeight: "700", fill: INK,
        align: "center", wordWrap: true, wordWrapWidth: maxW, lineHeight: size * 1.4,
      },
    });
    body.anchor.set(0.5, 1);

    const oliveText = olive
      ? new Text({
          text: `Olive: "${olive}"`,
          style: {
            fontFamily: FONT, fontSize: size * 0.88, fontWeight: "600", fill: 0x6e4a2a,
            align: "center", wordWrap: true, wordWrapWidth: maxW, lineHeight: size * 1.3,
            fontStyle: "italic",
          },
        })
      : null;
    oliveText?.anchor.set(0.5, 1);

    const gap = oliveText ? 8 : 0;
    const innerH = body.height + gap + (oliveText?.height ?? 0);
    const innerW = Math.max(body.width, oliveText?.width ?? 0);
    // Centred on the table, but never off the screen. The open framing centres
    // the required span rather than the table, so on a phone the table sits
    // right of centre and a table-centred panel ran off the right edge with
    // the prompt's last word cut in half.
    const panelW = innerW + padX * 2;
    const cx = Math.max(panelW / 2 + 12, Math.min(st.cx, this.w - panelW / 2 - 12));
    const panelH = innerH + padY * 2;
    const bottom = promptBottom(this.img, this.h, panelH, st.cy - st.height);

    const panel = new Graphics();
    panel
      .roundRect(cx - innerW / 2 - padX, bottom - innerH - padY, innerW + padX * 2, innerH + padY * 2, 18)
      .fill({ color: CARD, alpha: 0.93 })
      .stroke({ width: 3, color: INK, alpha: 0.85 });
    this.textLayer.addChild(panel);

    body.position.set(cx, bottom - (oliveText ? oliveText.height + gap : 0));
    this.textLayer.addChild(body);
    if (oliveText) {
      oliveText.position.set(cx, bottom);
      this.textLayer.addChild(oliveText);
    }

    // Close affordance: a leaf tab on the table's near rim. Deliberately not a
    // top-right ✕ — the child is putting an object down, not dismissing a
    // dialog, and the room's own "Back to Island" is still there underneath.
    this.closeRect = closeTabRect(this.w, this.h, this.img);
    const t = this.closeRect;
    const tab = new Graphics();
    tab.roundRect(t.x, t.y, t.w, t.h, t.h / 2).fill(HONEY).stroke({ width: 4, color: INK });
    this.textLayer.addChild(tab);
    const tabLabel = new Text({
      text: "Put it down",
      style: { fontFamily: FONT, fontSize: 17, fontWeight: "900", fill: INK },
    });
    tabLabel.anchor.set(0.5);
    const tabRoom = t.w - 18;
    if (tabLabel.width > tabRoom && tabLabel.width > 0) tabLabel.scale.set(tabRoom / tabLabel.width);
    tabLabel.position.set(t.x + t.w / 2, t.y + t.h / 2);
    this.textLayer.addChild(tabLabel);
  }
}
