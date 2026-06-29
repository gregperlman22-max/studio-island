import { Container, Graphics, Sprite, Texture } from "pixi.js";
import type { ZoneKey } from "../types";

/**
 * Ambient "living landmark" effects (Alba-style: soft, warm, organic — never
 * flashy). Each landmark gets one effect Container layered ABOVE its sprite, in
 * zone-local coords where (0,0) is the footprint anchor (the y-sort point) and
 * −y is up. `buildLandmarkFx` returns an `animate(t)` driven by the renderer's
 * ticker (absolute elapsed seconds); it derives its own delta internally.
 *
 * Feature anchor offsets (px from the landmark anchor) are intentionally
 * approximate — these effects are subtle by design.
 */

// ── Soft radial glow texture (white → transparent), built once. ──────
let _glowTex: Texture | null = null;
function glowTexture(): Texture {
  if (_glowTex) return _glowTex;
  if (typeof document === "undefined") { _glowTex = Texture.WHITE; return _glowTex; }
  const S = 128;
  const cnv = document.createElement("canvas");
  cnv.width = cnv.height = S;
  const ctx = cnv.getContext("2d");
  if (!ctx) { _glowTex = Texture.WHITE; return _glowTex; }
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.45, "rgba(255,255,255,0.5)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  _glowTex = Texture.from(cnv);
  return _glowTex;
}

/** A soft round glow sprite, anchored centre, sized by diameter. */
function glow(color: number, diameter: number): Sprite {
  const s = new Sprite(glowTexture());
  s.anchor.set(0.5);
  s.tint = color;
  s.width = s.height = diameter;
  s.eventMode = "none";
  return s;
}

function lerp(a: number, b: number, t: number): number { return a + (b - a) * t; }
function lerpColor(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
  const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
  return (Math.round(lerp(ar, br, t)) << 16) | (Math.round(lerp(ag, bg, t)) << 8) | Math.round(lerp(ab, bb, t));
}
function starPath(R: number, r: number): number[] {
  const p: number[] = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rad = i % 2 ? r : R;
    p.push(Math.cos(a) * rad, Math.sin(a) * rad);
  }
  return p;
}

type Up = (t: number, dt: number) => void;

/**
 * Build the ambient effect layer for a landmark. Returns an animate(t) or
 * undefined (zones with no effect). `sprite` is the landmark sprite (for the
 * few whole-sprite sway/bob effects where a painted part can't be isolated).
 */
