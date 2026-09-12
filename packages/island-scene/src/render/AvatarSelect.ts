import {
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
import { headerType, pickerLayout, type CardRect, type PickerLayout } from "./avatarPickerLayout";

/**
 * "Choose Your Island Friend" — the first screen a child sees, before the boat
 * arrival.
 *
 * Six core friends, each on a large card: the character art dominates, the
 * kid-facing name sits under it, and three one-word traits read as small
 * badges. Tapping a card selects it (warm honey frame + a soft glow, not a
 * flashy one) and reveals a single Continue button.
 *
 * This replaced a 4x4 wall of 16 animals that drag-scrolled on anything below a
 * laptop. The arrangement now comes from `pickerLayout`, which picks the column
 * count per viewport, so six across on desktop and 3x2 on a portrait tablet are
 * the same code path rather than special cases. Scrolling survives only for
 * phones, where six large cards genuinely cannot fit at once.
 *
 * Screen-space and self-contained: it owns its pointer handling on its own root
 * container, so it never fights the world map's camera input.
 */

const INK = 0x23201c;
const HONEY = 0xe8a33d;
const CARD_BG = 0xfffaf0;
const CARD_EDGE = 0xd8c3a0;
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
}

export class AvatarSelect {
  readonly container = new Container();

  private bg = new Graphics();
  private title = new Text({ text: "" });
  private subtitle = new Text({ text: "" });
  private hint = new Text({ text: "" });

  /** Clipped viewport for the cards (only scrolls on phones). */
  private viewport = new Container();
  private scroll = new Container();
  private viewportMask = new Graphics();

  private goButton = new Container();
  private goBg = new Graphics();
  private goLabel = new Text({ text: "" });

  private tiles: Tile[] = [];
  private textures: Map<string, Texture>;
  private reducedMotion: boolean;

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
    this.container.eventMode = "static";
    this.viewport.addChild(this.scroll);
    this.viewport.mask = this.viewportMask;
    this.goButton.addChild(this.goBg, this.goLabel);
    this.goButton.eventMode = "static";
    this.goButton.cursor = "pointer";
    this.goButton.visible = false;
    this.container.addChild(
      this.bg,
      this.viewportMask,
      this.viewport,
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
    // Warm sky-to-sand wash, banded (robust across Pixi minor versions).
    const bands = 28;
    for (let i = 0; i < bands; i++) {
      const tt = i / (bands - 1);
      this.bg.rect(0, (h * i) / bands, w, h / bands + 1).fill(lerp(0xdcf0f6, 0xf7d9a6, tt));
    }
    // Sun glow from the top, then a soft vignette so it reads painted.
    for (let i = 0; i < 4; i++) {
      this.bg
        .ellipse(w * 0.5, h * 0.08, w * (0.58 - i * 0.1), h * (0.3 - i * 0.05))
        .fill({ color: 0xfff3cf, alpha: 0.12 });
    }
    const vig = Math.max(w, h);
    this.bg.ellipse(w / 2, h / 2, vig * 0.72, vig * 0.72).fill({ color: 0xffcd85, alpha: 0.05 });
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
      dropShadow: { color: 0x000000, alpha: 0.25, blur: 5, distance: 3, angle: Math.PI / 2 },
    };
    this.title.anchor.set(0.5, 0);
    this.title.position.set(w / 2, L.titleY);

    this.subtitle.text = "Pick a friend to explore the island with!";
    this.subtitle.style = {
      fontFamily: FONT,
      fontSize: subSize,
      fontWeight: "800",
      fill: 0x2c5468,
      align: "center",
    };
    this.subtitle.anchor.set(0.5, 0);
    this.subtitle.position.set(w / 2, this.title.position.y + this.title.height + (narrow ? 4 : 8));

