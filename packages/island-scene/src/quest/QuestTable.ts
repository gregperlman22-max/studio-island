import { Container, Graphics, Sprite, Text, type Texture } from "pixi.js";
import { getContentBounds } from "../render/avatarTexture";
import type { Rect } from "../render/treehouseModel";
import { drawCardFace, drawChoiceArt, drawClearing, drawScrub, drawStoneStack } from "./dioramaArt";
import {
  EC1_CHOICES,
  EC1_PROMPT,
  FRIEND_ANCHOR,
  FRIEND_H,
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
 *   painted table, in the room's own perspective. Olive and the child's Friend
 *   stand on the room's floorboards, flanking the table. The choices lie on the
 *   rug in front of it.
 *
 * If a future change adds a full-screen scrim behind this, or moves the
 * choices to a bottom sheet pinned to the viewport, the Quest Table has become
 * the generic overlay it was explicitly designed not to be. `questTable.test.ts`
 * asserts the no-scrim half of that so the regression is caught rather than
 * noticed six months later.
 *
 * Layer order, back → front:
 *   characters (Olive + Friend, room-anchored) → diorama on the table →
 *   choice cards on the rug → prompt + outcome text
 *
 * Olive and the Friend sit BEHIND the diorama deliberately: they are further
 * into the room than the table's front edge, and the table should overlap
 * their feet the way a real table would.
 */

const INK = 0x23201c;
const CARD = 0xfdf3e0;
const HONEY = 0xe8a33d;
const FONT = '"Trebuchet MS", "Segoe UI", system-ui, sans-serif';

/** How long the miniature world takes to rise from the table (seconds). */
const RISE_DUR = 0.55;

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

  /** Olive and the Friend, standing on the room's floor either side of the table. */
  private drawCharacters(): void {
    const olivePx = OLIVE_H * this.img.h;
    const friendPx = FRIEND_H * this.img.h;
    const oliveAt = atImage(this.img, OLIVE_ANCHOR.ax, OLIVE_ANCHOR.ay);
    const friendAt = atImage(this.img, FRIEND_ANCHOR.ax, FRIEND_ANCHOR.ay);

    // Olive faces right, toward the table and the child's Friend.
    const oliveNode = this.tex.olive
      ? this.placeCharacter(this.tex.olive, olivePx, oliveAt.x, oliveAt.y, false)
      : this.placeholderCharacter(olivePx, 0x8a6a44);
    oliveNode.position.set(oliveAt.x, oliveAt.y);
    this.charLayer.addChild(oliveNode);

    const friendNode = this.tex.friend
      ? this.placeCharacter(this.tex.friend, friendPx, friendAt.x, friendAt.y, true)
      : this.placeholderCharacter(friendPx, 0x6fae52);
    friendNode.position.set(friendAt.x, friendAt.y);
    this.charLayer.addChild(friendNode);
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
    stack.position.set(-st.rx * 0.14, -st.depth * 0.18);
    drawStoneStack(stack, this.scene.stones, unit);
    world.addChild(stack);

    // The three island characters already playing. The one nearest the front
    // is Pip — the one who looks up when the child waves.
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
      const px = st.height * 0.5 * spot.s;
      const x = st.rx * spot.dx;
      const y = st.depth * spot.dy;
      const noticing = i === 2 && this.scene.group === "one-noticing";
      const node = tex
        ? this.placeCharacter(tex, px, x, y, !noticing)
        : this.placeholderCharacter(px, 0x9d9384);
      if (!tex) node.position.set(x, y);
      // Pip turns toward the child's Friend when they wave.
      if (noticing) node.scale.x = Math.abs(node.scale.x);
      world.addChild(node);
    });

    // The child's Friend, in the miniature world. Where they stand IS the
    // outcome of the choice: at the edge, part-way across, or waving.
    // A shade larger than the group, so a child picks themselves out of the
    // miniature world at a glance.
    const friendPx = st.height * 0.62;
    const pose = this.scene.friend;
    // "edge" is meant to read as APART from the group — the whole premise of
    // the beat — so it sits well clear of them, and walking over closes that
    // gap visibly.
    const fx = st.rx * (pose === "approaching" ? 0.0 : 0.92);
    const fy = st.depth * (pose === "approaching" ? -0.06 : 0.34);
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

    root.addChild(world);
    this.stageLayer.addChild(root);
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

    const maxW = Math.min(this.w - 40, this.img.w * 0.56);
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

    const padX = 22;
    const padY = 14;
    const gap = oliveText ? 8 : 0;
    const innerH = body.height + gap + (oliveText?.height ?? 0);
    const innerW = Math.max(body.width, oliveText?.width ?? 0);
    const cx = st.cx;
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
