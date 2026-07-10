import { Container, Graphics, Sprite, Text, type Texture } from "pixi.js";
import type { DialogueLine, DialogueLineId } from "../content/types";
import type { GuideEntry } from "./guideCatalog";

/**
 * GuideOverlay — Phase 2 landmark guide (screen space).
 *
 * When a child taps a landmark, its resident guide animal pops in from below
 * with a bouncy entrance, idles with a gentle breathe/bob plus the occasional
 * wave or head-tilt, and greets them through a warm storybook speech bubble
 * (the guide's name in bold above an in-character welcome). A back affordance
 * (and a tap anywhere) slides the guide back out and returns to the island.
 *
 * Plain TS, screen space. SceneRenderer owns one instance, adds its container
 * as a top layer (above the world map — it does not reorder the island's own
 * layers), feeds it taps + the per-frame tick, and shows it on a zone tap.
 *
 * The guide art is knocked out to transparency by the same loader the avatars
 * use (loadAvatarTexture), so the guide sits clean against the dimmed backdrop.
 */

/** Bold cel outline color, matching the rest of the scene's art register. */
const INK = 0x23201c;
/** Warm painted bubble fill (soft cream). */
const BUBBLE_FILL = 0xfff4dd;

/** Entrance / exit durations (seconds). */
const DUR_IN = 0.72;
const DUR_OUT = 0.42;
/** The speech bubble pops in a touch after the guide has begun rising. */
const BUBBLE_DELAY = 0.34;
const BUBBLE_POP = 0.36;
/** One idle gesture (wave / head-tilt) lasts this long. */
const GESTURE_DUR = 0.75;

type Phase = "hidden" | "entering" | "idle" | "exiting";

export interface GuideOverlayOptions {
  reducedMotion: boolean;
}

export class GuideOverlay {
  readonly container = new Container();

  private backdrop = new Graphics();
  /** Wraps the guide sprite so animation transforms pivot on its feet. */
  private guideNode = new Container();
  private sprite: Sprite | null = null;
  private bubble = new Container();
  private ui = new Container();

  private entry: GuideEntry | null = null;
  private tex: Texture | undefined;

  // ── Dialogue player state (Session 3 content pipeline) ──
  /** Line currently in the bubble; null = name-only card (no authored content). */
  private line: DialogueLine | null = null;
  /** Resolves a line id to the next line (the content loader's lookup). */
  private resolveLine: (id: DialogueLineId) => DialogueLine | null = () => null;
  /** Screen-space hit rects, rebuilt with the bubble/UI. */
  private choiceHits: { x: number; y: number; w: number; h: number; goto: DialogueLineId }[] = [];
  private enterHit: { x: number; y: number; w: number; h: number } | null = null;
  private backHit: { x: number; y: number; w: number; h: number } | null = null;
  private closeHit: { x: number; y: number; w: number; h: number } | null = null;

  private w = 0;
  private h = 0;
  private baseScale = 1;
  private restX = 0;
  private restY = 0;
  /** How far below its rest position the guide starts / exits to. */
  private slide = 0;

  private phase: Phase = "hidden";
  private ageIn = 0;
  private ageOut = 0;
  private elapsed = 0;

  // Occasional idle gesture (alternating wave / head-tilt).
  private nextGestureAt = 3.2;
  private gesturing = false;
  private gestureStart = 0;
  private gestureKind: 0 | 1 = 0;

  /** Fired once the exit animation has fully played out. */
  onExitDone?: () => void;

  constructor(private opts: GuideOverlayOptions) {
    this.container.addChild(this.backdrop, this.guideNode, this.bubble, this.ui);
    this.container.visible = false;
    // Taps are hit-tested by SceneRenderer against the whole overlay, so the
    // container itself stays non-interactive (no per-child event wiring).
    this.container.eventMode = "none";
  }

  get active(): boolean {
    return this.phase !== "hidden";
  }

  /** Zone of the guide currently on screen (null when hidden). */
  get activeZone(): GuideEntry["zone"] | null {
    return this.phase !== "hidden" ? this.entry?.zone ?? null : null;
  }

  /** True once the guide has finished entering (accepts a close tap). */
  private get dismissable(): boolean {
    return this.phase === "idle" || (this.phase === "entering" && this.ageIn > 0.18);
  }

