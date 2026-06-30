import {
  Container,
  type FederatedPointerEvent,
  Graphics,
  Rectangle,
  Sprite,
  Text,
  type Texture,
} from "pixi.js";
import { AVATARS, avatarFileUrl } from "./avatarCatalog";

/**
 * Avatar selection screen (Phase 1: Avatar Creator) — the very first thing a
 * child sees, before the boat arrival cinematic. A warm full-screen overlay
 * with a 4×4 grid of the 16 illustrated animals. Each card gently breathes to
 * feel alive; tapping one highlights it with a golden ring; once a friend is
 * chosen a big "Let's Go!" button appears and confirms the choice (which kicks
 * off the arrival cinematic).
 *
 * Screen-space only and fully self-contained: it owns its own pointer handling
 * (tap-to-select + drag-to-scroll when the grid overflows on small screens) on
 * its root container, so it never fights the world map's camera input — which
 * is suppressed upstream until arrival completes anyway.
 */

const INK = 0x23201c;
const COLS = 4;
const GOLD = 0xffce4a;

interface Tile {
  key: string;
  /** Per-card wrapper inside the scroll layer (positioned in scroll-local px). */
  root: Container;
  /** Inner content that breathes (image + name), so the card frame stays put. */
  inner: Container;
  card: Graphics;
  ring: Graphics;
  /** Card size in scroll-local px (for redraws on selection change). */
  cw: number;
  ch: number;
  phase: number;
  selected: boolean;
}

export class AvatarSelect {
  readonly container = new Container();

  private bg = new Graphics();
  private title = new Text({ text: "" });
  private hint = new Text({ text: "" });

  /** Clipped viewport for the (possibly scrolling) grid. */
  private viewport = new Container();
  private scroll = new Container();
  private viewportMask = new Graphics();

  private goButton = new Container();
  private goBg = new Graphics();
  private goLabel = new Text({ text: "" });

  private tiles: Tile[] = [];
  private textures: Map<string, Texture>;

  private w = 0;
  private h = 0;
  private t = 0;

  private selectedKey: string | null = null;

  // Viewport geometry (screen px) + scroll state.
  private vpTop = 0;
  private vpHeight = 0;
  private contentH = 0;
  private scrollY = 0;

  // Pointer (tap vs drag-scroll) state.
  private pointerDown = false;
  private dragging = false;
  private downX = 0;
  private downY = 0;
  private lastY = 0;

  constructor(
    /** Preloaded avatar textures, keyed by their served URL (avatarFileUrl). */
    textures: Map<string, Texture>,
    private onConfirm: (avatarKey: string) => void,
  ) {
    this.textures = textures;
    this.container.eventMode = "static";
    this.container.sortableChildren = false;
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

    this.drawBackground();
    this.layoutTitle();
    this.buildGrid();
    this.layoutGoButton();
    this.clampScroll();
  }

  resize(w: number, h: number): void {
    if (!this.container.visible) return;
    this.layout(w, h);
  }

  // ── Background: warm painted, sun-bathed wash ─────────────────────
  private drawBackground(): void {
    const { w, h } = this;
    this.bg.clear();
    // Warm vertical gradient (sunrise cream → soft apricot), faked with bands.
    const bands = 28;
    for (let i = 0; i < bands; i++) {
      const tt = i / (bands - 1);
      const color = lerp(0xfff3d6, 0xf6b06a, tt);
      this.bg.rect(0, (h * i) / bands, w, h / bands + 1).fill(color);
    }
    // Soft golden glow from the top + a gentle vignette so it reads painted.
    for (let i = 0; i < 4; i++) {
      this.bg
        .ellipse(w * 0.5, h * 0.1, w * (0.55 - i * 0.09), h * (0.32 - i * 0.05))
        .fill({ color: 0xfff1c2, alpha: 0.1 });
    }
    const vig = Math.max(w, h);
    this.bg.ellipse(w / 2, h / 2, vig * 0.7, vig * 0.7).fill({ color: 0xffce7a, alpha: 0.04 });
  }

