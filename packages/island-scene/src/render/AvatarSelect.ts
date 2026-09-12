import {
  BlurFilter,
  Container,
  type FederatedPointerEvent,
  Graphics,
  Rectangle,
  Sprite,
  Text,
  type Texture,
} from "pixi.js";
import { CORE_AVATARS, avatarFileUrl, type AvatarOption } from "./avatarCatalog";
import { getContentBounds } from "./avatarTexture";
import {
  headerType,
  pickerLayout,
  type CardRect,
  type PickerLayout,
} from "./avatarPickerLayout";

/**
 * "Choose Your Island Friend" — the first screen a child sees, before the boat
 * arrival.
 *
 * Six core friends, each on a large card: the character art dominates, the
 * kid-facing name sits under it, and three one-word traits read as small
 * badges. Tapping a card selects it (warm honey frame, a soft glow and a tick,
 * not a flashy one) and lights up the Continue button.
 *
 * This replaced a 4x4 wall of 16 animals that drag-scrolled on anything below a
 * laptop. The arrangement now comes from `pickerLayout`, which picks the column
 * count per viewport, so six across on desktop and 3x2 on a portrait tablet are
 * the same code path rather than special cases. Scrolling survives only for
 * phones, where six large cards genuinely cannot fit at once; there a honey
 * "More friends" pill and a soft fade tell a five-year-old there is more below,
 * instead of a scrollbar they will not read.
 *
 * BACKGROUND. The screen is staged on the island's own painted arrival shore
 * (`arrival-bg`, the same landscape the boat cinematic sails across), softly
 * blurred behind a warm scrim so the cards keep their contrast. It is a real
 * art asset, already preloaded for the cinematic, so it costs nothing extra and
 * the picker now dissolves straight into the scene it introduces. The banded
 * code gradient survives only as the no-texture fallback.
 *
 * Screen-space and self-contained: it owns its pointer handling on its own root
 * container, so it never fights the world map's camera input.
 */

const INK = 0x23201c;
const HONEY = 0xe8a33d;
const CARD_BG = 0xfffaf0;
const CARD_EDGE = 0xd8c3a0;
const GO_GREEN = 0x4e9a4a;
const GO_GREEN_EDGE = 0x2e6b2c;
/** The same green, desaturated: the button is present from the first frame so
 *  nothing jumps when a card is picked, but it reads as "not yet". */
const GO_GREEN_IDLE = 0x93b08c;
const GO_GREEN_IDLE_EDGE = 0x6f8e69;
const FONT = '"Trebuchet MS", "Segoe UI", system-ui, sans-serif';

interface Tile {
  key: string;
  /** Card wrapper, positioned in scroll-local px. */
  root: Container;
  /** Inner content that breathes, so the frame itself stays put. */
  inner: Container;
  card: Graphics;
  rect: CardRect;
  phase: number;
  selected: boolean;
}

export interface AvatarSelectOptions {
  /** Honours prefers-reduced-motion: no breathing, no pulse. */
  reducedMotion?: boolean;
  /** The painted island backdrop (arrival-bg). Absent → banded fallback. */
  bgTex?: Texture;
}

export class AvatarSelect {
  readonly container = new Container();

  /** Painted backdrop (blurred), with `bg` carrying the readability scrim. */
  private bgArt = new Sprite();
  private bg = new Graphics();
  private title = new Text({ text: "" });
  private subtitle = new Text({ text: "" });
  private hint = new Text({ text: "" });

  /** Clipped viewport for the cards (only scrolls on phones). */
  private viewport = new Container();
  private scroll = new Container();
  private viewportMask = new Graphics();

  /** "There is more below" affordance — phones only. */
  private scrollFade = new Graphics();
  private scrollCue = new Container();
  private cueBg = new Graphics();
  private cueLabel = new Text({ text: "" });
  private cueBaseY = 0;

  private goButton = new Container();
  private goBg = new Graphics();
  private goLabel = new Text({ text: "" });

  private tiles: Tile[] = [];
  private textures: Map<string, Texture>;
  private reducedMotion: boolean;
  private bgTex?: Texture;

  private w = 0;
  private h = 0;
  private t = 0;
  private layoutInfo: PickerLayout | null = null;

  private selectedKey: string | null = null;

  private scrollY = 0;
  private pointerDown = false;
  private dragging = false;
  private downX = 0;
  private downY = 0;
  private lastY = 0;