  /**
   * Show `entry`'s guide (with its preloaded, knocked-out texture) at size w×h.
   * `start` is the dialogue line to open on (usually the zone greeting) and
   * `resolveLine` the loader lookup used to follow next/goto references; a
   * null start shows a name-only card.
   */
  show(
    entry: GuideEntry,
    tex: Texture | undefined,
    w: number,
    h: number,
    start: DialogueLine | null = null,
    resolveLine: (id: DialogueLineId) => DialogueLine | null = () => null,
  ): void {
    this.entry = entry;
    this.tex = tex;
    this.line = start;
    this.resolveLine = resolveLine;
    this.phase = "entering";
    this.ageIn = 0;
    this.ageOut = 0;
    this.elapsed = 0;
    this.nextGestureAt = 3.2;
    this.gesturing = false;
    this.container.visible = true;
    this.build(w, h);
    // Reduced motion: no slide/bounce — the guide is simply present.
    if (this.opts.reducedMotion) {
      this.ageIn = DUR_IN;
      this.phase = "idle";
    }
    this.frame();
  }

  /** Begin the slide-out; fires onExitDone when it completes. No-op if already
   *  leaving or hidden. */
  beginExit(): void {
    if (this.phase === "exiting" || this.phase === "hidden") return;
    this.phase = "exiting";
    this.ageOut = 0;
    if (this.opts.reducedMotion) this.finishExit();
  }

  /** Immediately tear the overlay down (no animation). */
  hide(): void {
    this.phase = "hidden";
    this.container.visible = false;
  }

  resize(w: number, h: number): void {
    if (this.phase === "hidden") return;
    this.build(w, h);
    this.frame();
  }

  /**
   * Resolve a tap while the overlay is up.
   *  - "Go Inside" pill → "enter" (the renderer fires onZoneTap → Mode 2)
   *  - ✕ / "Back to Island" → "close"
   *  - a choice pill → follow its goto, stay open
   *  - anywhere else (kid-friendly): advance to the line's `next`, or close
   *    when the dialogue is done; while choices are up, a stray tap does
   *    nothing so the child actually picks.
   */
  handleTap(sx: number, sy: number): "close" | "enter" | "none" {
    if (!this.dismissable) return "none";
    const inRect = (r: { x: number; y: number; w: number; h: number } | null): boolean =>
      !!r && sx >= r.x && sx <= r.x + r.w && sy >= r.y && sy <= r.y + r.h;

    if (inRect(this.enterHit)) return "enter";
    if (inRect(this.closeHit) || inRect(this.backHit)) return "close";
    for (const c of this.choiceHits) {
      if (inRect(c)) {
        this.advanceTo(c.goto);
        return "none";
      }
    }
    if (this.line?.choices?.length) return "none"; // must pick (or hit ✕/back)
    const next = this.line?.next?.[0];
    if (next) {
      this.advanceTo(next);
      return "none";
    }
    return "close";
  }

  /** Follow a dialogue reference; an unresolvable id ends the dialogue
   *  gracefully (the loader already warned about it in dev). */
  private advanceTo(id: DialogueLineId): void {
    const line = this.resolveLine(id);
    if (!line) {
      this.beginExit();
      return;
    }
    this.line = line;
    this.buildBubble();
    this.frame();
  }

  // ── Build ─────────────────────────────────────────────────────────

  private build(w: number, h: number): void {
    this.w = w;
    this.h = h;

    // Dimmed, slightly warm backdrop so the guide reads as a focused moment.
    this.backdrop.clear();
    this.backdrop.rect(0, 0, w, h).fill({ color: 0x1a1206, alpha: 0.5 });

    this.buildGuide();
    this.buildBubble();
    this.buildUI();
  }

