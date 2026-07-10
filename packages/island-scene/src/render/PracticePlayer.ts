import { Container, Graphics, Text } from "pixi.js";
import type { MiniPractice } from "../content/types";
import { practiceCards, type PracticeCard } from "../content/practice";
import { practiceStepAudioId } from "../content/audio";

/**
 * PracticePlayer — the Mode-2 practice experience (Session 3b).
 *
 * When a child enters a zone that has a mini-practice (from
 * content/zones/<zone>/practices.json), the practice plays out here: a warm
 * focused card over the parallax interior that shows ONE step at a time — the
 * guide's intro line first (from the content pipeline), then each step, then a
 * gentle "All done!" completion moment. Tap to advance. No Stars are awarded
 * yet; the economy wiring comes in a later session.
 *
 * Plain TS, screen-space. SceneRenderer owns one instance, layers its
 * container above the zone view, feeds it the practice + resolved intro text,
 * and routes taps + the per-frame tick (the container is non-interactive; the
 * renderer hit-tests global coordinates, mirroring GuideOverlay).
 *
 * ALL practice TEXT comes from content; only the framing chrome (title header,
 * "Step N of M", "All done!") is UI, exactly like ZoneView's "You found it!".
 */

const INK = 0x23201c;
const PANEL_FILL = 0xfff4dd;
const POP_DUR = 0.26;

export interface PracticePlayerOptions {
  reducedMotion: boolean;
}

export class PracticePlayer {
  readonly container = new Container();

  private backdrop = new Graphics();
  private card = new Container();
  private ui = new Container();

  private cards: PracticeCard[] = [];
  private idx = 0;
  private practice: MiniPractice | null = null;
  /** Called whenever a card becomes current, so the host can play its voice. */
  private speak: (audioId: string) => void = () => {};

  private w = 0;
  private h = 0;
  private popAge = 0;
  private elapsed = 0;
  private closeHit: { x: number; y: number; w: number; h: number } | null = null;

  constructor(private opts: PracticePlayerOptions) {
    this.container.addChild(this.backdrop, this.card, this.ui);
    this.container.visible = false;
    // Taps are hit-tested by SceneRenderer against the whole overlay.
    this.container.eventMode = "none";
  }

  get active(): boolean {
    return this.container.visible;
  }

  /** Begin `practice`, opening on its intro line (resolved by the caller).
   *  `speak` voices each card's line as it's shown (silent if no audio). */
  start(
    practice: MiniPractice,
    introText: string,
    w: number,
    h: number,
    speak: (audioId: string) => void = () => {},
  ): void {
    this.cards = practiceCards(practice, introText);
    this.practice = practice;
    this.speak = speak;
    this.idx = 0;
    this.elapsed = 0;
    this.container.visible = true;
    this.build(w, h);
    this.speakCurrent();
  }

  /** The audio-line ID for the current card: the practice intro line, or a
   *  derived step ID; completion has no voice. */
  private currentAudioId(): string | null {
    const cur = this.cards[this.idx];
    if (!cur || !this.practice) return null;
    if (cur.kind === "intro") return this.practice.introLine;
    if (cur.kind === "step") return practiceStepAudioId(this.practice, cur.index - 1);
    return null;
  }

  hide(): void {
    this.container.visible = false;
  }

  resize(w: number, h: number): void {
    if (!this.container.visible) return;
    this.build(w, h);
  }

  /**
   * Resolve a tap. The ✕ (or a tap once the completion card is showing) closes
   * the player back to the zone interior; any other tap advances to the next
   * card. Returns "close" when the renderer should tear the player down.
   */
  handleTap(sx: number, sy: number): "close" | "none" {
    if (
      this.closeHit &&
      sx >= this.closeHit.x && sx <= this.closeHit.x + this.closeHit.w &&
      sy >= this.closeHit.y && sy <= this.closeHit.y + this.closeHit.h
    ) {
      return "close";
    }
    const cur = this.cards[this.idx];
    if (!cur || cur.kind === "complete") return "close";
    this.idx++;
    this.render();
    this.speakCurrent();
    return "none";
  }

  /** Voice the current card's line (silent if it has no audio). Called on card
   *  CHANGE only — not on resize/rebuild — so a resize never replays audio. */
  private speakCurrent(): void {
    const id = this.currentAudioId();
    if (id) this.speak(id);
  }

  // ── Build / render ──────────────────────────────────────────────────

  private build(w: number, h: number): void {
    this.w = w;
    this.h = h;
    this.backdrop.clear();
    this.backdrop.rect(0, 0, w, h).fill({ color: 0x1a1206, alpha: 0.5 });
    this.buildUI();
    this.render();
  }

