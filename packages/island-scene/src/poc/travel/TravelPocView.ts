import { Application, Container, Graphics, Sprite, Text, type Texture } from "pixi.js";
import { getContentBounds } from "../../render/avatarTexture";
import { buildBackPoseStandIn } from "./backPoseStandIn";
import { loadKit, type KitTextures } from "./travelKit";
import {
  avatarAt,
  avatarZ,
  cameraFor,
  cameraLateral,
  destinationAt,
  drawOrder,
  frameUnit,
  nearFade,
  pathRibbon,
  project,
  pxSize,
  type CameraOpts,
  type FramingProp,
  type RouteDef,
  type Viewport,
} from "./routeModel";

/**
 * POC — the guided-travel renderer.
 *
 * Everything is rebuilt each frame from `routeModel`'s projection. That is not
 * how production would do it (a real TravelView would keep persistent sprites
 * and only update transforms), but for a proof of concept it keeps the whole
 * illusion in one readable pass and makes the cost visible: if a full rebuild
 * per frame is affordable on a Chromebook, the incremental version certainly
 * is.
 *
 * Layer order, back → front:
 *   sky → far haze band → distant tree line → ground → path ribbon →
 *   corridor props + destination + avatar (all depth-sorted together) →
 *   screen-edge framing → HUD
 *
 * The destination, the props and the avatar share ONE sorted pass, exactly like
 * the world map's shared y-sorted `entities` layer, so a tree nearer than the
 * treehouse correctly occludes it. That is what makes the reveal work.
 */

export type AvatarPose = "front" | "back" | "none";

export interface TravelPocOptions {
  route: RouteDef;
  progress: number;
  steer: number;
  pose: AvatarPose;
  hud: boolean;
}

export class TravelPocView {
  readonly app = new Application();
  private kit!: KitTextures;

  private sky = new Graphics();
  private ground = new Graphics();
  private farLine = new Container();
  private path = new Graphics();
  private depth = new Container();
  private framing = new Container();
  private hud = new Container();
  private hudText = new Text({ text: "" });

  private opts: TravelPocOptions;
  /** Sprite count from the last frame — the number that matters for cost. */
  sprites = 0;

  constructor(opts: TravelPocOptions) {
    this.opts = opts;
  }

  async init(host: HTMLElement): Promise<void> {
    await this.app.init({
      resizeTo: host,
      background: 0x8fbcd4,
      antialias: true,
      resolution: 1,
      preference: "webgl",
    });
    host.appendChild(this.app.canvas);
    this.kit = await loadKit();
    this.app.stage.addChild(
      this.sky, this.ground, this.farLine, this.path, this.depth, this.framing, this.hud,
    );
    this.hud.addChild(this.hudText);
    this.render();
    this.app.renderer.on("resize", () => this.render());
  }

  set(opts: Partial<TravelPocOptions>): void {
    this.opts = { ...this.opts, ...opts };
    this.render();
  }

  private view(): Viewport {
    return { w: this.app.screen.width, h: this.app.screen.height };
  }

  /** Anchor a sprite on its measured content base (not the canvas bottom) and
   *  size it by its measured content height, so a prop stands on the ground
   *  regardless of the transparent padding baked into its file. */
  private place(tex: Texture, px: number, x: number, y: number, flip?: boolean, tint?: number, alpha?: number): Sprite {
    const s = new Sprite(tex);
    const b = this.kit.bounds.get(tex) ?? getContentBounds(tex);
    const contentH = (b?.contentH ?? 1) * tex.height;
    s.anchor.set(b?.centerX ?? 0.5, b?.feetY ?? 1);
    s.scale.set(px / contentH);
    if (flip) s.scale.x *= -1;
    s.position.set(x, y);
    if (tint !== undefined) s.tint = tint;
    if (alpha !== undefined) s.alpha = alpha;
    return s;
  }

  render(): void {
    // A queued resize can land after teardown; there is nothing to draw then.
    if (!this.app.renderer || !this.kit) return;
    const view = this.view();
    const { route, progress: p, steer, pose } = this.opts;
    const cam = cameraFor(route);
    const camLat = cameraLateral(route, p, steer);
    const pal = route.palette;
    const horizonY = view.h * cam.horizonFrac;

    this.sprites = 0;
    this.depth.removeChildren().forEach((c) => c.destroy());
    this.farLine.removeChildren().forEach((c) => c.destroy());
    this.framing.removeChildren().forEach((c) => c.destroy());

    this.paintSky(view, horizonY, pal.skyTop, pal.skyBottom);
    this.paintGround(view, horizonY, cam, pal.groundFar, pal.groundNear);
    this.paintFarLine(view, horizonY, camLat, pal.farTree, pal.hazeFar);
    this.paintPath(route, p, camLat, cam, view);
    this.paintDepthLayer(route, p, camLat, cam, view, pose);
    this.paintFraming(route, view, camLat);
    this.paintHud(view, route, p);
  }

