import { Container, Graphics, Sprite, Text, type Texture } from "pixi.js";
import { getContentBounds } from "../render/avatarTexture";
import { loadKit, type KitTextures } from "./travelKit";
import { drawFireflies, drawHollowLog } from "./travelArt";
import { TREEHOUSE_ROUTE } from "./route";
import {
  avatarAt,
  avatarZ,
  cameraFor,
  cameraLateral,
  destinationAt,
  discoveryAt,
  drawOrder,
  frameUnit,
  nearFade,
  pathRibbon,
  project,
  pxSize,
  type CameraOpts,
  type RouteDef,
  type Viewport,
} from "./routeModel";
import {
  abandon,
  advance,
  arrivalStage,
  beginTravel,
  closeMap,
  discoveryReachable,
  findDiscovery,
  hitRect,
  mapButtonRects,
  mapPanelRect,
  markPoint,
  newJourney,
  openMap,
  progressMarkerX,
  progressTrackRect,
  snapshotRect,
  stepToNextWaypoint,
  type JourneyState,
  type Rect,
} from "./journey";

/**
 * Guided travel — the A2 into-the-screen journey.
 *
 * Owns the three screens between the world map and the Treehouse room: the
 * destination card, the journey itself, and the arrival greeting. SceneRenderer
 * holds one of these and hands it taps and the per-frame tick.
 *
 * PERSISTENT SPRITES. The POC rebuilt every sprite every frame, which was fine
 * for a proof and is not fine for a phone. Corridor props are pooled and only
 * their transforms change per frame; `travelView.test.ts` asserts the pool
 * stops growing, so nobody can quietly reintroduce the rebuild.
 *
 * Layer order, back → front:
 *   sky → ground → far tree line → path → depth-sorted corridor (props,
 *   discovery, destination, the Friend) → screen-edge framing → fireflies →
 *   HUD → overlays (map / card / greeting)
 */

const INK = 0x23201c;
const CARD = 0xfdf3e0;
const HONEY = 0xe8a33d;
const FONT = '"Trebuchet MS", "Segoe UI", system-ui, sans-serif';

/**
 * The world-map snapshot the journey map shows, plus where the destination
 * actually sits inside it.
 *
 * The mark is normalised (0..1) against the snapshot image rather than given in
 * screen pixels, so it survives the cover-crop the panel applies and stays on
 * the landmark at every viewport.
 */
export interface MapSnapshot {
  texture: Texture;
  /** Normalised position of the destination landmark inside the snapshot. */
  destination: { x: number; y: number };
}

/** What a tap resolved to, for SceneRenderer. */
export type TravelTap = "none" | "dismiss" | "enter-room" | "back-to-island";

export interface TravelViewOptions {
  reducedMotion: boolean;
}

export class TravelView {
  readonly container = new Container();

  private sky = new Graphics();
  private ground = new Graphics();
  private farLine = new Container();
  private path = new Graphics();
  private depth = new Container();
  private framing = new Container();
  private fx = new Container();
  private hud = new Container();
  private overlay = new Container();

  private kit?: KitTextures;
  private route: RouteDef = TREEHOUSE_ROUTE;
  private state: JourneyState;
  private w = 0;
  private h = 0;
  private elapsed = 0;

  /** The child's Friend (front-facing core art — see travelKit). */
  private friendTex?: Texture;
  private oliveTex?: Texture;
  /** Snapshot of the real world map, taken when the journey began. */
  private mapTex?: Texture;
  /** Where the destination sits inside that snapshot, normalised. */
  private mapMark?: { x: number; y: number };
  private friendKey = "";
  private poseSubstituted = true;

  /** Pooled corridor sprites, reused frame to frame. */
  private propPool: Sprite[] = [];
  private framePool: Sprite[] = [];
  private farPool: Sprite[] = [];
  /** Hit rects resolved on the last draw. */
  private hits: { id: string; rect: Rect }[] = [];
  private walking = false;

  constructor(private opts: TravelViewOptions) {
    this.state = newJourney(opts.reducedMotion);
    this.container.addChild(
      this.sky, this.ground, this.farLine, this.path, this.depth,
      this.framing, this.fx, this.hud, this.overlay,
    );
    this.container.visible = false;
  }