  constructor(
    /** Preloaded avatar textures, keyed by their served URL (avatarFileUrl). */
    textures: Map<string, Texture>,
    private onConfirm: (avatarKey: string) => void,
    opts: AvatarSelectOptions = {},
  ) {
    this.textures = textures;
    this.reducedMotion = !!opts.reducedMotion;
    this.bgTex = opts.bgTex;
    this.container.eventMode = "static";
    this.viewport.addChild(this.scroll);
    this.viewport.mask = this.viewportMask;
    this.scrollCue.addChild(this.cueBg, this.cueLabel);
    this.scrollCue.visible = false;
    this.goButton.addChild(this.goBg, this.goLabel);
    this.goButton.eventMode = "static";
    this.container.addChild(
      this.bgArt,
      this.bg,
      this.viewportMask,
      this.viewport,
      this.scrollFade,
      this.scrollCue,
      this.title,
      this.subtitle,
      this.hint,
      this.goButton,
    );

    this.container.on("pointerdown", this.onPointerDown);
    this.container.on("pointermove", this.onPointerMove);
    this.container.on("pointerup", this.onPointerUp);
    this.container.on("pointerupoutside", this.onPointerUp);
    this.goButton.on("pointertap", () => this.confirm());
  }

  /** Build (or rebuild) the screen at the given size. */
  layout(w: number, h: number): void {
    this.w = w;
    this.h = h;
    this.container.hitArea = new Rectangle(0, 0, w, h);
    this.layoutInfo = pickerLayout(
      CORE_AVATARS.map((a) => a.key),
      w,
      h,
    );

    this.drawBackground();
    this.layoutHeader();
    this.buildCards();
    this.layoutScrollCue();
    this.layoutGoButton();
    this.clampScroll();
  }

  resize(w: number, h: number): void {
    if (!this.container.visible) return;
    this.layout(w, h);
  }

  // ── Background ────────────────────────────────────────────────────
  private drawBackground(): void {
    const { w, h } = this;
    this.bg.clear();
    const tex = this.bgTex;

    if (tex) {
      // Cover-fit with a little overscan, so the blur cannot drag a soft edge
      // in from outside the painting.
      const zoom = 1.06;
      const s = Math.max(w / tex.width, h / tex.height) * zoom;
      this.bgArt.texture = tex;
      this.bgArt.anchor.set(0.5);
      this.bgArt.scale.set(s);
      this.bgArt.position.set(w / 2, h / 2);
      this.bgArt.visible = true;
      try {
        // Gentle: the shore stays legible as a place, it just stops competing
        // with six characters for the eye.
        this.bgArt.filters = [new BlurFilter({ strength: clamp(w * 0.0025, 1.5, 4.5) })];
      } catch {
        this.bgArt.filters = [];
      }
      // Warm haze over the whole painting, then a cool band under the title and
      // a warm one under the button so both sit on something.
      this.bg.rect(0, 0, w, h).fill({ color: 0xfff1d8, alpha: 0.12 });
      const bands = 10;
      const topH = h * 0.28;
      for (let i = 0; i < bands; i++) {
        const tt = i / (bands - 1);
        this.bg
          .rect(0, (topH * i) / bands, w, topH / bands + 1)
          .fill({ color: 0x1b4152, alpha: 0.2 * (1 - tt) });
      }
      const botH = h * 0.3;
      for (let i = 0; i < bands; i++) {
        const tt = i / (bands - 1);
        this.bg
          .rect(0, h - botH + (botH * i) / bands, w, botH / bands + 1)
          .fill({ color: 0x8a5a22, alpha: 0.13 * tt });
      }
    } else {
      // No painting available — the original banded wash, unchanged.
      this.bgArt.visible = false;
      this.bgArt.filters = [];
      const bands = 28;
      for (let i = 0; i < bands; i++) {
        const tt = i / (bands - 1);
        this.bg.rect(0, (h * i) / bands, w, h / bands + 1).fill(lerp(0xdcf0f6, 0xf7d9a6, tt));
      }
      for (let i = 0; i < 4; i++) {
        this.bg
          .ellipse(w * 0.5, h * 0.08, w * (0.58 - i * 0.1), h * (0.3 - i * 0.05))
          .fill({ color: 0xfff3cf, alpha: 0.12 });
      }
      const vig = Math.max(w, h);
      this.bg.ellipse(w / 2, h / 2, vig * 0.72, vig * 0.72).fill({ color: 0xffcd85, alpha: 0.05 });
    }
  }