  // ── Background ───────────────────────────────────────────────────
  private paintSky(view: Viewport, horizonY: number, top: number, bottom: number): void {
    this.sky.clear();
    const bands = 22;
    for (let i = 0; i < bands; i++) {
      this.sky
        .rect(0, (horizonY * i) / bands, view.w, horizonY / bands + 1)
        .fill(lerp(top, bottom, i / (bands - 1)));
    }
  }

  /** The ground plane, shaded far → near. Bands are placed by the SAME 1/z
   *  projection the props use, so the colour ramp compresses toward the horizon
   *  the way the scenery does instead of fighting it. */
  private paintGround(view: Viewport, horizonY: number, cam: CameraOpts, far: number, near: number): void {
    this.ground.clear();
    const bands = 26;
    const nearY = view.h * cam.nearFrac;
    let prevY = horizonY;
    for (let i = 1; i <= bands; i++) {
      const k = Math.pow(i / bands, 2.1); // dense near the horizon
      const y = horizonY + (nearY - horizonY) * k;
      this.ground.rect(0, prevY, view.w, y - prevY + 1).fill(lerp(far, near, k));
      prevY = y;
    }
    this.ground.rect(0, prevY, view.w, view.h).fill(near);
  }

  /** A silhouette tree line ON the horizon, shifted by camera lateral. Sells
   *  "there is a world past the destination" for the price of one sprite row. */
  private paintFarLine(view: Viewport, horizonY: number, camLat: number, tint: number, haze: number): void {
    // Aerial haze ON the horizon. Graded rather than a flat strip: a hard-edged
    // band punched a visible pale rectangle through the tree wall on Route B.
    const band = new Graphics();
    const bh = view.h * 0.13;
    const steps = 16;
    for (let i = 0; i < steps; i++) {
      const u = i / (steps - 1);
      // Symmetric falloff to zero at both edges — any hard edge here reads as a
      // pale rule ruled across the sky, which is worse than no haze at all.
      const a = Math.max(0, 0.45 * (1 - Math.pow(Math.abs(u - 0.45) / 0.55, 1.6)));
      band.rect(0, horizonY - bh * 0.5 + (bh * i) / steps, view.w, bh / steps + 1.5)
        .fill({ color: haze, alpha: a });
    }
    this.farLine.addChild(band);
    // A ragged distant tree line. Evenly-spaced identical trees read as
    // wallpaper, so height, spacing and haze all vary per tree.
    const n = 26;
    const shift = -camLat * 26;
    for (let i = 0; i < n; i++) {
      const j = (i * 7919) % 101;
      const tex = j % 2 ? this.kit.props.tree2 : this.kit.props.tree1;
      const jitter = ((j % 17) / 17 - 0.5) * (view.w / n) * 1.5;
      const x = ((i + 0.5) / n) * view.w * 1.45 - view.w * 0.22 + shift + jitter;
      const h = view.h * (0.036 + (j % 23) / 420);
      const s = this.place(tex, h, x, horizonY + 4 + (j % 5), j % 3 === 0, tint, 0.42 + (j % 7) / 40);
      this.farLine.addChild(s);
      this.sprites++;
    }
  }

  // ── Path ─────────────────────────────────────────────────────────
  private paintPath(route: RouteDef, p: number, camLat: number, cam: CameraOpts, view: Viewport): void {
    this.path.clear();
    const ribbon = pathRibbon(route, p, camLat, cam, view);
    if (ribbon.length < 2) return;
    // Draw far → near as quads so the surface can shade along its length.
    for (let i = 0; i < ribbon.length - 1; i++) {
      const a = ribbon[i];
      const b = ribbon[i + 1];
      const shade = Math.min(1, Math.max(0, b.left.k / 0.7));
      this.path
        .poly([
          a.left.x, a.left.y, a.right.x, a.right.y,
          b.right.x, b.right.y, b.left.x, b.left.y,
        ])
        .fill(lerp(route.palette.pathFar, route.palette.pathNear, shade));
    }
    // Soft edge so the path meets the grass instead of being die-cut.
    for (const side of ["left", "right"] as const) {
      const pts: number[] = [];
      for (const seg of ribbon) pts.push(seg[side].x, seg[side].y);
      if (pts.length >= 6) {
        this.path.poly(pts, false).stroke({
          width: Math.max(1.5, view.w * 0.004),
          color: route.palette.pathNear,
          alpha: 0.5,
        });
      }
    }
  }