  get active(): boolean {
    return this.container.visible;
  }
  get phase(): JourneyState["phase"] {
    return this.state.phase;
  }
  get progress(): number {
    return this.state.p;
  }
  get discoveryFound(): boolean {
    return this.state.discovery === "found";
  }
  /** Live sprite count — the number `travelView.test.ts` watches. */
  get spriteCount(): number {
    return this.propPool.length + this.framePool.length + this.farPool.length;
  }
  /** Whether the Friend is drawn from a production travel pose or a substitute. */
  get usingSubstitutePose(): boolean {
    return this.poseSubstituted;
  }

  async load(): Promise<void> {
    if (!this.kit) this.kit = await loadKit();
  }

  setFriend(tex: Texture | undefined, key: string, substituted: boolean): void {
    this.friendTex = tex;
    this.friendKey = key;
    this.poseSubstituted = substituted;
  }
  setOlive(tex: Texture | undefined): void {
    this.oliveTex = tex;
  }
  /** The world-map snapshot the journey map shows. */
  setMapSnapshot(snap: MapSnapshot | undefined): void {
    this.mapTex = snap?.texture;
    this.mapMark = snap?.destination;
  }

  /** Open the destination card. The journey has not started yet. */
  begin(w: number, h: number): void {
    this.state = newJourney(this.opts.reducedMotion);
    this.w = w;
    this.h = h;
    this.container.visible = true;
    this.draw();
  }

  hide(): void {
    this.container.visible = false;
  }

  resize(w: number, h: number): void {
    this.w = w;
    this.h = h;
    if (this.active) this.draw();
  }

  /** Hold-to-walk, set by SceneRenderer from pointer state. */
  setWalking(on: boolean): void {
    this.walking = on;
  }

  update(dt: number): void {
    if (!this.active) return;
    this.elapsed += dt;
    if (this.state.phase === "travel" && !this.state.mapOpen && !this.opts.reducedMotion) {
      const before = this.state.phase;
      this.state = advance(this.state, dt, this.walking, 0);
      if (this.state.phase !== before) this.walking = false;
    }
    this.draw();
  }

  handleTap(sx: number, sy: number): TravelTap {
    if (!this.active) return "none";
    const hit = this.hits.find((x) => hitRect(x.rect, sx, sy));
    if (!hit) return "none";
    switch (hit.id) {
      case "lets-go":
        this.state = beginTravel(this.state);
        break;
      case "dismiss":
        return "dismiss";
      case "map-open":
        this.state = openMap(this.state);
        break;
      case "map-close":
        this.state = closeMap(this.state);
        break;
      case "back-to-island":
        this.state = abandon(this.state);
        return "back-to-island";
      case "log":
        this.state = findDiscovery(this.state);
        break;
      case "keep-going":
        this.state = this.state.mapOpen ? closeMap(this.state) : stepToNextWaypoint(this.state, this.route);
        break;
      case "enter-room":
        return "enter-room";
      default:
        break;
    }
    this.draw();
    return "none";
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }

  // ── Drawing ───────────────────────────────────────────────────────

  private view(): Viewport {
    return { w: this.w, h: this.h };
  }

  /** Take a sprite from a pool, growing it only when a frame genuinely needs
   *  more than any previous frame did. */
  private take(pool: Sprite[], layer: Container, i: number): Sprite {
    let s = pool[i];
    if (!s) {
      s = new Sprite();
      pool[i] = s;
    }
    // Always re-append: Pixi moves an existing child to the end, so display
    // order ends up being ALLOCATION order. That is what carries the depth
    // sort, and it removes the need to re-index the display list afterwards —
    // which is where an out-of-bounds `addChildAt` came from once the hollow
    // log stopped drawing through the pool and the two indices diverged.
    layer.addChild(s);
    s.visible = true;
    return s;
  }
  private trim(pool: Sprite[], used: number): void {
    for (let i = used; i < pool.length; i++) pool[i].visible = false;
  }