  // ── Title + helper copy ───────────────────────────────────────────
  private layoutHeader(): void {
    const { w, h } = this;
    const L = this.layoutInfo!;
    const narrow = w < 560;
    // Sizes come from the layout module so the space it reserved at the top is
    // exactly the space this text occupies.
    const { titleSize, subSize, hintSize } = headerType(w, h);

    this.title.text = "Choose Your Island Friend";
    this.title.style = {
      fontFamily: FONT,
      fontSize: titleSize,
      fontWeight: "900",
      fill: 0xfff8e8,
      stroke: { color: 0x1e4a63, width: Math.max(4, titleSize * 0.13) },
      align: "center",
      dropShadow: { color: 0x000000, alpha: 0.3, blur: 6, distance: 3, angle: Math.PI / 2 },
    };
    this.title.anchor.set(0.5, 0);
    fitWidth(this.title, w - 32);
    this.title.position.set(w / 2, L.titleY);

    this.subtitle.text = "Pick a friend to explore the island with!";
    this.subtitle.style = {
      fontFamily: FONT,
      fontSize: subSize,
      fontWeight: "800",
      fill: 0xf3f9fb,
      align: "center",
      dropShadow: { color: 0x123a4a, alpha: 0.4, blur: 4, distance: 2, angle: Math.PI / 2 },
    };
    this.subtitle.anchor.set(0.5, 0);
    fitWidth(this.subtitle, w - 32);
    this.subtitle.position.set(w / 2, this.title.position.y + this.title.height + (narrow ? 4 : 8));

    this.hint.text = "You can always change later.";
    this.hint.style = {
      fontFamily: FONT,
      fontSize: hintSize,
      fontWeight: "600",
      fill: 0xdfeaef,
      align: "center",
      dropShadow: { color: 0x123a4a, alpha: 0.35, blur: 4, distance: 2, angle: Math.PI / 2 },
    };
    this.hint.anchor.set(0.5, 0);
    fitWidth(this.hint, w - 32);
    this.hint.position.set(w / 2, this.subtitle.position.y + this.subtitle.height + 2);
  }

  // ── Cards ─────────────────────────────────────────────────────────
  private buildCards(): void {
    this.scroll.removeChildren().forEach((c) => c.destroy());
    this.tiles = [];
    const L = this.layoutInfo!;
    const { cardW: cw, cardH: ch } = L;

    // Every card shares ONE art band, sized against the TALLEST name+traits
    // block of the six. Sizing each card's art against its own text would leave
    // the six characters at different heights (a one-line "Matt the Cat" would
    // get a taller band than "Remy the Red Panda"); a fixed fraction instead
    // left a visible hole between short names and the art above them.
    const blocks = CORE_AVATARS.map((a) => this.makeTextBlock(a, cw, ch));
    const artTop = ch * 0.05;
    const textGap = ch * 0.035;
    const textBottom = ch - ch * 0.05;
    const tallest = Math.min(
      blocks.reduce((m, b) => Math.max(m, b.height), 0),
      ch * 0.34,
    );
    const artH = clamp(textBottom - textGap - tallest - artTop, ch * 0.45, ch * 0.74);

    CORE_AVATARS.forEach((a, i) => {
      const rect = L.cards[i];
      if (rect) this.tiles.push(this.buildTile(a, rect, i, blocks[i], artTop, artH, textBottom));
    });

    // The layout band is exactly the content height unless we scroll, so this
    // is a no-op offset in the common case and a scroll origin on a phone.
    this.scroll.y = L.scrolls
      ? L.viewport.y - this.scrollY
      : L.viewport.y + (L.viewport.h - L.contentH) / 2;

    this.viewportMask.clear();
    this.viewportMask
      .rect(L.viewport.x, L.viewport.y, L.viewport.w, L.viewport.h)
      .fill(0xffffff);
  }