  // ── Corridor props + destination + avatar, one sorted pass ───────
  private paintDepthLayer(
    route: RouteDef, p: number, camLat: number, cam: CameraOpts, view: Viewport, pose: AvatarPose,
  ): void {
    const avZ = avatarZ(cam);
    const dest = destinationAt(route, p, camLat, cam, view);
    const av = avatarAt(route, p, this.opts.steer);
    const avAt = project(av.t, av.lateral, p, camLat, cam, view);
    const avPx = pxSize(0.58, avAt.k, cam, view);

    type Item = { z: number; make: () => Container | Sprite };
    const items: Item[] = [];

    for (const { prop, at, px } of drawOrder(route, p, camLat, cam, view)) {
      // Aerial perspective: distant props wash toward the haze colour.
      const hazeMix = Math.min(0.55, Math.max(0, (at.z - 5) / 26));
      const tint = prop.tint ?? (hazeMix > 0.02 ? lerp(0xffffff, route.palette.hazeFar, hazeMix) : undefined);
      const fade = nearFade(at.z, avZ);
      if (fade <= 0.01) continue;
      items.push({
        z: at.z,
        make: () => this.place(this.kit.props[prop.kind], px, at.x, at.y, prop.flip, tint, fade),
      });
    }

    if (dest.at.visible && dest.reveal > 0.001) {
      const hazeMix = Math.min(0.5, Math.max(0, (dest.at.z - 5) / 26));
      items.push({
        z: dest.at.z,
        make: () => {
          const s = this.place(
            this.kit.destination, dest.px, dest.at.x, dest.at.y, false,
            lerp(0xffffff, route.palette.hazeFar, hazeMix), dest.reveal,
          );
          return s;
        },
      });
    }

    if (pose !== "none" && avAt.visible) {
      items.push({
        z: avAt.z,
        make: () => {
          const c = new Container();
          // Contact shadow, so the avatar stands on the path rather than on air.
          const sh = new Graphics();
          sh.ellipse(0, 0, avPx * 0.3, avPx * 0.075).fill({ color: 0x23201c, alpha: 0.22 });
          c.addChild(sh);
          c.addChild(
            pose === "back"
              ? buildBackPoseStandIn(avPx)
              : this.place(this.kit.ollie, avPx, 0, 0),
          );
          c.position.set(avAt.x, avAt.y);
          return c;
        },
      });
    }

    items.sort((a, b) => b.z - a.z);
    for (const it of items) {
      this.depth.addChild(it.make());
      this.sprites++;
    }
  }

  // ── Screen-edge framing ──────────────────────────────────────────
  private paintFraming(route: RouteDef, view: Viewport, camLat: number): void {
    for (const f of route.framing as readonly FramingProp[]) {
      const s = this.place(
        this.kit.props[f.kind],
        frameUnit(view) * f.hFrac,
        f.ax * view.w - camLat * f.parallax,
        f.ay * view.h,
        f.flip,
        f.tint,
        f.alpha,
      );
      this.framing.addChild(s);
      this.sprites++;
    }
  }

  // ── HUD (POC only) ───────────────────────────────────────────────
  private paintHud(view: Viewport, route: RouteDef, p: number): void {
    this.hud.visible = this.opts.hud;
    if (!this.opts.hud) return;
    const pct = Math.round(p * 100);
    this.hudText.text = `${route.name}  ·  ${pct}% there  ·  ${route.blurb}`;
    this.hudText.style = {
      fontFamily: '"Trebuchet MS", system-ui, sans-serif',
      fontSize: Math.max(12, Math.min(18, view.w / 52)),
      fontWeight: "800",
      fill: 0xfffaf0,
      stroke: { color: 0x23201c, width: 4 },
    };
    this.hudText.position.set(14, 12);
  }

  destroy(): void {
    this.app.destroy(true, { children: true });
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
