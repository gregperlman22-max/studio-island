import { Container, Graphics } from "pixi.js";
import type {
  AccessoryKey,
  AvatarConfig,
  BodyTone,
  HairStyle,
  OutfitKey,
} from "../types";
import { hexNum, shade } from "./iso";

/**
 * Programmatic layered avatar compositor. Stacks layers bottom-to-top in the
 * contract order: body → outfit → hair → accessory → displayColor ring.
 *
 * Origin (0,0) is the avatar's feet (ground contact), art drawn upward in
 * negative-y, so the renderer can place it at a tile center and y-sort it.
 * Everything is Pixi Graphics so a later phase can swap these for atlas
 * sprites behind the same builder without touching scene logic.
 */

const SKIN: Record<BodyTone, string> = {
  "warm-light": "#f2c79a",
  "warm-mid": "#d89a63",
  "warm-deep": "#8a5a36",
  "cool-light": "#ecc6ac",
  "cool-mid": "#b98a6a",
  "cool-deep": "#6f4a32",
};

const OUTFIT: Record<OutfitKey, { base: string; trim: string }> = {
  stripes: { base: "#e86a6a", trim: "#ffffff" },
  overalls: { base: "#4f7fb8", trim: "#3a5f8a" },
  tunic: { base: "#7ba05b", trim: "#5d7a42" },
  raincoat: { base: "#f4c430", trim: "#d9a400" },
};

const ACCESSORY_COLOR: Record<Exclude<AccessoryKey, "none">, string> = {
  satchel: "#9b6b3f",
  headband: "#ef6ea0",
  scarf: "#5ec3c9",
};

export interface AvatarSprite {
  container: Container;
  /** Selection ring toggled when this is the local / focused avatar. */
  setSelected: (selected: boolean) => void;
}

export function buildAvatarSprite(config: AvatarConfig): AvatarSprite {
  const container = new Container();

  // Ground contact shadow.
  const shadow = new Graphics();
  shadow.ellipse(0, 0, 10, 4).fill({ color: 0x000000, alpha: 0.22 });
  container.addChild(shadow);

  // Selection ring in the avatar's display color (under the body).
  const ring = new Graphics();
  ring
    .ellipse(0, -1, 12, 5)
    .stroke({ width: 2, color: hexNum(config.displayColor), alpha: 0.9 });
  ring.visible = false;
  container.addChild(ring);

  // ── body (skin base: legs, torso, head, ears) ──
  const skin = hexNum(SKIN[config.bodyTone]);
  const skinShade = shade(SKIN[config.bodyTone], -0.18);
  const body = new Graphics();
  // legs
  body.roundRect(-5, -9, 4, 9, 2).fill(skinShade);
  body.roundRect(1, -9, 4, 9, 2).fill(skinShade);
  // torso
  body.roundRect(-6, -22, 12, 14, 5).fill(skin);
  // head
  body.circle(0, -28, 6).fill(skin);
  container.addChild(body);

  // ── outfit (over torso) ──
  container.addChild(buildOutfit(config.outfitKey));

  // ── hair (over head, tinted hairColor) ──
  container.addChild(buildHair(config.hairStyle, config.hairColor));

  // ── accessory ──
  if (config.accessoryKey !== "none") {
    container.addChild(buildAccessory(config.accessoryKey));
  }

  // face: simple eyes so the avatar reads as a character.
  const face = new Graphics();
  face.circle(-2.2, -28.5, 0.9).fill(0x2a2a2a);
  face.circle(2.2, -28.5, 0.9).fill(0x2a2a2a);
  container.addChild(face);

  return {
    container,
    setSelected: (selected: boolean) => {
      ring.visible = selected;
    },
  };
}

function buildOutfit(key: OutfitKey): Graphics {
  const g = new Graphics();
  const c = OUTFIT[key];
  const base = hexNum(c.base);
  const trim = hexNum(c.trim);
  // Garment over the torso.
  g.roundRect(-6, -21, 12, 13, 5).fill(base);

  switch (key) {
    case "stripes":
      g.rect(-6, -18, 12, 2).fill({ color: trim, alpha: 0.9 });
      g.rect(-6, -13, 12, 2).fill({ color: trim, alpha: 0.9 });
      break;
    case "overalls":
      g.rect(-4, -21, 2, 9).fill(trim);
      g.rect(2, -21, 2, 9).fill(trim);
      g.roundRect(-5, -16, 10, 6, 2).fill({ color: trim, alpha: 0.6 });
      break;
    case "tunic":
      g.moveTo(0, -21).lineTo(0, -9).stroke({ width: 1.5, color: trim, alpha: 0.8 });
      break;
    case "raincoat":
      g.roundRect(-6.5, -24, 13, 6, 3).fill(base); // hood
      g.roundRect(-6, -21, 12, 13, 5).stroke({ width: 1.5, color: trim, alpha: 0.8 });
      break;
  }
  return g;
}

function buildHair(style: HairStyle, color: string): Graphics {
  const g = new Graphics();
  const c = hexNum(color);
  const dark = shade(color, -0.2);
  switch (style) {
    case "tuft":
      g.ellipse(0, -33, 6.5, 4).fill(c);
      g.ellipse(0, -35, 2.2, 3).fill(c);
      break;
    case "braid":
      g.ellipse(0, -33, 6.5, 4).fill(c);
      g.roundRect(5, -32, 3, 12, 1.5).fill(c);
      g.circle(6.5, -22, 2).fill(dark);
      break;
    case "swoop":
      g.ellipse(0, -33, 6.8, 4.2).fill(c);
      g.moveTo(-6, -32).quadraticCurveTo(-9, -27, -5, -26).fill(c);
      break;
  }
  return g;
}

function buildAccessory(key: Exclude<AccessoryKey, "none">): Graphics {
  const g = new Graphics();
  const c = hexNum(ACCESSORY_COLOR[key]);
  switch (key) {
    case "satchel":
      g.moveTo(-6, -21).lineTo(6, -13).stroke({ width: 1.5, color: c, alpha: 0.9 });
      g.roundRect(4, -14, 6, 6, 2).fill(c);
      break;
    case "headband":
      g.roundRect(-6.5, -31, 13, 2.5, 1).fill(c);
      break;
    case "scarf":
      g.roundRect(-6, -23, 12, 3, 1.5).fill(c);
      g.roundRect(-2, -22, 3, 7, 1.5).fill(c);
      break;
  }
  return g;
}