  private buildGuide(): void {
    this.guideNode.removeChildren().forEach((c) => c.destroy());
    this.sprite = null;

    // Prominent: the guide fills ~52% of the screen height (clamped by width so
    // it stays whole on wide/narrow screens), anchored by its feet near the
    // bottom center of the screen.
    const targetH = Math.min(this.h * 0.52, this.w * 0.72);
    this.restX = this.w * 0.5;
    this.restY = this.h * 0.985;
    this.slide = this.h * 0.55;

    if (this.tex) {
      const spr = new Sprite(this.tex);
      spr.anchor.set(0.5, 1); // feet at the node origin
      this.baseScale = targetH / (this.tex.height || targetH);
      this.sprite = spr;
      this.guideNode.addChild(spr);
    } else {
      // Texture failed to load — a soft placeholder disc so the moment still
      // reads rather than showing nothing at all.
      const g = new Graphics();
      const r = targetH * 0.42;
      g.circle(0, -r, r).fill({ color: 0xd9c39a }).stroke({ width: 5, color: INK });
      this.baseScale = 1;
      this.guideNode.addChild(g);
    }
    this.guideNode.position.set(this.restX, this.restY);
  }

  private buildBubble(): void {
    this.bubble.removeChildren().forEach((c) => c.destroy());
    this.choiceHits = [];
    const entry = this.entry;
    if (!entry) return;

    const maxPanelW = Math.min(this.w * 0.86, 520);
    const padX = 26;
    const padY = 20;
    const innerW = maxPanelW - padX * 2;

    const name = new Text({
      text: entry.name,
      style: {
        fontFamily: '"Trebuchet MS", "Segoe UI", system-ui, sans-serif',
        fontSize: 26,
        fontWeight: "900",
        fill: 0xb5651d, // warm nameplate brown
        stroke: { color: 0xffffff, width: 3 },
      },
    });
    name.anchor.set(0.5, 0);

    const msg = new Text({
      // Dialogue comes from the content pipeline; a zone with no authored
      // line still shows a warm name-only card rather than an empty box.
      text: this.line?.text ?? "",
      style: {
        fontFamily: '"Trebuchet MS", "Segoe UI", system-ui, sans-serif',
        fontSize: 20,
        fontWeight: "700",
        fill: INK,
        align: "center",
        wordWrap: true,
        wordWrapWidth: innerW,
        lineHeight: 26,
      },
    });
    msg.anchor.set(0.5, 0);

    // Choice pills (dialogue branches) stack under the message.
    const choices = this.line?.choices ?? [];
    const choiceTexts = choices.map(
      (c) =>
        new Text({
          text: c.label,
          style: {
            fontFamily: '"Trebuchet MS", "Segoe UI", system-ui, sans-serif',
            fontSize: 18,
            fontWeight: "800",
            fill: INK,
          },
        }),
    );
    const choiceH = 44;
    const choiceGap = 10;
    const choicesBlockH = choices.length
      ? choices.length * choiceH + (choices.length - 1) * choiceGap + 14
      : 0;

    const gap = 10;
    const contentW = Math.max(
      name.width,
      msg.width,
      ...choiceTexts.map((t) => t.width + 44),
    );
    const panelW = Math.min(maxPanelW, contentW + padX * 2);
    const panelH = padY * 2 + name.height + gap + msg.height + choicesBlockH;

    const panel = new Graphics();
    // Rounded, warm, storybook panel with a bold ink outline + a soft inner
    // highlight band across the top so it feels painted rather than flat.
    panel
      .roundRect(-panelW / 2, -panelH / 2, panelW, panelH, 24)
      .fill({ color: BUBBLE_FILL })
      .stroke({ width: 5, color: INK });
    panel
      .roundRect(-panelW / 2 + 5, -panelH / 2 + 5, panelW - 10, panelH * 0.4, 20)
      .fill({ color: 0xffffff, alpha: 0.35 });
    // Tail pointing down toward the guide below.
    const tailY = panelH / 2;
    panel
      .poly([-18, tailY - 4, 18, tailY - 4, 0, tailY + 26])
      .fill({ color: BUBBLE_FILL })
      .stroke({ width: 5, color: INK });
    // Redraw a short segment of the panel edge over the tail's top so the seam
    // reads as one continuous outline.
    panel.moveTo(-18, tailY - 2).lineTo(18, tailY - 2).stroke({ width: 5, color: BUBBLE_FILL });

    name.position.set(0, -panelH / 2 + padY);
    msg.position.set(0, -panelH / 2 + padY + name.height + gap);

    this.bubble.addChild(panel, name, msg);

    // Sit the bubble in the upper region, its tail bridging down toward the
    // guide. Clamped so the panel top never leaves the screen.
    const cy = Math.max(panelH / 2 + 18, this.h * 0.24);
    this.bubble.position.set(this.w * 0.5, cy);

    // Choice pills — drawn inside the panel, hit rects recorded in SCREEN
    // coordinates (bubble position + local offset; rects are only consulted
    // once the pop-in has settled at scale 1).
    if (choices.length) {
      const bx = this.w * 0.5;
      let y = -panelH / 2 + padY + name.height + gap + msg.height + 14;
      choices.forEach((choice, i) => {
        const t = choiceTexts[i];
        t.anchor.set(0.5);
        const pw = Math.min(panelW - padX, t.width + 44);
        const pill = new Graphics();
        pill
          .roundRect(-pw / 2, y, pw, choiceH, 999)
          .fill({ color: 0xffffff, alpha: 0.95 })
          .stroke({ width: 3, color: INK });
        t.position.set(0, y + choiceH / 2);
        this.bubble.addChild(pill, t);
        this.choiceHits.push({
          x: bx - pw / 2,
          y: cy + y,
          w: pw,
          h: choiceH,
          goto: choice.goto,
        });
        y += choiceH + choiceGap;
      });
    } else {
      // No branches: a soft "tap to continue" cue when more lines follow.
      if (this.line?.next?.length) {
        const cue = new Text({
          text: "tap to continue…",
          style: {
            fontFamily: '"Trebuchet MS", "Segoe UI", system-ui, sans-serif',
            fontSize: 13,
            fontWeight: "700",
            fill: 0xb5651d,
          },
        });
        cue.anchor.set(1, 1);
        cue.position.set(panelW / 2 - 14, panelH / 2 - 8);
        this.bubble.addChild(cue);
      }
    }
  }