  /** Place a pooled sprite on its measured content base. */
  private place(
    s: Sprite, tex: Texture, px: number, x: number, y: number,
    flip?: boolean, tint?: number, alpha = 1,
  ): void {
    s.texture = tex;
    const b = this.kit?.bounds.get(tex) ?? getContentBounds(tex);
    const contentH = (b?.contentH ?? 1) * (tex.height || 1);
    s.anchor.set(b?.centerX ?? 0.5, b?.feetY ?? 1);
    const k = px / (contentH || 1);
    s.scale.set(flip ? -k : k, k);
    s.position.set(x, y);
    s.tint = tint ?? 0xffffff;
    s.alpha = alpha;
  }

  private draw(): void {
    this.hits = [];
    this.overlay.removeChildren().forEach((c) => c.destroy());
    this.hud.removeChildren().forEach((c) => c.destroy());
    this.fx.removeChildren().forEach((c) => c.destroy());
    // Pooled sprites are re-appended by `take`; the per-frame Graphics (the
    // hollow log, the contact shadow) are thrown away.
    for (const c of this.depth.removeChildren()) if (c instanceof Graphics) c.destroy();

    if (!this.kit || this.w === 0) return;

    const showWorld = this.state.phase !== "card";
    this.sky.visible = this.ground.visible = this.farLine.visible = showWorld;
    this.path.visible = this.framing.visible = showWorld;
    if (showWorld) this.paintWorld();
    else this.paintCardBackdrop();

    // An overlay owns EVERY tap while it is up. The corridor is still painted
    // underneath the map (it is what the map is over), and painting it
    // registers the log's hit rect; that rect is discarded here so nothing
    // under the map, the card or the greeting can be reached through it. A tap
    // on the scrim beside the map's buttons is a tap on nothing.
    if (this.state.phase !== "travel" || this.state.mapOpen) this.hits = [];

    if (this.state.phase === "card") this.drawDestinationCard();
    else if (this.state.phase === "arrival") this.drawArrivalGreeting();
    else if (this.state.mapOpen) this.drawJourneyMap();
    else this.drawTravelHud();
  }

  // ── The corridor ─────────────────────────────────────────────────

  private paintWorld(): void {
    const view = this.view();
    const cam = cameraFor(this.route);
    const p = this.state.p;
    const camLat = cameraLateral(this.route, p, this.state.steer);
    const pal = this.route.palette;
    const horizonY = view.h * cam.horizonFrac;

    this.paintSky(view, horizonY, pal.skyTop, pal.skyBottom);
    this.paintGround(view, horizonY, cam, pal.groundFar, pal.groundNear);
    this.paintFarLine(view, horizonY, camLat, pal.farTree, pal.hazeFar);
    if (this.state.phase === "arrival") {
      // Arrival is a composed stop, not the corridor's last frame — see
      // arrivalStage() for why.
      this.path.clear();
      this.paintArrivalStage(view);
    } else {
      this.paintPath(p, camLat, cam, view);
      this.paintDepth(p, camLat, cam, view);
    }
    this.paintFraming(view, camLat);
    if (this.state.discovery === "found") this.paintFireflies(view);
  }

  /**
   * The Treehouse at the end of the walk: base-pinned on the arrival ground
   * line so its approach meets the ground at the characters' feet.
   *
   * SUBSTITUTION: the sprite is still the world-map landmark (travelKit.ts),
   * which carries a straight rung ladder rather than the approved curved
   * stairs. The composition is what changes here — when the approved exterior
   * ships, the stairs land on this same ground line with nothing else to move.
   */
  private paintArrivalStage(view: Viewport): void {
    if (!this.kit) return;
    const st = arrivalStage(view);
    const shadow = new Graphics();
    shadow
      .ellipse(st.treeX, st.groundY + 4, view.w * 0.4, view.h * 0.03)
      .fill({ color: 0x2f1f10, alpha: 0.22 });
    this.depth.addChild(shadow);
    // Fit by width as well as height. The Treehouse art is nearly square, so on
    // a phone a height-only fit throws its canopy a long way past both edges.
    // The allowance is deliberately generous (1.55×) — standing at the foot of
    // a big tree, canopy running off the sides is the point; what it prevents
    // is the structure growing so wide that the door and stairs leave the
    // frame. The "whole canopy in frame" rule is about the ISLAND OVERVIEW, a
    // different view; this is a close-up.
    const b = this.kit.bounds.get(this.kit.destination);
    const tex = this.kit.destination;
    const aspect =
      ((b?.contentW ?? 1) * (tex.width || 1)) / Math.max(1, (b?.contentH ?? 1) * (tex.height || 1));
    const h = Math.min(st.treeH, (view.w * 1.55) / Math.max(0.01, aspect));
    this.place(this.take(this.propPool, this.depth, 0), tex, h, st.treeX, st.groundY);
    this.trim(this.propPool, 1);
  }