  private buildTile(
    a: AvatarOption,
    rect: CardRect,
    index: number,
    textBlock: Container,
    artTop: number,
    artH: number,
    textBottom: number,
  ): Tile {
    const root = new Container();
    root.position.set(rect.x, rect.y);
    const card = new Graphics();
    const inner = new Container();

    const tile: Tile = {
      key: a.key,
      root,
      inner,
      card,
      rect,
      phase: index * 0.55,
      selected: false,
    };
    this.drawCard(tile);

    const { w: cw } = rect;
    // The art owns everything the text does not — it is the whole point of the
    // screen — and is sized by its CONTENT box, not its canvas, so the six
    // characters read at the same height despite shipping on different
    // canvases (Daisy and Remy are much smaller files).
    const tex = this.textures.get(avatarFileUrl(a.file));
    if (tex) {
      const b = getContentBounds(tex);
      const contentW = (b?.contentW ?? 1) * tex.width;
      const contentH = (b?.contentH ?? 1) * tex.height;
      const s = Math.min((cw * 0.86) / contentW, artH / contentH);
      // A soft contact shadow so the character stands on the card rather than
      // floating on it.
      const shadow = new Graphics();
      shadow
        .ellipse(cw / 2, artTop + artH, contentW * s * 0.34, Math.max(3, contentH * s * 0.035))
        .fill({ color: INK, alpha: 0.14 });
      inner.addChild(shadow);

      const spr = new Sprite(tex);
      // Anchor on the content box's centre/feet so every character stands on
      // the same baseline inside its card regardless of its baked margin.
      spr.anchor.set(b?.centerX ?? 0.5, b?.feetY ?? 1);
      spr.scale.set(s);
      spr.position.set(cw / 2, artTop + artH);
      inner.addChild(spr);
    }

    // Shrink (never grow) so the block always sits inside the card, then sit it
    // on the card's baseline rather than hanging it from the art. Names run one
    // line ("Matt the Cat") or two ("Remy the Red Panda"); hung from the top,
    // the trait rows landed at six different heights across the row.
    const textRoom = textBottom - (artTop + artH);
    const blockH = textBlock.height;
    const fit = blockH > textRoom && blockH > 0 ? textRoom / blockH : 1;
    textBlock.scale.set(fit);
    textBlock.position.set(cw / 2, textBottom - blockH * fit);
    inner.addChild(textBlock);

    root.addChild(card, inner);
    this.scroll.addChild(root);
    return tile;
  }

  /** The name + traits block for one friend, built but not yet placed. */
  private makeTextBlock(a: AvatarOption, cw: number, ch: number): Container {
    const textBlock = new Container();
    const nameSize = clamp(cw / 8.4, 13, 26);
    const label = new Text({
      text: a.name,
      style: {
        fontFamily: FONT,
        fontSize: nameSize,
        fontWeight: "900",
        fill: 0x1e4a63,
        align: "center",
        wordWrap: true,
        wordWrapWidth: cw * 0.92,
        lineHeight: nameSize * 1.15,
      },
    });
    label.anchor.set(0.5, 0);
    label.position.set(0, 0);
    textBlock.addChild(label);

    // Traits — small secondary copy, never competing with the art.
    if (a.traits) {
      const traitSize = clamp(cw / 15, 9.5, 15);
      const traits = new Text({
        text: a.traits.join(" · "),
        style: {
          fontFamily: FONT,
          fontSize: traitSize,
          fontWeight: "700",
          fill: 0x7a8b93,
          align: "center",
          wordWrap: true,
          wordWrapWidth: cw * 0.9,
          lineHeight: traitSize * 1.25,
        },
      });
      traits.anchor.set(0.5, 0);
      traits.position.set(0, label.height + ch * 0.018);
      textBlock.addChild(traits);
    }

    return textBlock;
  }

  /** Card frame for its current selected state — warm, not flashy. */
  private drawCard(tile: Tile): void {
    const { w: cw, h: ch } = tile.rect;
    const r = Math.min(26, cw * 0.13);
    const g = tile.card;
    g.clear();
    // Drop shadow first: over a painted backdrop the cards need to sit in
    // FRONT of the scene, not be pasted onto it.
    const drop = tile.selected ? 10 : 7;
    g.roundRect(1.5, drop, cw, ch, r).fill({ color: 0x2a1f12, alpha: tile.selected ? 0.2 : 0.16 });
    if (tile.selected) {
      g.roundRect(-7, -7, cw + 14, ch + 14, r + 7).fill({ color: HONEY, alpha: 0.3 });
    }
    g.roundRect(0, 0, cw, ch, r)
      .fill(CARD_BG)
      .stroke({ width: tile.selected ? 5 : 3, color: tile.selected ? HONEY : CARD_EDGE });
    if (tile.selected) {
      // A soft inner warmth rather than a hard highlight.
      g.roundRect(4, 4, cw - 8, ch * 0.3, r).fill({ color: 0xffe9c2, alpha: 0.55 });
      // …and a tick, which is what actually tells a five-year-old "this one".
      const br = Math.min(20, cw * 0.1);
      const bx = cw - br - 6;
      const by = br + 6;
      g.circle(bx, by, br).fill(HONEY).stroke({ width: 3, color: 0xfffaf0 });
      g.moveTo(bx - br * 0.4, by)
        .lineTo(bx - br * 0.08, by + br * 0.36)
        .lineTo(bx + br * 0.45, by - br * 0.35)
        .stroke({ width: Math.max(2.5, br * 0.22), color: 0xffffff, cap: "round", join: "round" });
    }
  }