  private layoutTitle(): void {
    const { w, h } = this;
    const titleSize = Math.max(24, Math.min(46, w / 16));
    this.title.text = "Choose Your Island Friend!";
    this.title.style = {
      fontFamily: '"Trebuchet MS", "Segoe UI", system-ui, sans-serif',
      fontSize: titleSize,
      fontWeight: "900",
      fill: 0xffffff,
      stroke: { color: INK, width: Math.max(4, titleSize * 0.12) },
      align: "center",
      dropShadow: { color: 0x000000, alpha: 0.28, blur: 5, distance: 3, angle: Math.PI / 2 },
    };
    this.title.anchor.set(0.5, 0);
    this.title.position.set(w / 2, Math.max(14, h * 0.04));

    const hintSize = Math.max(13, Math.min(20, w / 40));
    this.hint.text = "Tap an animal to pick your buddy";
    this.hint.style = {
      fontFamily: '"Trebuchet MS", "Segoe UI", system-ui, sans-serif',
      fontSize: hintSize,
      fontWeight: "700",
      fill: 0x6b4a23,
      align: "center",
    };
    this.hint.anchor.set(0.5, 0);
    this.hint.position.set(w / 2, this.title.position.y + this.title.height + 6);
  }

  // ── Grid of animal cards ──────────────────────────────────────────
  private buildGrid(): void {
    // Clear any prior tiles (rebuild on resize).
    this.scroll.removeChildren().forEach((c) => c.destroy());
    this.tiles = [];

    const { w, h } = this;
    const topReserved = this.hint.position.y + this.hint.height + 12;
    const bottomReserved = Math.max(96, h * 0.16); // room for the Let's Go button
    this.vpTop = topReserved;
    this.vpHeight = Math.max(120, h - topReserved - bottomReserved);

    // Card sizing: fit COLS across with comfortable gutters, capped so cards
    // never get cartoonishly huge on wide screens.
    const sideMargin = Math.max(16, w * 0.05);
    const gutter = Math.max(10, w * 0.02);
    const gridW = Math.min(w - sideMargin * 2, 760);
    const cellW = (gridW - gutter * (COLS - 1)) / COLS;
    const cellH = cellW * 1.18; // a touch taller than wide (image + name)
    const gridLeft = (w - gridW) / 2;

    const rows = Math.ceil(AVATARS.length / COLS);
    AVATARS.forEach((a, i) => {
      const col = i % COLS;
      const row = Math.floor(i / COLS);
      const x = gridLeft + col * (cellW + gutter);
      const y = row * (cellH + gutter);
      this.tiles.push(this.buildTile(a.key, a.name, a.file, x, y, cellW, cellH, i));
    });

    this.contentH = rows * cellH + (rows - 1) * gutter;
    // Centre the grid vertically inside the viewport when it fits.
    if (this.contentH < this.vpHeight) {
      this.scroll.y = this.vpTop + (this.vpHeight - this.contentH) / 2;
      this.scrollY = 0;
    } else {
      this.scroll.y = this.vpTop - this.scrollY;
    }

    // Mask clips the grid to the scroll viewport (so scrolled cards hide).
    this.viewportMask.clear();
    this.viewportMask.rect(0, this.vpTop, w, this.vpHeight).fill(0xffffff);
  }

  private buildTile(
    key: string,
    name: string,
    file: string,
    x: number,
    y: number,
    cw: number,
    ch: number,
    index: number,
  ): Tile {
    const root = new Container();
    root.position.set(x, y);

    const card = new Graphics();
    const inner = new Container();
    const ring = new Graphics();

    const tile: Tile = {
      key,
      root,
      inner,
      card,
      ring,
      cw,
      ch,
      phase: index * 0.6,
      selected: false,
    };
    this.drawCard(tile);

    // Animal image, scaled to fit the upper portion of the card.
    const imgArea = ch * 0.66;
    const tex = this.textures.get(avatarFileUrl(file));
    if (tex) {
      const spr = new Sprite(tex);
      const s = Math.min((cw * 0.74) / tex.width, imgArea / tex.height);
      spr.anchor.set(0.5, 0.5);
      spr.scale.set(s);
      spr.position.set(cw / 2, ch * 0.4);
      inner.addChild(spr);
    }

    // Name underneath.
    const nameSize = Math.max(11, Math.min(17, cw / 6.4));
    const label = new Text({
      text: name,
      style: {
        fontFamily: '"Trebuchet MS", "Segoe UI", system-ui, sans-serif',
        fontSize: nameSize,
        fontWeight: "800",
        fill: INK,
        align: "center",
      },
    });
    label.anchor.set(0.5, 0.5);
    label.position.set(cw / 2, ch * 0.84);
    inner.addChild(label);

    root.addChild(ring, card, inner);
    this.scroll.addChild(root);
    return tile;
  }