  private paintSky(view: Viewport, horizonY: number, top: number, bottom: number): void {
    this.sky.clear();
    const bands = 20;
    for (let i = 0; i < bands; i++) {
      this.sky
        .rect(0, (horizonY * i) / bands, view.w, horizonY / bands + 1)
        .fill(lerp(top, bottom, i / (bands - 1)));
    }
  }

  /** The ground plane, shaded far → near by the SAME 1/z projection the props
   *  use, so the colour ramp compresses toward the horizon the way the scenery
   *  does instead of fighting it. */
  private paintGround(view: Viewport, horizonY: number, cam: CameraOpts, far: number, near: number): void {
    this.ground.clear();
    const bands = 24;
    const nearY = view.h * cam.nearFrac;
    let prevY = horizonY;
    for (let i = 1; i <= bands; i++) {
      const k = Math.pow(i / bands, 2.1);
      const y = horizonY + (nearY - horizonY) * k;
      this.ground.rect(0, prevY, view.w, y - prevY + 1).fill(lerp(far, near, k));
      prevY = y;
    }
    this.ground.rect(0, prevY, view.w, view.h).fill(near);
  }

  /** A silhouette tree line ON the horizon. Sells "there is a world past the
   *  destination" for the price of one sprite row. */
  private paintFarLine(view: Viewport, horizonY: number, camLat: number, tint: number, haze: number): void {
    this.farLine.removeChildren().forEach((c) => { if (c instanceof Graphics) c.destroy(); });
    const band = new Graphics();
    const bh = view.h * 0.12;
    for (let i = 0; i < 14; i++) {
      const u = i / 13;
      const a = Math.max(0, 0.45 * (1 - Math.pow(Math.abs(u - 0.45) / 0.55, 1.6)));
      band.rect(0, horizonY - bh * 0.5 + (bh * i) / 14, view.w, bh / 14 + 1.5)
        .fill({ color: haze, alpha: a });
    }
    this.farLine.addChildAt(band, 0);

    const n = 24;
    const shift = -camLat * 26;
    for (let i = 0; i < n; i++) {
      const j = (i * 7919) % 101;
      const tex = j % 2 ? this.kit!.props.tree2 : this.kit!.props.tree1;
      const jitter = ((j % 17) / 17 - 0.5) * (view.w / n) * 1.5;
      const x = ((i + 0.5) / n) * view.w * 1.45 - view.w * 0.22 + shift + jitter;
      const hh = view.h * (0.034 + (j % 23) / 430);
      const s = this.take(this.farPool, this.farLine, i);
      this.place(s, tex, hh, x, horizonY + 4 + (j % 5), j % 3 === 0, tint, 0.42 + (j % 7) / 40);
    }
    this.trim(this.farPool, n);
  }

  private paintPath(p: number, camLat: number, cam: CameraOpts, view: Viewport): void {
    this.path.clear();
    const ribbon = pathRibbon(this.route, p, camLat, cam, view);
    if (ribbon.length < 2) return;
    for (let i = 0; i < ribbon.length - 1; i++) {
      const a = ribbon[i];
      const b = ribbon[i + 1];
      const shade = Math.min(1, Math.max(0, b.left.k / 0.7));
      this.path
        .poly([a.left.x, a.left.y, a.right.x, a.right.y, b.right.x, b.right.y, b.left.x, b.left.y])
        .fill(lerp(this.route.palette.pathFar, this.route.palette.pathNear, shade));
    }
    for (const side of ["left", "right"] as const) {
      const pts: number[] = [];
      for (const seg of ribbon) pts.push(seg[side].x, seg[side].y);
      if (pts.length >= 6) {
        this.path.poly(pts, false).stroke({
          width: Math.max(1.5, view.w * 0.004),
          color: this.route.palette.pathNear,
          alpha: 0.5,
        });
      }
    }
  }

