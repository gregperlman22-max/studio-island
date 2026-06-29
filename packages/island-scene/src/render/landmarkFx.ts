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
/** Channel-wise lerp between two 0xRRGGBB colors (for the arcade tint wash). */
function lerpColor(a: number, b: number, t: number): number {
  const r = Math.round(lerp((a >> 16) & 0xff, (b >> 16) & 0xff, t));
  const g = Math.round(lerp((a >> 8) & 0xff, (b >> 8) & 0xff, t));
  const bl = Math.round(lerp(a & 0xff, b & 0xff, t));
  return (r << 16) | (g << 8) | bl;
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
      // Warm firelight ONLY — a soft inner glow breathing over the embers plus a
      // larger, fainter wash pulsing out of phase. No code-drawn flame/diamond
      // icon: the painted campfire PNG provides the fire itself, so we add the
      // ambient glow and nothing else.
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
      // Chimney smoke ONLY — the flat painted hut never sways/rotates. Soft grey
      // puffs rise from the single chimney-top point (−18,−85). A fresh puff is
      // emitted every 1.4s; each lives 2.5s, so up to two overlap in the air.
      const ox = -18, oy = -85;
      const PUFF = 40;    // puff diameter (px) at scale 1.0
      const LIFE = 2.5;   // seconds a puff lives (fade 0.65 → 0)
      const EMIT = 1.4;   // one new puff every 1.4s
      const N = 3;        // pool large enough for the overlap (ceil(LIFE/EMIT)+1)
      const puffs: { s: Sprite; age: number; jx: number }[] = [];
      for (let i = 0; i < N; i++) {
        const s = glow(0xdddddd, PUFF); s.alpha = 0; fx.addChild(s);
        puffs.push({ s, age: LIFE, jx: 0 }); // start inactive
      }
      let emitClock = EMIT; // emit one immediately on the first tick
      ups.push((_t, dt) => {
        emitClock += dt;
        if (emitClock >= EMIT) {
          emitClock -= EMIT;
          const free = puffs.find((p) => p.age >= LIFE);
          if (free) { free.age = 0; free.jx = (Math.random() - 0.5) * 10; }
        }
        for (const p of puffs) {
          if (p.age >= LIFE) { p.s.alpha = 0; continue; }
          p.age += dt;
          const f = p.age / LIFE;
          const sc = lerp(0.35, 1.2, f); // scale 0.35 → 1.2
          p.s.position.set(ox + p.jx * f, oy - 55 * f); // drift up ~55px
          p.s.width = p.s.height = PUFF * sc;
          p.s.alpha = 0.65 * (1 - f); // fade 0.65 → 0
        }
      });
      break;
    }

    case "lighthouse_point": {
      // Lamp-housing glow only, pinned to the lamp room at the VERY TOP of the
      // tower (+5,−155) where the painted beam originates — not mid-tower. The
      // beam is painted into the sprite; no rotating cone / overlay beam here. A
      // bright warm lamp pulse: a soft outer halo plus a tighter, brighter core.
      const outer = glow(0xffcc44, 88); outer.position.set(5, -155); fx.addChild(outer); // radius 44
      const lamp = glow(0xffee88, 52); lamp.position.set(5, -155); fx.addChild(lamp); // radius 26
      ups.push((t) => {
        const s = 0.5 + 0.5 * Math.sin(t * (TAU / 1.6)); // 1.6s period
        lamp.alpha = 0.50 + 0.45 * s;  // 0.50 → 0.95
        outer.alpha = 0.20 + 0.20 * s; // 0.20 → 0.40
      });
      break;
    }

    case "arcade_cove": {
      // A gentle screen-cast tint cycle washed directly over the cabinet SPRITE
      // (no extra graphics / particles) — it reads as the arcade screen casting
      // soft colored light on the cabinet. White → soft blue → soft pink → warm
      // yellow → white, one full loop every 4s, smoothly lerped, always kept
      // subtle so the sprite still looks like itself. Plus the bunting flutter.
      const TINTS = [0xffffff, 0xadd8ff, 0xffb3d9, 0xffeda0];
      const TINT_CYCLE = 4; // seconds for a full color loop
      ups.push((t) => {
        const u = ((t % TINT_CYCLE) / TINT_CYCLE) * TINTS.length; // 0 → 4
        const i = Math.floor(u) % TINTS.length;
        const frac = 0.5 - 0.5 * Math.cos((u - Math.floor(u)) * Math.PI); // smooth lerp
        sprite.tint = lerpColor(TINTS[i], TINTS[(i + 1) % TINTS.length], frac);
      });
      // Bunting flutter, just above the marquee.
      const flags: Graphics[] = [];
      const flagCols = [0xf6c945, 0xef8aa0, 0x8fc7e8, 0xf0b86a];
      for (let i = 0; i < 4; i++) {
        const f = new Graphics();
        f.poly([-7, 0, 7, 0, 0, 11]).fill(flagCols[i % flagCols.length]).stroke({ width: 1, color: 0x000000, alpha: 0.13 });
        f.position.set(-48 + i * 32, -104);
        fx.addChild(f); flags.push(f);
      }
      ups.push((t) => {
        for (let i = 0; i < flags.length; i++) {
          flags[i].y = -104 + Math.sin(t * (TAU / 2.5) + i * 0.7) * 3;
        }
      });
      break;
    }

    case "star_market": {
      // Rising golden stars ONLY — the flat painted stall never sways/rotates.
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

    // lazy_lagoon has no in-container effect — the periodic fish jump (with its
    // own splash + entry ripple) lives at the PARENT scene-container level (see
    // buildFishFx) so it renders above the flat lagoon sprite and is never
    // clipped. It falls through to `default` (returns undefined) below.

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

/**
 * Periodic fish jump at the Lazy Lagoon water surface. Built at the PARENT
 * scene-container level (the renderer's `entities` layer) rather than inside the
 * lagoon's own container — so it y-sorts independently and renders ABOVE the
 * flat lagoon sprite, never clipped or occluded. The renderer adds the returned
 * container to `entities` at the lagoon WORLD position (footprint centre), sets
 * its own zIndex, and drives `animate(t)` from the same ticker as the
 * in-container effects (absolute elapsed seconds).
 *
 * Every ~7–8s a hand-drawn fish arcs out of the water: it rises from below the
 * surface over 0.6s (rotating to follow the arc), throws a tiny splash at the
 * peak, descends over 0.4s, and leaves a single expanding ripple ring at the
 * entry point. The fish is hidden below the surface between jumps.
 */
export function buildFishFx(
  worldX: number,
  worldY: number,
): { container: Container; animate: (t: number) => void } {
  const fx = new Container();
  fx.eventMode = "none";
  // Jump origin: over the painted water, (+5,−10) from the lagoon anchor.
  fx.position.set(worldX + 5, worldY - 10);

  // ── Fish: a blue-grey body ellipse (14×7) with a small triangular tail flick
  //    behind it. Drawn nose-toward +x so rotation can follow the arc heading.
  const fish = new Container();
  const body = new Graphics();
  body.ellipse(0, 0, 7, 3.5).fill(0x4a90d9); // 14px × 7px
  const tail = new Graphics();
  tail.poly([-6, 0, -13, -4.5, -13, 4.5]).fill(0x4a90d9); // tail flick behind the body
  fish.addChild(tail, body);
  fish.visible = false;
  fx.addChild(fish);

  // ── Splash: 4 tiny white circles that expand outward + fade over 0.3s. ──
  const splash = new Container();
  const drops: Graphics[] = [];
  for (let i = 0; i < 4; i++) {
    const g = new Graphics();
    g.circle(0, 0, 3).fill(0xffffff);
    splash.addChild(g); drops.push(g);
  }
  splash.alpha = 0;
  fx.addChild(splash);

  // ── Entry ripple: a single expanding outline ring (5px → 30px) at the spot
  //    where the fish re-enters the water, fading 0.8 → 0 over 1.0s. ──
  const ripple = new Graphics();
  ripple.alpha = 0;
  fx.addChild(ripple);

  const BELOW = 20;   // fish y below the surface (start + end, hidden)
  const PEAK = -45;   // fish y at the apex (above the surface)
  const RISE = 0.6;   // seconds rising to the peak
  const FALL = 0.4;   // seconds falling back below
  const ACTIVE = RISE + FALL; // 1.0s of visible jump per cycle
  const TAU = Math.PI * 2;

  let lastT = -1;
  let clock = 0, cycle = 7 + Math.random();   // 7–8s between jumps
  let prevY = BELOW, prevX = 0;
  let splashT = -1, splashX = 0;               // <0 = inactive
  let rippleT = -1, rippleX = 0;               // <0 = inactive

  const animate = (t: number) => {
    const dt = lastT < 0 ? 0 : Math.min(0.06, t - lastT);
    lastT = t;
    const wasClock = clock;
    clock += dt;
    if (clock >= cycle) { clock -= cycle; cycle = 7 + Math.random(); prevX = -12; prevY = BELOW; }
    const p = clock;

    // Splash fires the moment the fish reaches the apex (p crosses RISE).
    if (p >= RISE && wasClock < RISE) { splashT = 0; splashX = lerp(-12, 12, RISE / ACTIVE); }

    if (p < ACTIVE) {
      fish.visible = true;
      const prog = p / ACTIVE;
      const x = lerp(-12, 12, prog); // gentle horizontal travel across the arc
      let y: number;
      if (p < RISE) {
        const a = p / RISE;
        y = BELOW + (PEAK - BELOW) * (1 - (1 - a) * (1 - a)); // ease-out toward the peak
      } else {
        const b = (p - RISE) / FALL;
        y = PEAK + (BELOW - PEAK) * b * b;                    // ease-in back down
      }
      fish.position.set(x, y);
      fish.rotation = Math.atan2(y - prevY, (x - prevX) || 1e-3); // nose follows velocity
      // Entry ripple fires as the fish crosses the surface (y = 0) on the way down.
      if (p > RISE && prevY < 0 && y >= 0) { rippleT = 0; rippleX = x; }
      prevX = x; prevY = y;
    } else {
      fish.visible = false;
    }

    // Splash animation — drops fly outward and fade over 0.3s.
    if (splashT >= 0) {
      splashT += dt;
      const f = splashT / 0.3;
      if (f >= 1) { splash.alpha = 0; splashT = -1; }
      else {
        splash.position.set(splashX, PEAK);
        splash.alpha = 1 - f;
        for (let i = 0; i < drops.length; i++) {
          const ang = (i / drops.length) * TAU;
          const rad = lerp(0, 9, f);
          drops[i].position.set(Math.cos(ang) * rad, Math.sin(ang) * rad - 3 * f);
        }
      }
    }

    // Entry ripple — a single ring expanding 5 → 30px, fading 0.8 → 0 over 1.0s.
    if (rippleT >= 0) {
      rippleT += dt;
      const f = rippleT / 1.0;
      if (f >= 1) { ripple.alpha = 0; rippleT = -1; }
      else {
        ripple.alpha = 1;
        ripple.clear();
        ripple.circle(rippleX, 0, lerp(5, 30, f)).stroke({ width: 1.5, color: 0x7ec8e3, alpha: 0.8 * (1 - f) });
      }
    }
  };

  return { container: fx, animate };
}