  private buildUI(): void {
    this.ui.removeChildren().forEach((c) => c.destroy());

    // ✕ close button, top-right (live hit target).
    const close = new Graphics();
    const cx = this.w - 38;
    const cyy = 38;
    close.circle(cx, cyy, 22).fill({ color: 0xffffff, alpha: 0.92 }).stroke({ width: 3, color: INK });
    close
      .moveTo(cx - 8, cyy - 8).lineTo(cx + 8, cyy + 8)
      .moveTo(cx + 8, cyy - 8).lineTo(cx - 8, cyy + 8)
      .stroke({ width: 4, color: INK });
    this.ui.addChild(close);
    this.closeHit = { x: cx - 26, y: cyy - 26, w: 52, h: 52 };

    // Bottom pills: "← Back to Island" and — the Mode-2 practice-space door —
    // "Go Inside →". Side by side on roomy screens; on narrow phones (< 400px)
    // they'd crowd/overlap, so stack them (Go Inside on top) centred instead.
    const pillAt = (
      text: string,
      bx: number,
      by: number,
    ): { x: number; y: number; w: number; h: number } => {
      const label = new Text({
        text,
        style: {
          fontFamily: '"Trebuchet MS", "Segoe UI", system-ui, sans-serif',
          fontSize: 16,
          fontWeight: "800",
          fill: INK,
        },
      });
      label.anchor.set(0.5);
      const pw = label.width + 40;
      const ph = 44;
      const pill = new Graphics();
      pill
        .roundRect(bx - pw / 2, by - ph / 2, pw, ph, 999)
        .fill({ color: 0xffffff, alpha: 0.95 })
        .stroke({ width: 3, color: INK });
      label.position.set(bx, by);
      this.ui.addChild(pill, label);
      return { x: bx - pw / 2, y: by - ph / 2, w: pw, h: ph };
    };
    if (this.w < 400) {
      const cx = this.w * 0.5;
      this.enterHit = pillAt("Go Inside →", cx, this.h - 84);
      this.backHit = pillAt("← Back to Island", cx, this.h - 32);
    } else {
      this.backHit = pillAt("← Back to Island", this.w * 0.5 - 105, this.h - 34);
      this.enterHit = pillAt("Go Inside →", this.w * 0.5 + 105, this.h - 34);
    }
  }

  // ── Per-frame ─────────────────────────────────────────────────────