  /**
   * Corridor props, the discovery, the destination and the Friend, in ONE
   * depth-sorted pass — exactly like the world map's shared y-sorted layer, so
   * a tree nearer than the Treehouse correctly occludes it. That is what makes
   * the reveal through the gap work.
   */
  private paintDepth(p: number, camLat: number, cam: CameraOpts, view: Viewport): void {
    const avZ = avatarZ(cam);
    type Item = { z: number; draw: (alloc: () => number) => void };
    const items: Item[] = [];

    for (const { prop, at, px } of drawOrder(this.route, p, camLat, cam, view)) {
      const hazeMix = Math.min(0.55, Math.max(0, (at.z - 5) / 26));
      const tint = prop.tint ?? (hazeMix > 0.02 ? lerp(0xffffff, this.route.palette.hazeFar, hazeMix) : undefined);
      const fade = nearFade(at.z, avZ);
      if (fade <= 0.01) continue;
      items.push({
        z: at.z,
        draw: (alloc) => this.place(this.take(this.propPool, this.depth, alloc()), this.kit!.props[prop.kind], px, at.x, at.y, prop.flip, tint, fade),
      });
    }

    // The hollow log, off the path. Tappable whenever it is reachable.
    const disc = discoveryAt(this.route, p, camLat, cam, view);
    if (disc.at.visible && this.state.discovery === "unseen") {
      const reachable = discoveryReachable(this.state, this.route);
      items.push({
        z: disc.at.z,
        draw: () => {
          // Appended into the depth pass in sorted order, so a nearer tree
          // still occludes the log the way it occludes everything else.
          const g = new Graphics();
          drawHollowLog(g, disc.px);
          g.position.set(disc.at.x, disc.at.y);
          this.depth.addChild(g);
          if (reachable) {
            // A generous target: the log IS the button. Tapping it is the
            // action — no steering is needed at any motion setting.
            const rw = Math.max(72, disc.px * 2.6);
            const rh = Math.max(72, disc.px * 1.8);
            this.hits.push({ id: "log", rect: { x: disc.at.x - rw / 2, y: disc.at.y - rh, w: rw, h: rh } });
          }
        },
      });
    }

    const dest = destinationAt(this.route, p, camLat, cam, view);
    if (dest.at.visible && dest.reveal > 0.001) {
      const hazeMix = Math.min(0.5, Math.max(0, (dest.at.z - 5) / 26));
      items.push({
        z: dest.at.z,
        draw: (alloc) => this.place(
          this.take(this.propPool, this.depth, alloc()), this.kit!.destination, dest.px,
          dest.at.x, dest.at.y, false, lerp(0xffffff, this.route.palette.hazeFar, hazeMix), dest.reveal,
        ),
      });
    }

    const av = avatarAt(this.route, p, this.state.steer);
    const avAt = project(av.t, av.lateral, p, camLat, cam, view);
    const avPx = pxSize(0.6, avAt.k, cam, view);
    if (this.friendTex && avAt.visible) {
      items.push({
        z: avAt.z,
        draw: (alloc) => {
          // Contact shadow first, so the Friend stands on the path rather than
          // on air; both sit at the same depth.
          const sh = new Graphics();
          sh.ellipse(avAt.x, avAt.y, avPx * 0.3, avPx * 0.075).fill({ color: INK, alpha: 0.22 });
          this.depth.addChild(sh);
          this.place(this.take(this.propPool, this.depth, alloc()), this.friendTex!, avPx, avAt.x, avAt.y);
        },
      });
    }

    // Far first. Each item allocates a pool slot ONLY if it needs one — the
    // hollow log draws its own Graphics — so the pool index is handed out by
    // the allocator rather than assumed to match the item index.
    items.sort((a, b) => b.z - a.z);
    let used = 0;
    for (const it of items) it.draw(() => used++);
    this.trim(this.propPool, used);
  }