  // ── "More friends below" (phones only) ────────────────────────────
  private layoutScrollCue(): void {
    const L = this.layoutInfo!;
    const { w } = this;
    this.scrollFade.clear();
    this.scrollCue.visible = L.scrolls;
    if (!L.scrolls) return;

    // A soft warm fade where the cards run off the bottom of the band, so the
    // last row reads as continuing rather than as being cut off.
    const fh = Math.min(72, L.viewport.h * 0.2);
    const steps = 12;
    for (let i = 0; i < steps; i++) {
      const tt = i / (steps - 1);
      this.scrollFade
        .rect(0, L.viewport.y + L.viewport.h - fh + (fh * i) / steps, w, fh / steps + 1)
        .fill({ color: 0xf6e3bd, alpha: 0.5 * tt * tt });
    }

    const ph = clamp(this.h * 0.042, 30, 40);
    this.cueLabel.text = "More friends  ↓";
    this.cueLabel.style = {
      fontFamily: FONT,
      fontSize: clamp(ph * 0.44, 13, 18),
      fontWeight: "900",
      fill: 0xfffaf0,
    };
    this.cueLabel.anchor.set(0.5);
    this.cueLabel.position.set(0, 0);
    const pw = Math.min(w - 32, this.cueLabel.width + ph * 1.2);
    this.cueBg.clear();
    this.cueBg.roundRect(-pw / 2, -ph / 2 + 3, pw, ph, ph / 2).fill({ color: 0x2a1f12, alpha: 0.18 });
    this.cueBg
      .roundRect(-pw / 2, -ph / 2, pw, ph, ph / 2)
      .fill(HONEY)
      .stroke({ width: 3, color: 0xfffaf0 });
    this.cueBaseY = L.viewport.y + L.viewport.h - ph / 2 - 6;
    this.scrollCue.position.set(w / 2, this.cueBaseY);
  }

  private layoutGoButton(): void {
    const L = this.layoutInfo!;
    const { w: bw, h: bh } = L.continueRect;
    const active = !!this.selectedKey;

    this.goBg.clear();
    if (active) {
      // The same honey that frames the chosen card, tying the button to the
      // selection instead of leaving it adrift below the roster.
      this.goBg
        .roundRect(-bw / 2 - 9, -bh / 2 - 9, bw + 18, bh + 18, (bh + 18) / 2)
        .fill({ color: HONEY, alpha: 0.26 });
    }
    this.goBg
      .roundRect(-bw / 2, -bh / 2 + 5, bw, bh, bh / 2)
      .fill({ color: 0x2a1f12, alpha: active ? 0.22 : 0.12 });
    this.goBg
      .roundRect(-bw / 2, -bh / 2, bw, bh, bh / 2)
      .fill(active ? GO_GREEN : GO_GREEN_IDLE)
      .stroke({ width: 4, color: active ? GO_GREEN_EDGE : GO_GREEN_IDLE_EDGE });

    const size = clamp(bh * 0.42, 20, 30);
    this.goLabel.text = "Continue  ›";
    this.goLabel.style = {
      fontFamily: FONT,
      fontSize: size,
      fontWeight: "900",
      fill: 0xffffff,
    };
    this.goLabel.anchor.set(0.5);
    this.goLabel.position.set(0, 0);
    this.goLabel.alpha = active ? 1 : 0.8;
    this.goButton.cursor = active ? "pointer" : "default";
    if (!active) this.goButton.scale.set(1);
    this.goButton.position.set(
      L.continueRect.x + bw / 2,
      L.continueRect.y + bh / 2,
    );
    this.goButton.hitArea = new Rectangle(-bw / 2, -bh / 2, bw, bh);
  }

  // ── Selection ─────────────────────────────────────────────────────
  private select(key: string): void {
    if (this.selectedKey === key) return;
    const first = this.selectedKey === null;
    this.selectedKey = key;
    for (const tile of this.tiles) {
      const next = tile.key === key;
      if (next !== tile.selected) {
        tile.selected = next;
        this.drawCard(tile);
      }
    }
    // The button is on screen from the first frame (so nothing shifts under a
    // child's finger); the first pick is what switches it on.
    if (first) this.layoutGoButton();
  }