export function buildLandmarkFx(
  key: ZoneKey,
  container: Container,
  sprite: Sprite,
): ((t: number) => void) | undefined {
  const fx = new Container();
  fx.eventMode = "none";
  container.addChild(fx);
  const ups: Up[] = [];
  const TAU = Math.PI * 2;

  switch (key) {
    case "campfire_circle": {
      // Warm breathing glow over the (untouched) flame + a wider ground pool.
      const ground = glow(0xff8c00, 320); ground.position.set(0, -2); ground.height = 160;
      const aura = glow(0xff8c00, 200); aura.position.set(0, -20); aura.height = 170;
      fx.addChild(ground, aura);
      ups.push((t) => {
        const s = 0.5 + 0.5 * Math.sin(t * (TAU / 2)); // 2s period
        aura.alpha = 0.08 + 0.12 * s;   // 0.08 → 0.20
        ground.alpha = 0.04 + 0.04 * s; // 0.04 → 0.08
      });
      break;
    }

    case "art_hut": {
      // Chimney smoke puffs (offset (−15,−80)) + a whisper of canvas-breeze sway.
      const ox = -15, oy = -80;
      const N = 3, puffs: { s: Sprite; age: number; jx: number }[] = [];
      for (let i = 0; i < N; i++) {
        const s = glow(0xcccccc, 14); s.alpha = 0; fx.addChild(s);
        puffs.push({ s, age: 2.5 - (i * 2.5) / N, jx: 0 }); // staggered
      }
      ups.push((_t, dt) => {
        for (const p of puffs) {
          p.age += dt;
          if (p.age >= 2.5) { p.age = 0; p.jx = (Math.random() - 0.5) * 10; }
          const f = p.age / 2.5;
          p.s.position.set(ox + p.jx * f, oy - 45 * f);
          p.s.width = p.s.height = lerp(12, 46, f);
          p.s.alpha = 0.5 * (1 - f);
        }
      });
      // Gentle whole-sprite breeze (the easel can't be isolated from the PNG).
      ups.push((t) => { sprite.rotation = Math.sin(t * (TAU / 4)) * 0.009; });
      break;
    }

    case "lighthouse_point": {
      // Rotating beam + ground sweep (one rotating container) + lamp pulse.
      const ox = 5, oy = -140;
      const beamRot = new Container(); beamRot.position.set(ox, oy); fx.addChild(beamRot);
      const sweep = new Graphics();
      sweep.poly([0, -40, 0, 40, 230, 0]).fill({ color: 0xfffacc, alpha: 0.06 });
      const beam = new Graphics();
      beam.poly([0, -11, 0, 11, 130, 0]).fill({ color: 0xfffacc, alpha: 0.35 });
      beamRot.addChild(sweep, beam);
      const lamp = glow(0xffee88, 36); lamp.position.set(ox, oy); fx.addChild(lamp);
      ups.push((t) => {
        beamRot.rotation = t * (TAU / 6); // full turn every 6s
        lamp.alpha = 0.4 + 0.45 * (0.5 + 0.5 * Math.sin(t * (TAU / 1.5))); // 0.40→0.85
      });
      break;
    }

    case "arcade_cove": {
      // Color-cycling screen glow + sequenced marquee twinkle + bunting flutter.
      const screen = glow(0x4fc3f7, 46); screen.position.set(10, -45); screen.alpha = 0.42;
      fx.addChild(screen);
      const cyc = [0x4fc3f7, 0xf06292, 0xaed581];
      const marq = new Container(); fx.addChild(marq);
      const diamonds: Graphics[] = [];
      for (let i = 0; i < 4; i++) {
        const d = new Graphics();
        d.poly([0, -3.5, 3.5, 0, 0, 3.5, -3.5, 0]).fill(0xfff3c4);
        d.position.set(-30 + i * 20, -96);
        marq.addChild(d); diamonds.push(d);
      }
      const flags: Graphics[] = [];
      const flagCols = [0xf6c945, 0xef8aa0, 0x8fc7e8, 0xf0b86a];
      for (let i = 0; i < 4; i++) {
        const f = new Graphics();
        f.poly([-7, 0, 7, 0, 0, 11]).fill(flagCols[i % flagCols.length]).stroke({ width: 1, color: 0x000000, alpha: 0.13 });
        f.position.set(-48 + i * 32, -104);
        fx.addChild(f); flags.push(f);
      }
      ups.push((t) => {
        const phase = (t / 1.5) % cyc.length;
        const i0 = Math.floor(phase), i1 = (i0 + 1) % cyc.length;
        screen.tint = lerpColor(cyc[i0], cyc[i1], phase - i0);
        screen.alpha = 0.40 + 0.06 * (0.5 + 0.5 * Math.sin(t * TAU));
        for (let i = 0; i < diamonds.length; i++) {
          const p = (t / 1.2 + i * 0.25) % 1;
          diamonds[i].alpha = Math.max(0, Math.sin(p * Math.PI));
        }
        for (let i = 0; i < flags.length; i++) {
          flags[i].y = -104 + Math.sin(t * (TAU / 2.5) + i * 0.7) * 3;
        }
      });
      break;
    }

    case "star_market": {
      // Awning breeze sway + rising golden stars.
      ups.push((t) => { sprite.rotation = Math.sin(t * (TAU / 3)) * 0.017; });
      const N = 3, stars: { g: Graphics; age: number; x0: number }[] = [];
      for (let i = 0; i < N; i++) {
        const g = new Graphics();
        g.poly(starPath(6, 2.6)).fill(0xffd700);
        g.alpha = 0; g.scale.set(0.8); fx.addChild(g);
        stars.push({ g, age: 3.4 - (i * 3.4) / N, x0: 0 });
      }
      ups.push((_t, dt) => {
        for (const s of stars) {
          s.age += dt;
          if (s.age >= 3.4) { s.age = 0; s.x0 = (Math.random() - 0.5) * 26; }
          const f = s.age / 2.5;
          if (f >= 1) { s.g.alpha = 0; continue; }
          s.g.position.set(s.x0, -70 - 55 * f);
          s.g.rotation += dt * 0.8;
          s.g.alpha = 0.9 * (1 - f);
        }
      });
      break;
    }

    case "lazy_lagoon": {
      // Concentric ripples + occasional bubble pop + a slow water bob.
      const cx = 15, cy = -20;
      const rings = [0, 1, 2].map(() => { const g = new Graphics(); fx.addChild(g); return g; });
      const bub = new Graphics(); bub.circle(0, 0, 4).fill(0xffffff); bub.alpha = 0; fx.addChild(bub);
      let bubAge = 0, bubNext = 5.5;
      ups.push((t, dt) => {
        for (let i = 0; i < rings.length; i++) {
          const p = ((t / 2.5) + i * (0.8 / 2.5)) % 1;
          const r = lerp(8, 55, p);
          rings[i].clear();
          rings[i].ellipse(cx, cy, r, r * 0.62).stroke({ width: 2, color: 0x7ec8c8, alpha: 1 - p });
        }
        bubAge += dt;
        if (bubAge >= bubNext) {
          bubAge = 0; bubNext = 5 + Math.random() * 1.5;
          bub.position.set(cx + (Math.random() - 0.5) * 180, cy + (Math.random() - 0.5) * 90);
        }
        bub.alpha = bubAge < 0.4 ? Math.sin((bubAge / 0.4) * Math.PI) : 0;
      });
      ups.push((t) => { sprite.position.y = Math.sin(t * (TAU / 4)) * 2; }); // gentle surface bob
      break;
    }

    case "calm_beach": {
      // Umbrella sway (whole sprite — it IS mostly umbrella) + waterline wash.
      ups.push((t) => { sprite.rotation = Math.sin(t * (TAU / 4)) * 0.0436; }); // ±2.5°
      const N = 3, waves: { s: Sprite; age: number }[] = [];
      for (let i = 0; i < N; i++) {
        const s = glow(0xdceff6, 55); s.alpha = 0; fx.addChild(s);
        waves.push({ s, age: 2 - (i * 2) / N });
      }
      ups.push((_t, dt) => {
        for (const w of waves) {
          w.age += dt; if (w.age >= 2) w.age = 0;
          const f = w.age / 2;
          w.s.position.set(-10, 30);
          w.s.width = lerp(55, 95, f);
          w.s.height = lerp(7, 11, f);
          w.s.alpha = 0.5 * (1 - f);
        }
      });
      break;
    }

    case "welcome_dock": {
      // Whole-dock float bob + small ripple rings at two post bases.
      ups.push((t) => { sprite.position.y = Math.sin(t * (TAU / 3)) * 2; });
      const posts = [{ x: -40, y: 12, ph: 0 }, { x: 40, y: 18, ph: 1.0 }];
      const rings = posts.map(() => { const g = new Graphics(); fx.addChild(g); return g; });
      ups.push((t) => {
        for (let i = 0; i < posts.length; i++) {
          const p = ((t + posts[i].ph) / 2) % 1;
          const r = lerp(4, 28, p);
          rings[i].clear();
          rings[i].ellipse(posts[i].x, posts[i].y, r, r * 0.55).stroke({ width: 1.5, color: 0x7ec8c8, alpha: 1 - p });
        }
      });
      break;
    }

    case "treehouse_hideaway": {
      // Drifting leaves from the canopy + warm lamplight in the window.
      const win = glow(0xffe082, 28); win.position.set(20, -90); fx.addChild(win);
      const leafCols = [0x7cb342, 0xaed581, 0xf9a825];
      const N = 4, leaves: { g: Graphics; age: number; x0: number; ph: number; rot: number }[] = [];
      for (let i = 0; i < N; i++) {
        const g = new Graphics();
        g.ellipse(0, 0, 4, 2.5).fill(leafCols[i % leafCols.length]);
        g.alpha = 0; fx.addChild(g);
        leaves.push({ g, age: (i * 2.8) / N, x0: 0, ph: Math.random() * TAU, rot: 0 });
      }
      ups.push((t, dt) => {
        win.alpha = 0.15 + 0.30 * (0.5 + 0.5 * Math.sin(t * (TAU / 2.5))); // 0.15→0.45
        for (const l of leaves) {
          l.age += dt;
          if (l.age >= 2.8) {
            l.age = 0; l.x0 = 20 + (Math.random() - 0.5) * 100; l.ph = Math.random() * TAU;
          }
          const f = l.age / 2.8;
          l.g.position.set(l.x0 + Math.sin(t * 1.5 + l.ph) * 12, -150 + 70 * f);
          l.g.rotation += dt * 0.6;
          l.g.alpha = f < 0.7 ? 1 : 1 - (f - 0.7) / 0.3;
        }
      });
      break;
    }

    default:
      container.removeChild(fx);
      return undefined;
  }

  let last = -1;
  return (t: number) => {
    const dt = last < 0 ? 0 : Math.min(0.06, t - last);
    last = t;
    for (const u of ups) u(t, dt);
  };
}
