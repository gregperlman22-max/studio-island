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
      // No flame icon — the campfire is now pure warm firelight: a soft inner
      // glow breathing over the embers, plus a larger, fainter wash pulsing out
      // of phase so the light feels like it's alive.
      const PERIOD = 1.8;
      const inner = glow(0xff6600, 160); inner.position.set(0, -10); // radius ~80
      const outer = glow(0xff4400, 280); outer.position.set(0, -10); // radius ~140
      fx.addChild(outer, inner); // inner draws on top of the wider wash
      ups.push((t) => {
        const s = 0.5 + 0.5 * Math.sin(t * (TAU / PERIOD));
        inner.alpha = 0.10 + 0.15 * s; // 0.10 → 0.25
        const s2 = 0.5 + 0.5 * Math.sin((t - 0.9) * (TAU / PERIOD)); // +0.9s = antiphase
        outer.alpha = 0.03 + 0.05 * s2; // 0.03 → 0.08
      });
      break;
    }

    case "art_hut": {
      // Chimney smoke: small grey puffs rising from the single chimney-top
      // point (−18,−85) only — no longer drifting off the whole building.
      const ox = -18, oy = -85;
      const PUFF = 40; // puff diameter (px) at scale 1.0
      const N = 3, puffs: { s: Sprite; age: number; jx: number }[] = [];
      for (let i = 0; i < N; i++) {
        const s = glow(0xcccccc, PUFF); s.alpha = 0; fx.addChild(s);
        puffs.push({ s, age: 2.5 - (i * 2.5) / N, jx: 0 }); // staggered
      }
      ups.push((_t, dt) => {
        for (const p of puffs) {
          p.age += dt;
          if (p.age >= 2.5) { p.age = 0; p.jx = (Math.random() - 0.5) * 10; }
          const f = p.age / 2.5;
          const sc = lerp(0.2, 0.8, f); // start scale 0.2, grow to 0.8 max
          p.s.position.set(ox + p.jx * f, oy - 45 * f);
          p.s.width = p.s.height = PUFF * sc;
          p.s.alpha = 0.5 * (1 - f);
        }
      });
      // Gentle whole-sprite breeze (the easel can't be isolated from the PNG).
      ups.push((t) => { sprite.rotation = Math.sin(t * (TAU / 4)) * 0.009; });
      break;
    }

    case "lighthouse_point": {
      // Lamp-housing glow only. The beam is painted into the sprite — no
      // rotating cone / overlay beam here. Just a warm light breathing on.
      const lamp = glow(0xffee88, 32); lamp.position.set(5, -125); fx.addChild(lamp); // radius 16
      ups.push((t) => {
        const s = 0.5 + 0.5 * Math.sin(t * (TAU / 1.8)); // ~1.8s period
        lamp.alpha = 0.25 + 0.45 * s; // 0.25 → 0.70
      });
      break;
    }

    case "arcade_cove": {
      // Festive party/string lights strung ABOVE the cabinet (no screen glow):
      // 5 warm bulbs in a gentle arc, each pulsing independently with a slight
      // stagger. The bunting flutter below is kept.
      const BULB_COLORS = [0xff6b6b, 0xffd93d, 0x6bcb77, 0x4d96ff, 0xff6ba8];
      const SPAN = 80, BULBS = 5;
      const lights: Graphics[] = [];
      for (let i = 0; i < BULBS; i++) {
        const g = new Graphics();
        g.circle(0, 0, 5).fill(BULB_COLORS[i]);
        const nx = i / (BULBS - 1) - 0.5;        // -0.5 … 0.5 across the arc
        const sag = 8 * (1 - (nx * 2) * (nx * 2)); // gentle sag, 0 at ends → 8 mid
        g.position.set(nx * SPAN, -75 + sag);     // centered at (0,−75)
        fx.addChild(g); lights.push(g);
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
        for (let i = 0; i < lights.length; i++) {
          const s = 0.5 + 0.5 * Math.sin(((t - i * 0.25) / 1.2) * TAU); // ~1.2s, staggered 0.25s
          lights[i].alpha = 0.3 + 0.7 * s; // 0.3 → 1.0
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
      // The lagoon-01.png is a flat image — never animate the sprite. Just draw
      // ripple rings over its water + an occasional bubble pop.
      const cx = 10, cy = -15;
      const DUR = 2.5;
      const starts = [0, 0.85, 1.7]; // staggered so a ring is always in motion
      const rings = starts.map(() => { const g = new Graphics(); fx.addChild(g); return g; });
      const bub = new Graphics(); bub.circle(0, 0, 3).fill(0xffffff); bub.alpha = 0; fx.addChild(bub);
      let bubAge = 0, bubNext = 5.5;
      ups.push((t, dt) => {
        for (let i = 0; i < rings.length; i++) {
          const p = (((t - starts[i]) / DUR) % 1 + 1) % 1; // 0..1
          const r = lerp(6, 50, p); // expand 6px → 50px
          rings[i].clear();
          rings[i].circle(cx, cy, r).stroke({ width: 1.5, color: 0x7ec8e3, alpha: 0.8 * (1 - p) });
        }
        bubAge += dt;
        if (bubAge >= bubNext) {
          bubAge = 0; bubNext = 5 + Math.random(); // every 5–6s
          bub.position.set(cx + (Math.random() - 0.5) * 40, cy + (Math.random() - 0.5) * 40); // ±20px
        }
        bub.alpha = bubAge < 0.35 ? Math.sin((bubAge / 0.35) * Math.PI) : 0; // 0→1→0 over 0.35s
      });
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