  private paintFraming(view: Viewport, camLat: number): void {
    this.route.framing.forEach((f, i) => {
      const s = this.take(this.framePool, this.framing, i);
      this.place(
        s, this.kit!.props[f.kind], frameUnit(view) * f.hFrac,
        f.ax * view.w - camLat * f.parallax, f.ay * view.h, f.flip, f.tint, f.alpha ?? 1,
      );
    });
    this.trim(this.framePool, this.route.framing.length);
  }

  /** The fireflies that came out of the log and now travel with the child. */
  private paintFireflies(view: Viewport): void {
    const g = new Graphics();
    drawFireflies(g, view.w, view.h, this.opts.reducedMotion ? 0 : this.elapsed);
    this.fx.addChild(g);
  }

  // ── Overlay screens ──────────────────────────────────────────────

  /** A pill with a label; registers its own hit rect. */
  private button(r: Rect, label: string, id: string, primary: boolean): void {
    const g = new Graphics();
    g.roundRect(r.x, r.y, r.w, r.h, r.h / 2)
      .fill(primary ? HONEY : CARD)
      .stroke({ width: 4, color: INK });
    this.overlay.addChild(g);
    const t = new Text({
      text: label,
      style: { fontFamily: FONT, fontSize: 19, fontWeight: "900", fill: INK },
    });
    t.anchor.set(0.5);
    const room = r.w - 20;
    if (t.width > room && t.width > 0) t.scale.set(room / t.width);
    t.position.set(r.x + r.w / 2, r.y + r.h / 2);
    this.overlay.addChild(t);
    this.hits.push({ id, rect: r });
  }

  private body(
    text: string, cx: number, top: number, wrap: number, size: number, bold = false, fill = INK,
  ): Text {
    const t = new Text({
      text,
      style: {
        fontFamily: FONT, fontSize: size, fontWeight: bold ? "900" : "700", fill,
        align: "center", wordWrap: true, wordWrapWidth: wrap, lineHeight: size * 1.35,
      },
    });
    t.anchor.set(0.5, 0);
    t.position.set(cx, top);
    return t;
  }

  /** Behind the destination card: the island the child is leaving, dimmed. */
  private paintCardBackdrop(): void {
    if (this.mapTex) {
      const s = new Sprite(this.mapTex);
      const k = Math.max(this.w / (this.mapTex.width || 1), this.h / (this.mapTex.height || 1));
      s.scale.set(k);
      s.position.set(
        (this.w - (this.mapTex.width || 0) * k) / 2,
        (this.h - (this.mapTex.height || 0) * k) / 2,
      );
      this.overlay.addChild(s);
    }
    const g = new Graphics();
    g.rect(0, 0, this.w, this.h).fill({ color: 0x1a1206, alpha: this.mapTex ? 0.45 : 0.75 });
    this.overlay.addChild(g);
  }

  /**
   * The destination card. CHARACTER-FREE, by design.
   *
   * One tap between the map and the journey, with no character and no
   * dialogue: a journey is a commitment and a mis-tap on a phone should not
   * start one. Olive is deliberately not here — her first appearance is the
   * arrival greeting, which is where the approved flow puts it.
   */
  private drawDestinationCard(): void {
    const w = Math.min(this.w - 40, 420);
    const h = Math.min(this.h - 120, 430);
    const x = (this.w - w) / 2;
    const y = (this.h - h) / 2;
    const card = new Graphics();
    card.roundRect(x, y, w, h, 26).fill(CARD).stroke({ width: 5, color: INK });
    this.overlay.addChild(card);

    // Laid out as a stack from the bottom up, so the art takes whatever is
    // left rather than the text and the buttons landing on top of each other.
    const bw = Math.min(w - 56, 260);
    const btnTop = y + h - 20 - 48 - 12 - 56;
    this.button({ x: x + (w - bw) / 2, y: btnTop, w: bw, h: 56 }, "Let's go!", "lets-go", true);
    this.button({ x: x + (w - bw) / 2, y: btnTop + 68, w: bw, h: 48 }, "Not now", "dismiss", false);

    this.overlay.addChild(this.body("It's a walk from here.", x + w / 2, btnTop - 30, w - 60, 17));
    this.overlay.addChild(this.body("Treehouse Hideaway", x + w / 2, btnTop - 64, w - 40, 25, true));

    if (this.kit) {
      const art = new Sprite(this.kit.destination);
      const b = this.kit.bounds.get(this.kit.destination);
      const avail = btnTop - 64 - (y + 22);
      const contentH = (b?.contentH ?? 1) * (this.kit.destination.height || 1);
      art.anchor.set(b?.centerX ?? 0.5, b?.feetY ?? 1);
      art.scale.set(Math.max(20, avail) / (contentH || 1));
      art.position.set(x + w / 2, btnTop - 70);
      this.overlay.addChild(art);
    }
  }

