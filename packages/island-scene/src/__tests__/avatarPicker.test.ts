import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  AVATARS,
  CORE_AVATARS,
  LEGACY_AVATARS,
  avatarByKey,
  avatarFileUrl,
  avatarImageUrl,
  isCoreAvatar,
} from "../render/avatarCatalog";
import {
  CARD_ASPECT,
  CARD_ASPECT_MAX,
  minCardW,
  pickerLayout,
} from "../render/avatarPickerLayout";

/**
 * The six-friend avatar picker.
 *
 * Pins the product decision that the PRIMARY picker shows exactly six core
 * Island Friends — not the old 16-animal wall — while the ten legacy
 * characters stay resolvable by key so existing saved selections survive.
 * Also pins the responsive rule that replaced the fixed 4x4 grid.
 */

const PUBLIC_DIR = join(__dirname, "../../public");
const KEYS = CORE_AVATARS.map((a) => a.key);

describe("core roster", () => {
  it("is exactly the six Island Friends, in mockup order", () => {
    expect(KEYS).toEqual(["otter", "dog", "cat", "bunny", "deer", "red_panda"]);
    expect(CORE_AVATARS.map((a) => a.name)).toEqual([
      "Ollie the Otter",
      "Doug the Dog",
      "Matt the Cat",
      "Sunny the Bunny",
      "Daisy the Deer",
      "Remy the Red Panda",
    ]);
  });

  it("reuses the ORIGINAL keys, so saved selections still resolve", () => {
    // These six keys all existed in the 16-animal catalog. Changing one would
    // silently reset every child who had picked that animal.
    for (const key of KEYS) {
      expect(avatarByKey(key), key).toBeTruthy();
      expect(isCoreAvatar(key), key).toBe(true);
    }
  });

  it("resolves core keys to the NEW art, not the legacy file", () => {
    for (const a of CORE_AVATARS) {
      expect(avatarImageUrl(a.key), a.key).toBe(avatarFileUrl(a.file));
      expect(a.file, a.key).toMatch(/^core\/.+\.webp$/);
    }
  });

  it("ships all six production images, and no source PNG in public/", () => {
    for (const a of CORE_AVATARS) {
      expect(existsSync(join(PUBLIC_DIR, "avatars", a.file)), a.file).toBe(true);
    }
    // The ~6.5 MB approved originals live in tools/island-art/source and must
    // never be served: anything ending .png under public/avatars/core would be
    // a source file that leaked into the runtime download.
    const shipped = readdirSync(join(PUBLIC_DIR, "avatars", "core"));
    expect(shipped.filter((f) => f.endsWith(".png"))).toEqual([]);
    expect(shipped.sort()).toEqual(
      CORE_AVATARS.map((a) => a.file.replace("core/", "")).sort(),
    );
  });

  it("keeps the six production avatars under the delivery budget", () => {
    // Guards the optimisation: the sources total ~6.5 MB and would otherwise
    // creep back in via a careless art drop.
    const bytes = CORE_AVATARS.reduce(
      (n, a) => n + statSync(join(PUBLIC_DIR, "avatars", a.file)).size,
      0,
    );
    expect(bytes, `${(bytes / 1024).toFixed(0)} KB`).toBeLessThan(1.5 * 1024 * 1024);
  });

  it("gives every friend exactly three traits", () => {
    for (const a of CORE_AVATARS) {
      expect(a.traits, a.key).toHaveLength(3);
      for (const t of a.traits!) expect(t.length, `${a.key} "${t}"`).toBeGreaterThan(2);
    }
  });

  it("keeps the ten legacy characters resolvable but out of the picker", () => {
    expect(LEGACY_AVATARS).toHaveLength(10);
    expect(AVATARS).toHaveLength(16);
    for (const a of LEGACY_AVATARS) {
      expect(isCoreAvatar(a.key), a.key).toBe(false);
      expect(avatarByKey(a.key), a.key).toBeTruthy();
      expect(existsSync(join(PUBLIC_DIR, "avatars", a.file)), a.file).toBe(true);
    }
    // No key collides: a core key must never fall through to a legacy entry.
    const keys = AVATARS.map((a) => a.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("URL-encodes filenames without mangling the core/ folder separator", () => {
    expect(avatarFileUrl("core/ollie-the-otter.webp")).toContain("/core/ollie-the-otter.webp");
    expect(avatarFileUrl("Polar Bear.webp")).toContain("Polar%20Bear.webp");
  });
});

describe("responsive picker layout", () => {
  const CASES: [string, number, number][] = [
    ["desktop", 1440, 900],
    ["desktop 1080p", 1920, 1080],
    ["laptop", 1280, 800],
    ["tablet landscape", 1366, 1024],
    ["tablet portrait", 1024, 1366],
    ["ipad portrait", 768, 1024],
    ["phone portrait", 390, 844],
    ["small phone portrait", 360, 640],
    ["phone landscape", 844, 390],
    ["ultrawide", 2560, 1080],
  ];

  it.each(CASES)("%s: cards stay tappable and on screen", (name, w, h) => {
    const L = pickerLayout(KEYS, w, h);
    expect(L.cards, name).toHaveLength(6);
    expect(L.cardW, `${name} cardW`).toBeGreaterThanOrEqual(minCardW(h));
    for (const c of L.cards) {
      expect(c.x, `${name} ${c.key} left`).toBeGreaterThanOrEqual(0);
      expect(c.x + c.w, `${name} ${c.key} right`).toBeLessThanOrEqual(w + 0.001);
      // Cards grow taller (never wider) into spare vertical room.
      expect(c.h / c.w, `${name} ${c.key} aspect`).toBeGreaterThanOrEqual(CARD_ASPECT - 1e-6);
      expect(c.h / c.w, `${name} ${c.key} aspect`).toBeLessThanOrEqual(CARD_ASPECT_MAX + 1e-6);
    }
    // Never horizontally offset — the picker scrolls vertically or not at all.
    expect(L.viewport.w, `${name} viewport`).toBe(w);
  });

  it("never overlaps two cards, at any viewport", () => {
    for (const [name, w, h] of CASES) {
      const { cards } = pickerLayout(KEYS, w, h);
      for (let i = 0; i < cards.length; i++) {
        for (let j = i + 1; j < cards.length; j++) {
          const a = cards[i], b = cards[j];
          const apart =
            a.x + a.w <= b.x + 0.001 || b.x + b.w <= a.x + 0.001 ||
            a.y + a.h <= b.y + 0.001 || b.y + b.h <= a.y + 0.001;
          expect(apart, `${name}: ${a.key} vs ${b.key}`).toBe(true);
        }
      }
    }
  });

  it("puts all six across on desktop and landscape, without scrolling", () => {
    for (const [name, w, h] of [
      ["desktop", 1440, 900], ["desktop 1080p", 1920, 1080],
      ["laptop", 1280, 800], ["tablet landscape", 1366, 1024],
      // A short landscape phone takes smaller cards rather than a long scroll.
      ["phone landscape", 844, 390],
    ] as [string, number, number][]) {
      const L = pickerLayout(KEYS, w, h);
      expect(L.cols, name).toBe(6);
      expect(L.rows, name).toBe(1);
      expect(L.scrolls, name).toBe(false);
    }
  });

  it("uses 3x2 on portrait tablets, with bigger cards than 6-across would give", () => {
    for (const [name, w, h] of [
      ["tablet portrait", 1024, 1366], ["ipad portrait", 768, 1024],
    ] as [string, number, number][]) {
      const L = pickerLayout(KEYS, w, h);
      expect(L.cols, name).toBe(3);
      expect(L.rows, name).toBe(2);
      expect(L.scrolls, name).toBe(false);
    }
  });

  it("uses two columns on a phone rather than six tiny cards", () => {
    for (const [name, w, h] of [
      ["phone portrait", 390, 844], ["small phone", 360, 640],
    ] as [string, number, number][]) {
      const L = pickerLayout(KEYS, w, h);
      expect(L.cols, name).toBe(2);
      expect(L.rows, name).toBe(3);
      // Vertical scrolling is acceptable here; horizontal never is.
      expect(L.cardW, `${name} cardW`).toBeGreaterThanOrEqual(minCardW(h));
    }
  });

  it("prefers the biggest cards among arrangements that fit", () => {
    // 1024x1366 fits both 6-across and 3x2; 3x2 must win because its cards are
    // larger. This is the rule that keeps characters readable on tablets.
    const L = pickerLayout(KEYS, 1024, 1366);
    const sixAcross = (1024 - Math.max(14, 1024 * 0.035) * 2 - 14 * 5) / 6;
    expect(L.cardW).toBeGreaterThan(sixAcross);
  });

  it("keeps the Continue button large and fully on screen", () => {
    for (const [name, w, h] of CASES) {
      const { continueRect: r, viewport } = pickerLayout(KEYS, w, h);
      expect(r.h, `${name} height`).toBeGreaterThanOrEqual(56);
      expect(r.x, `${name} left`).toBeGreaterThanOrEqual(0);
      expect(r.x + r.w, `${name} right`).toBeLessThanOrEqual(w + 0.001);
      expect(r.y + r.h, `${name} bottom`).toBeLessThanOrEqual(h + 0.001);
      // and never sits on top of the cards
      expect(r.y, `${name} clears cards`).toBeGreaterThanOrEqual(viewport.y + viewport.h - 0.001);
    }
  });

  it("centres a short final row instead of leaving it ragged", () => {
    const L = pickerLayout(["a", "b", "c", "d"], 1024, 1366); // 3 cols, 4 items
    const lastRow = L.cards.filter((c) => c.y > 0);
    expect(lastRow).toHaveLength(1);
    expect(lastRow[0].x + lastRow[0].w / 2).toBeCloseTo(1024 / 2, 3);
  });
});