  update(dt: number): void {
    if (this.phase === "hidden") return;
    this.elapsed += dt;

    if (this.phase === "entering") {
      this.ageIn += dt;
      if (this.ageIn >= DUR_IN) this.phase = "idle";
    } else if (this.phase === "exiting") {
      this.ageOut += dt;
      if (this.ageOut >= DUR_OUT) {
        this.finishExit();
        return;
      }
    }
    this.frame();
  }

  private finishExit(): void {
    this.phase = "hidden";
    this.container.visible = false;
    this.onExitDone?.();
  }

  /** Apply the current transform for guide + bubble for this frame. */
  private frame(): void {
    const reduced = this.opts.reducedMotion;

    if (this.phase === "exiting") {
      const p = smoothstep(this.ageOut / DUR_OUT);
      this.guideNode.position.set(this.restX, this.restY + p * this.slide);
      this.guideNode.scale.set(this.baseScale * (1 - 0.12 * p));
      this.guideNode.rotation = 0;
      this.guideNode.alpha = 1 - p;
      this.backdrop.alpha = 1 - p;
      const bp = Math.min(1, this.ageOut / (DUR_OUT * 0.6));
      this.bubble.alpha = 1 - bp;
      this.ui.alpha = 1 - p;
      return;
    }

    this.backdrop.alpha = 1;
    this.ui.alpha = 1;

    if (this.phase === "entering" && !reduced) {
      const t = clamp01(this.ageIn / DUR_IN);
      const p = easeOutBack(t);
      // Rise from below with a soft overshoot; fade + scale up together.
      this.guideNode.position.set(this.restX, this.restY + (1 - p) * this.slide);
      this.guideNode.scale.set(this.baseScale * (0.7 + 0.3 * p));
      this.guideNode.rotation = 0;
      this.guideNode.alpha = clamp01(this.ageIn / 0.28);

      // Bubble pops in a beat later.
      const bt = clamp01((this.ageIn - BUBBLE_DELAY) / BUBBLE_POP);
      this.bubble.alpha = bt;
      this.bubble.scale.set(0.7 + 0.3 * easeOutBack(bt));
      return;
    }

    // Idle (or reduced-motion resting state).
    this.bubble.alpha = 1;
    this.bubble.scale.set(1);
    this.guideNode.alpha = 1;

    if (reduced) {
      this.guideNode.position.set(this.restX, this.restY);
      this.guideNode.scale.set(this.baseScale);
      this.guideNode.rotation = 0;
      return;
    }

    // Gentle breathe (subtle vertical squash) + bob.
    const breathe = 1 + Math.sin(this.elapsed * 2.0) * 0.02;
    const bob = Math.sin(this.elapsed * 1.7) * 5;
    this.guideNode.position.set(this.restX, this.restY + bob);
    this.guideNode.scale.set(this.baseScale, this.baseScale * breathe);

    // Occasional gesture: alternate a little wave-wobble and a head-tilt lean.
    this.guideNode.rotation = this.gestureRotation();
  }

  /**
   * Idle-gesture rotation (radians), driven off `elapsed` so it needs no extra
   * dt. When idle it waits until `nextGestureAt`, plays one gesture over
   * GESTURE_DUR, then schedules the next (alternating wave ↔ head-tilt).
   */
  private gestureRotation(): number {
    if (!this.gesturing) {
      if (this.elapsed >= this.nextGestureAt) {
        this.gesturing = true;
        this.gestureStart = this.elapsed;
      }
      return 0;
    }
    const g = (this.elapsed - this.gestureStart) / GESTURE_DUR;
    if (g >= 1) {
      this.gesturing = false;
      this.gestureKind = this.gestureKind === 0 ? 1 : 0;
      this.nextGestureAt = this.elapsed + 4 + (this.gestureKind === 0 ? 1.5 : 3.0);
      return 0;
    }
    return this.gestureKind === 0
      ? Math.sin(g * Math.PI * 3) * 0.12 * (1 - g) // wave: decaying wobble
      : Math.sin(g * Math.PI) * 0.1; // head-tilt: a soft lean and back
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function smoothstep(t: number): number {
  const x = clamp01(t);
  return x * x * (3 - 2 * x);
}

/** easeOutBack — settles past 1 then back, for a bouncy entrance. */
function easeOutBack(t: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  const x = t - 1;
  return 1 + c3 * x * x * x + c1 * x * x;
}