  private buildUI(): void {
    this.ui.removeChildren().forEach((c) => c.destroy());
    // ✕ close (top-right) so a child or therapist can step out at any time.
    const g = new Graphics();
    const cx = this.w - 38;
    const cy = 38;
    g.circle(cx, cy, 22).fill({ color: 0xffffff, alpha: 0.92 }).stroke({ width: 3, color: INK });
    g.moveTo(cx - 8, cy - 8).lineTo(cx + 8, cy + 8)
      .moveTo(cx + 8, cy - 8).lineTo(cx - 8, cy + 8)
      .stroke({ width: 4, color: INK });
    this.ui.addChild(g);
    this.closeHit = { x: cx - 26, y: cy - 26, w: 52, h: 52 };
  }

  /** (Re)draw the current card and restart its pop-in. */
  private render(): void {
    this.card.removeChildren().forEach((c) => c.destroy());
    this.popAge = 0;
    const cur = this.cards[this.idx];
    if (!cur) return;

    const panelW = Math.min(this.w * 0.86, 520);
    const padX = 30;
    const padY = 26;
    const innerW = panelW - padX * 2;

    const title = new Text({
      text: cur.title,
      style: {
        fontFamily: '"Trebuchet MS", "Segoe UI", system-ui, sans-serif',
        fontSize: 24, fontWeight: "900", fill: 0xb5651d,
        stroke: { color: 0xffffff, width: 3 },
      },
    });
    title.anchor.set(0.5, 0);

    // Body: intro/step text from content, or the completion flourish (chrome).
    const bodyText = cur.kind === "complete" ? "All done!" : cur.body;
    const body = new Text({
      text: bodyText,
      style: {
        fontFamily: '"Trebuchet MS", "Segoe UI", system-ui, sans-serif',
        fontSize: cur.kind === "complete" ? 30 : 22,
        fontWeight: cur.kind === "complete" ? "900" : "700",
        fill: INK, align: "center", wordWrap: true, wordWrapWidth: innerW, lineHeight: 30,
      },
    });
    body.anchor.set(0.5, 0);

    // Footer: step counter / gentle cue / sparkle.
    const footerText =
      cur.kind === "step" ? `Step ${cur.index} of ${cur.total}`
      : cur.kind === "intro" ? "tap to begin…"
      : "✨";
    const footer = new Text({
      text: footerText,
      style: {
        fontFamily: '"Trebuchet MS", "Segoe UI", system-ui, sans-serif',
        fontSize: cur.kind === "complete" ? 34 : 14,
        fontWeight: "800",
        fill: cur.kind === "complete" ? 0xffcf4a : 0xb5651d,
      },
    });
    footer.anchor.set(0.5, 0);

    const gap = 14;
    const panelH = padY * 2 + title.height + gap + body.height + gap + footer.height;
    const panel = new Graphics();
    panel
      .roundRect(-panelW / 2, -panelH / 2, panelW, panelH, 24)
      .fill({ color: PANEL_FILL })
      .stroke({ width: 5, color: INK });
    panel
      .roundRect(-panelW / 2 + 5, -panelH / 2 + 5, panelW - 10, panelH * 0.34, 20)
      .fill({ color: 0xffffff, alpha: 0.35 });

    let y = -panelH / 2 + padY;
    title.position.set(0, y);
    y += title.height + gap;
    body.position.set(0, y);
    y += body.height + gap;
    footer.position.set(0, y);

    this.card.addChild(panel, title, body, footer);
    this.card.position.set(this.w * 0.5, this.h * 0.44);
    // A soft "tap to continue" hint bottom-center for step/intro cards.
    if (cur.kind !== "complete") {
      const hint = new Text({
        text: "tap to continue",
        style: {
          fontFamily: '"Trebuchet MS", "Segoe UI", system-ui, sans-serif',
          fontSize: 13, fontWeight: "700", fill: 0xffffff,
        },
      });
      hint.anchor.set(0.5, 1);
      hint.position.set(0, panelH / 2 + 30);
      this.card.addChild(hint);
    }
    // Start small so update()'s pop-in eases up to 1; reduced motion is static.
    this.card.scale.set(this.opts.reducedMotion ? 1 : 0.85);
  }

  update(dt: number): void {
    if (!this.container.visible) return;
    this.elapsed += dt;
    if (this.opts.reducedMotion) return;
    // Card pop-in.
    if (this.popAge < POP_DUR) {
      this.popAge = Math.min(POP_DUR, this.popAge + dt);
      const t = this.popAge / POP_DUR;
      const e = 1 - (1 - t) * (1 - t); // easeOutQuad
      this.card.scale.set(0.85 + 0.15 * e);
    }
    // Gentle breathe on the completion card so the moment feels alive.
    const cur = this.cards[this.idx];
    if (cur?.kind === "complete" && this.popAge >= POP_DUR) {
      this.card.scale.set(1 + Math.sin(this.elapsed * 2.4) * 0.02);
    }
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}