  /** The travel HUD: how to keep going, how far along, and how to look at the
   *  map. Deliberately thin — the journey is the screen. */
  private drawTravelHud(): void {
    const g = new Graphics();
    const tw = Math.min(this.w - 180, 320);
    const tx = (this.w - tw) / 2;
    g.roundRect(tx, 22, tw, 14, 7).fill({ color: 0x000000, alpha: 0.25 });
    g.roundRect(tx, 22, Math.max(14, tw * this.state.p), 14, 7).fill(HONEY);
    this.hud.addChild(g);

    this.button({ x: 16, y: 14, w: 104, h: 48 }, "Map", "map-open", false);

    if (this.opts.reducedMotion) {
      // Waypoint travel: one tap per stop. No holding, no steering.
      const bw = Math.min(this.w - 48, 260);
      this.button({ x: (this.w - bw) / 2, y: this.h - 86, w: bw, h: 62 }, "Keep going \u2192", "keep-going", true);
    } else if (!this.walking) {
      const hint = this.body("Hold anywhere to walk", this.w / 2, this.h - 62, this.w - 60, 16);
      hint.alpha = 0.85;
      this.hud.addChild(hint);
    }

    // The log's own prompt, only while it is reachable and unfound.
    if (discoveryReachable(this.state, this.route)) {
      // Below the Map pill (y 14..62), not beside it — on a phone the pill and a
      // centred line of text are the same band of screen.
      this.hud.addChild(this.body("Something hollow in that log\u2026", this.w / 2, 72, this.w - 60, 17, true));
    }
  }