  /** (Re)draw a card frame + selection ring for its current selected state. */
  private drawCard(tile: Tile): void {
    const { cw, ch } = tile;
    const r = Math.min(18, cw * 0.16);
    tile.card.clear();
    tile.card
      .roundRect(0, 0, cw, ch, r)
      .fill({ color: 0xfffaf0, alpha: 0.96 })
      .stroke({ width: tile.selected ? 5 : 3, color: tile.selected ? GOLD : 0xcdb892 });

    tile.ring.clear();
    if (tile.selected) {
      // Golden glow halo behind the card.
      tile.ring
        .roundRect(-7, -7, cw + 14, ch + 14, r + 7)
        .fill({ color: GOLD, alpha: 0.32 });
      tile.ring
        .roundRect(-3, -3, cw + 6, ch + 6, r + 3)
        .stroke({ width: 4, color: GOLD, alpha: 0.9 });
    }
    tile.ring.visible = tile.selected;
  }

  private layoutGoButton(): void {
    const { w, h } = this;
    const bw = Math.max(180, Math.min(300, w * 0.5));
    const bh = Math.max(54, Math.min(74, h * 0.09));
    this.goBg.clear();
    this.goBg
      .roundRect(-bw / 2, -bh / 2, bw, bh, bh / 2)
      .fill(0xff8a3d)
      .stroke({ width: 4, color: INK });

    const size = Math.max(22, Math.min(32, bh * 0.46));
    this.goLabel.text = "Let's Go!";
    this.goLabel.style = {
      fontFamily: '"Trebuchet MS", "Segoe UI", system-ui, sans-serif',
      fontSize: size,
      fontWeight: "900",
      fill: 0xffffff,
      stroke: { color: INK, width: 4 },
    };
    this.goLabel.anchor.set(0.5);
    this.goLabel.position.set(0, 0);
    this.goButton.position.set(w / 2, h - Math.max(46, h * 0.09));
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

  // ── Pointer: tap-to-select, drag-to-scroll ────────────────────────
  private onPointerDown = (e: FederatedPointerEvent): void => {
    this.pointerDown = true;
    this.dragging = false;
    this.downX = e.global.x;
    this.downY = this.lastY = e.global.y;
  };

  private onPointerMove = (e: FederatedPointerEvent): void => {
    if (!this.pointerDown) return;
    const dy = e.global.y - this.lastY;
    if (!this.dragging && Math.hypot(e.global.x - this.downX, e.global.y - this.downY) > 8) {
      this.dragging = true;
    }
    if (this.dragging && this.contentH > this.vpHeight) {
      this.lastY = e.global.y;
      this.scrollY -= dy; // drag down → reveal earlier cards
      this.clampScroll();
    }
  };

  private onPointerUp = (e: FederatedPointerEvent): void => {
    const wasTap = this.pointerDown && !this.dragging;
    this.pointerDown = false;
    if (!wasTap) return;
    // The Go button handles its own pointertap; only test the grid here.
    if (e.global.y < this.vpTop || e.global.y > this.vpTop + this.vpHeight) return;
    const hit = this.tileAt(e.global.x, e.global.y);
    if (hit) this.select(hit.key);
  };

  private tileAt(gx: number, gy: number): Tile | null {
    for (const tile of this.tiles) {
      const b = tile.root.getBounds();
      if (gx >= b.x && gx <= b.x + b.width && gy >= b.y && gy <= b.y + b.height) {
        return tile;
      }
    }
    return null;
  }

  private clampScroll(): void {
    const max = Math.max(0, this.contentH - this.vpHeight);
    this.scrollY = Math.min(max, Math.max(0, this.scrollY));
    if (this.contentH > this.vpHeight) this.scroll.y = this.vpTop - this.scrollY;
  }

  // ── Idle animation ────────────────────────────────────────────────
  update(dt: number): void {
    if (!this.container.visible) return;
    this.t += dt;
    const t = this.t;
    for (const tile of this.tiles) {
      // Gentle breathing bob: each card rises + scales a touch, offset per card
      // so the grid shimmers like a row of friendly creatures. The selected
      // card breathes a little stronger so it reads as "alive + chosen".
      const amp = tile.selected ? 1 : 0.6;
      const bob = Math.sin(t * 1.7 + tile.phase) * 2.2 * amp;
      const breathe = 1 + Math.sin(t * 1.7 + tile.phase) * 0.018 * amp;
      tile.inner.position.y = bob;
      tile.inner.scale.set(breathe);
    }
    if (this.goButton.visible) {
      const pulse = 1 + Math.sin(t * 3) * 0.03;
      this.goButton.scale.set(pulse);
    }
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}

/** Linear blend between two 0xRRGGBB colors. */
function lerp(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 0xff, ag = (a >> 8) & 0xff, ab = a & 0xff;
  const br = (b >> 16) & 0xff, bg = (b >> 8) & 0xff, bb = b & 0xff;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return (r << 16) | (g << 8) | bl;
}