  private confirm(): void {
    if (!this.selectedKey) return;
    this.onConfirm(this.selectedKey);
  }

  // ── Pointer: tap-to-select, drag-to-scroll (phones only) ──────────
  private onPointerDown = (e: FederatedPointerEvent): void => {
    this.pointerDown = true;
    this.dragging = false;
    this.downX = e.global.x;
    this.downY = this.lastY = e.global.y;
  };

  private onPointerMove = (e: FederatedPointerEvent): void => {
    if (!this.pointerDown || !this.layoutInfo) return;
    const dy = e.global.y - this.lastY;
    if (!this.dragging && Math.hypot(e.global.x - this.downX, e.global.y - this.downY) > 8) {
      this.dragging = true;
    }
    if (this.dragging && this.layoutInfo.scrolls) {
      this.lastY = e.global.y;
      this.scrollY -= dy;
      this.clampScroll();
    }
  };

  private onPointerUp = (e: FederatedPointerEvent): void => {
    const wasTap = this.pointerDown && !this.dragging;
    this.pointerDown = false;
    if (!wasTap || !this.layoutInfo) return;
    const vp = this.layoutInfo.viewport;
    // The Continue button handles its own pointertap; only cards here.
    if (e.global.y < vp.y || e.global.y > vp.y + vp.h) return;
    const hit = this.tileAt(e.global.x, e.global.y);
    if (hit) this.select(hit.key);
  };

  private tileAt(gx: number, gy: number): Tile | null {
    const y = gy - this.scroll.y;
    for (const tile of this.tiles) {
      const r = tile.rect;
      if (gx >= r.x && gx <= r.x + r.w && y >= r.y && y <= r.y + r.h) return tile;
    }
    return null;
  }

  private clampScroll(): void {
    const L = this.layoutInfo;
    if (!L) return;
    const max = Math.max(0, L.contentH - L.viewport.h);
    this.scrollY = Math.min(max, Math.max(0, this.scrollY));
    if (L.scrolls) this.scroll.y = L.viewport.y - this.scrollY;
    if (this.scrollCue.visible) {
      // Fade the cue (and its band) out as the last row comes into view — it
      // has said what it needed to say by then.
      const remaining = max - this.scrollY;
      const a = clamp(remaining / 48, 0, 1);
      this.scrollCue.alpha = a;
      this.scrollFade.alpha = a;
    }
  }

  // ── Idle animation ────────────────────────────────────────────────
  update(dt: number): void {
    if (!this.container.visible || this.reducedMotion) return;
    this.t += dt;
    for (const tile of this.tiles) {
      // A gentle breath, stronger on the chosen friend. Deliberately small —
      // the brief asks for warm, not flashy.
      const amp = tile.selected ? 1 : 0.55;
      tile.inner.position.y = Math.sin(this.t * 1.5 + tile.phase) * 2 * amp;
      tile.inner.scale.set(1 + Math.sin(this.t * 1.5 + tile.phase) * 0.012 * amp);
    }
    if (this.selectedKey) {
      this.goButton.scale.set(1 + Math.sin(this.t * 2.6) * 0.025);
    }
    if (this.scrollCue.visible) {
      this.scrollCue.y = this.cueBaseY + Math.sin(this.t * 2.4) * 3;
    }
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}

const clamp = (v: number, lo: number, hi: number): number =>
  Math.max(lo, Math.min(hi, v));

/** Shrink a single-line label until it fits `max`, never enlarging it. The
 *  title is sized from the viewport's shorter edge, which on a 390px phone
 *  still overflowed the width and ran off both sides. */
function fitWidth(t: Text, max: number): void {
  t.scale.set(1);
  if (max > 0 && t.width > max) t.scale.set(max / t.width);
}

/** Linear blend between two 0xRRGGBB colors. */
function lerp(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 0xff, ag = (a >> 8) & 0xff, ab = a & 0xff;
  const br = (b >> 16) & 0xff, bg = (b >> 8) & 0xff, bb = b & 0xff;
  return (
    (Math.round(ar + (br - ar) * t) << 16) |
    (Math.round(ag + (bg - ag) * t) << 8) |
    Math.round(ab + (bb - ab) * t)
  );
}