  /**
   * The journey map.
   *
   * A SNAPSHOT of the real world map — so it is recognisably the island the
   * child was just on. Progress is shown on a separate track BELOW the map, not
   * as a line drawn across the terrain: the walkgrid and landmark coordinates
   * are locked and no route across them has been pathfound, so drawing one
   * would assert a navigable path nobody has verified.
   */
  private drawJourneyMap(): void {
    const scrim = new Graphics();
    scrim.rect(0, 0, this.w, this.h).fill({ color: 0x1a1206, alpha: 0.72 });
    this.overlay.addChild(scrim);

    const panel = mapPanelRect(this.w, this.h);
    const frame = new Graphics();
    frame.roundRect(panel.x - 6, panel.y - 6, panel.w + 12, panel.h + 12, 18)
      .fill(CARD).stroke({ width: 5, color: INK });
    this.overlay.addChild(frame);

    if (this.mapTex) {
      const fit = snapshotRect(panel, this.mapTex.width || 1, this.mapTex.height || 1);
      const s = new Sprite(this.mapTex);
      s.width = fit.w;
      s.height = fit.h;
      s.position.set(fit.x, fit.y);
      const mask = new Graphics();
      mask.roundRect(panel.x, panel.y, panel.w, panel.h, 12).fill(0xffffff);
      s.mask = mask;
      this.overlay.addChild(mask, s);
      // The destination, pinned at its REAL position on the island — the one
      // thing the map asserts about the terrain. No line is drawn to it: the
      // route between here and there has not been pathfound and drawing one
      // would claim a way through locked geography that nobody has verified.
      if (this.mapMark) {
        const at = markPoint(fit, this.mapMark);
        if (at.x >= panel.x && at.x <= panel.x + panel.w && at.y >= panel.y && at.y <= panel.y + panel.h) {
          const pin = new Graphics();
          pin.circle(at.x, at.y, 13).fill({ color: HONEY, alpha: 0.35 });
          pin.circle(at.x, at.y, 8).fill(CARD).stroke({ width: 3.5, color: INK });
          pin.circle(at.x, at.y, 3).fill(HONEY);
          this.overlay.addChild(pin);
        }
      }
    } else {
      const ph = new Graphics();
      ph.roundRect(panel.x, panel.y, panel.w, panel.h, 12).fill(0x9ec4a6);
      this.overlay.addChild(ph);
    }

    // Light ink: this line sits on the dark scrim, not on the card.
    this.overlay.addChild(
      this.body("You're on your way", this.w / 2, panel.y - 44, this.w - 60, 21, true, CARD),
    );

    const track = progressTrackRect(panel);
    const g = new Graphics();
    g.roundRect(track.x, track.y, track.w, track.h, track.h / 2)
      .fill({ color: 0xffffff, alpha: 0.92 }).stroke({ width: 3, color: INK });
    g.roundRect(track.x + 3, track.y + 3, Math.max(0, (track.w - 6) * this.state.p), track.h - 6, (track.h - 6) / 2)
      .fill(HONEY);
    g.circle(progressMarkerX({ ...track, x: track.x + 3, w: track.w - 6 }, this.state.p), track.y + track.h / 2, 13)
      .fill(CARD).stroke({ width: 3, color: INK });
    this.overlay.addChild(g);

    // "Island", not "Welcome Dock": the journey starts wherever the child was
    // standing when they chose the Treehouse, and naming a landmark they may
    // never have been to would be a claim the journey does not make.
    const start = this.body("Island", track.x + 40, track.y + track.h + 8, 160, 13, false, CARD);
    const end = this.body("Treehouse", track.x + track.w - 40, track.y + track.h + 8, 160, 13, false, CARD);
    this.overlay.addChild(start, end);

    const btns = mapButtonRects(panel, this.w, this.h);
    this.button(btns.keepGoing, "Keep going", "map-close", true);
    this.button(btns.backToIsland, "Back to Island", "back-to-island", false);
  }

  /**
   * The arrival greeting: the child's Friend and Olive, together, at the foot
   * of the Treehouse — before the room.
   *
   * This is Olive's FIRST appearance in the journey, which is what the approved
   * flow asks for. Both are on screen at once and Olive is named, so a child
   * sees who met them.
   */
  private drawArrivalGreeting(): void {
    const { groundY } = arrivalStage(this.view());
    const px = Math.min(this.h * 0.32, this.w * 0.3);

    if (this.friendTex) {
      const s = new Sprite();
      this.place(s, this.friendTex, px, this.w * 0.34, groundY);
      this.overlay.addChild(s);
    }
    if (this.oliveTex) {
      const s = new Sprite();
      this.place(s, this.oliveTex, px * 0.94, this.w * 0.66, groundY, true);
      this.overlay.addChild(s);
    }

    const cardW = Math.min(this.w - 48, 520);
    const cardH = 132;
    const cx = (this.w - cardW) / 2;
    const cy = Math.max(24, groundY - px - cardH - 24);
    const card = new Graphics();
    card.roundRect(cx, cy, cardW, cardH, 20).fill(CARD).stroke({ width: 4, color: INK });
    this.overlay.addChild(card);
    this.overlay.addChild(this.body("Olive", this.w / 2, cy + 14, cardW - 40, 19, true));
    this.overlay.addChild(
      this.body(
        this.state.discovery === "found"
          ? '"You made it \u2014 and you brought fireflies! Come up."'
          : '"You made it! Come up, I\'ll show you the Treehouse."',
        this.w / 2, cy + 44, cardW - 44, 17,
      ),
    );

    const bw = Math.min(this.w - 64, 280);
    this.button({ x: (this.w - bw) / 2, y: this.h - 82, w: bw, h: 60 }, "Go inside \u2192", "enter-room", true);
  }
}

function lerp(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
  const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
  return (
    (Math.round(ar + (br - ar) * t) << 16) |
    (Math.round(ag + (bg - ag) * t) << 8) |
    Math.round(ab + (bb - ab) * t)
  );
}