    this.hint.text = "You can always change later.";
    this.hint.style = {
      fontFamily: FONT,
      fontSize: hintSize,
      fontWeight: "600",
      fill: 0x5a7b88,
      align: "center",
    };
    this.hint.anchor.set(0.5, 0);
    this.hint.position.set(w / 2, this.subtitle.position.y + this.subtitle.height + 2);
  }

  // ── Cards ─────────────────────────────────────────────────────────
  private buildCards(): void {
    this.scroll.removeChildren().forEach((c) => c.destroy());
    this.tiles = [];
    const L = this.layoutInfo!;

    CORE_AVATARS.forEach((a, i) => {
      const rect = L.cards[i];
      if (rect) this.tiles.push(this.buildTile(a, rect, i));
    });

    // Centre vertically when everything fits; otherwise scroll from the top.
    this.scroll.y = L.scrolls
      ? L.viewport.y - this.scrollY
      : L.viewport.y + (L.viewport.h - L.contentH) / 2;

    this.viewportMask.clear();
    this.viewportMask
      .rect(L.viewport.x, L.viewport.y, L.viewport.w, L.viewport.h)
      .fill(0xffffff);
  }

  private buildTile(a: AvatarOption, rect: CardRect, index: number): Tile {
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

    const { w: cw, h: ch } = rect;
    // The art gets the top ~62% of the card and is sized by its CONTENT box,
    // not its canvas, so the six characters read at the same height despite
    // shipping on different canvases (Daisy and Remy are much smaller files).
    const artTop = ch * 0.06;
    const artH = ch * 0.56;
    const tex = this.textures.get(avatarFileUrl(a.file));
    if (tex) {
      const b = getContentBounds(tex);
      const contentW = (b?.contentW ?? 1) * tex.width;
      const contentH = (b?.contentH ?? 1) * tex.height;
      const s = Math.min((cw * 0.8) / contentW, artH / contentH);
      const spr = new Sprite(tex);
      // Anchor on the content box's centre/feet so every character stands on
      // the same baseline inside its card regardless of its baked margin.
      spr.anchor.set(b?.centerX ?? 0.5, b?.feetY ?? 1);
      spr.scale.set(s);
      spr.position.set(cw / 2, artTop + artH);
      inner.addChild(spr);
    }

    // Name + traits go in one block that is scaled to fit whatever height is
    // left under the art. Without this a two-line name ("Sunny the Bunny")
    // pushed the traits straight out through the bottom of the card.
    const textBlock = new Container();
    const textTop = artTop + artH + ch * 0.045;
    const textRoom = ch - textTop - ch * 0.05;

    const nameSize = clamp(cw / 9.2, 12, 21);
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
      const traitSize = clamp(cw / 15, 9, 14);
      const traits = new Text({
        text: a.traits.join(" · "),
        style: {
          fontFamily: FONT,
          fontSize: traitSize,
          fontWeight: "700",
          fill: 0x6b7f88,
          align: "center",
          wordWrap: true,
          wordWrapWidth: cw * 0.9,
          lineHeight: traitSize * 1.25,
        },
      });
      traits.anchor.set(0.5, 0);
      traits.position.set(0, label.height + ch * 0.022);
      textBlock.addChild(traits);
    }

    // Shrink (never grow) so the block always sits inside the card.
    const blockH = textBlock.height;
    if (blockH > textRoom && blockH > 0) textBlock.scale.set(textRoom / blockH);
    textBlock.position.set(cw / 2, textTop);
    inner.addChild(textBlock);

    root.addChild(card, inner);
    this.scroll.addChild(root);
    return tile;
  }

  /** Card frame for its current selected state — warm, not flashy. */
  private drawCard(tile: Tile): void {
    const { w: cw, h: ch } = tile.rect;
    const r = Math.min(22, cw * 0.14);
    const g = tile.card;
    g.clear();
    if (tile.selected) {
      g.roundRect(-6, -6, cw + 12, ch + 12, r + 6).fill({ color: HONEY, alpha: 0.28 });
    }
    g.roundRect(0, 0, cw, ch, r)
      .fill({ color: CARD_BG, alpha: 0.97 })
      .stroke({ width: tile.selected ? 5 : 3, color: tile.selected ? HONEY : CARD_EDGE });
    if (tile.selected) {
      // A soft inner warmth rather than a hard highlight.
      g.roundRect(4, 4, cw - 8, ch * 0.3, r).fill({ color: 0xffe9c2, alpha: 0.5 });
    }
  }

  private layoutGoButton(): void {
    const L = this.layoutInfo!;
    const { w: bw, h: bh } = L.continueRect;
    this.goBg.clear();
    this.goBg
      .roundRect(-bw / 2, -bh / 2, bw, bh, bh / 2)
      .fill(0x4e9a4a)
      .stroke({ width: 4, color: 0x2e6b2c });

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
    this.goButton.position.set(
      L.continueRect.x + bw / 2,
      L.continueRect.y + bh / 2,
    );
    this.goButton.hitArea = new Rectangle(-bw / 2, -bh / 2, bw, bh);
  }

  // ── Selection ─────────────────────────────────────────────────────
  private select(key: string): void {
    if (this.selectedKey === key) return;
    this.selectedKey = key;
    for (const tile of this.tiles) {
      const next = tile.key === key;
      if (next !== tile.selected) {
        tile.selected = next;
        this.drawCard(tile);
      }
    }
    this.goButton.visible = true;
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
    if (this.goButton.visible) {
      this.goButton.scale.set(1 + Math.sin(this.t * 2.6) * 0.025);
    }
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}

const clamp = (v: number, lo: number, hi: number): number =>
  Math.max(lo, Math.min(hi, v));

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
