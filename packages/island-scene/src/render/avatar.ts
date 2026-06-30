import { Container, Graphics, Sprite, type Texture } from "pixi.js";
import type { AccessoryKey, AvatarConfig, Species } from "../types";
import { hexNum, shade } from "./iso";

/**
 * Wind Waker-style ANIMAL compositor: chunky cartoon proportions (big head ~
 * 40% of body height, tiny feet), flat vivid fills with a light highlight, and
 * a bold dark outline on everything. No human attributes anywhere.
 *
 * Origin (0,0) is the feet; art rises upward in negative-y so the renderer can
 * place + y-sort it. Programmatic now, swappable for atlas sprites later.
 */

export interface AvatarSprite {
  container: Container;
  setSelected: (selected: boolean) => void;
}

const INK = 0x23201c;
const HEAD_Y = -27;
const HEAD_R = 13;

export function buildAvatarSprite(config: AvatarConfig): AvatarSprite {
  const container = new Container();
  const body = hexNum(config.bodyColor);
  const dark = shade(config.bodyColor, -0.18);
  const light = shade(config.bodyColor, 0.24);

  const shadow = new Graphics();
  shadow.ellipse(0, 0, 13, 4.5).fill({ color: 0x000000, alpha: 0.22 });
  container.addChild(shadow);

  const ring = new Graphics();
  ring.ellipse(0, -1, 15, 6).stroke({ width: 3, color: hexNum(config.displayColor), alpha: 0.95 });
  ring.visible = false;
  container.addChild(ring);

  const g = new Graphics();
  // tiny feet
  g.ellipse(-4.5, -1, 3, 2).fill(dark).stroke({ width: 2, color: INK });
  g.ellipse(4.5, -1, 3, 2).fill(dark).stroke({ width: 2, color: INK });
  // small body
  g.roundRect(-8, -17, 16, 16, 7).fill(body).stroke({ width: 3, color: INK });
  g.ellipse(0, -8, 5.5, 6).fill({ color: hexNum(light), alpha: 0.7 }); // belly highlight

  drawSpecies(g, config.species, { body, dark, light });
  container.addChild(g);

  if (config.accessoryKey !== "none") {
    container.addChild(buildAccessory(config.accessoryKey, config.bodyColor));
  }

  return {
    container,
    setSelected: (selected: boolean) => { ring.visible = selected; },
  };
}

/**
 * Image-based avatar: the chosen illustrated animal PNG, anchored at the feet
 * (bottom-centre) exactly like the programmatic compositor so the renderer can
 * place + y-sort it identically. Same {container, setSelected} contract, so the
 * movement system swaps one for the other with no other changes.
 *
 * `displayColor` tints the selection ring + a soft golden glow shown when this
 * is the local (selected) avatar.
 */
const IMG_AVATAR_H = 50; // rendered art height in avatar-local px (pre-AVATAR_SCALE)

export function buildImageAvatarSprite(
  texture: Texture,
  displayColor: string,
): AvatarSprite {
  const container = new Container();

  const shadow = new Graphics();
  shadow.ellipse(0, 0, 14, 5).fill({ color: 0x000000, alpha: 0.22 });
  container.addChild(shadow);

  // Golden ground glow + ring, revealed for the local avatar (matches the
  // selection highlight used on the picker).
  const ring = new Graphics();
  ring.ellipse(0, -1, 17, 7).fill({ color: 0xffd76a, alpha: 0.28 });
  ring.ellipse(0, -1, 17, 7).stroke({ width: 3, color: hexNum(displayColor), alpha: 0.95 });
  ring.visible = false;
  container.addChild(ring);

  const spr = new Sprite(texture);
  const scale = IMG_AVATAR_H / (texture.height || IMG_AVATAR_H);
  spr.anchor.set(0.5, 1); // bottom-centre = feet/ground contact
  spr.scale.set(scale);
  spr.position.set(0, 2); // sit just above the contact shadow
  container.addChild(spr);

  return {
    container,
    setSelected: (selected: boolean) => { ring.visible = selected; },
  };
}

interface Tones { body: number; dark: number; light: number; }

function head(g: Graphics, body: number): void {
  g.circle(0, HEAD_Y, HEAD_R).fill(body).stroke({ width: 3, color: INK });
  g.circle(-4, HEAD_Y - 4, 4.5).fill({ color: 0xffffff, alpha: 0.18 }); // sheen
}
function eyes(g: Graphics, dx = 4, dy = HEAD_Y - 1): void {
  g.circle(-dx, dy, 1.7).fill(INK);
  g.circle(dx, dy, 1.7).fill(INK);
  g.circle(-dx + 0.6, dy - 0.6, 0.6).fill(0xffffff);
  g.circle(dx + 0.6, dy - 0.6, 0.6).fill(0xffffff);
}

function drawSpecies(g: Graphics, species: Species, t: Tones): void {
  const { body, dark, light } = t;
  switch (species) {
    case "bunny": {
      g.ellipse(-5, HEAD_Y - 16, 3.2, 10).fill(body).stroke({ width: 3, color: INK });
      g.ellipse(5, HEAD_Y - 16, 3.2, 10).fill(body).stroke({ width: 3, color: INK });
      g.ellipse(-5, HEAD_Y - 16, 1.4, 6).fill(0xffd9e4);
      g.ellipse(5, HEAD_Y - 16, 1.4, 6).fill(0xffd9e4);
      head(g, body); eyes(g);
      g.ellipse(0, HEAD_Y + 5, 4, 3).fill(light); g.circle(0, HEAD_Y + 3.5, 1.3).fill(INK);
      break;
    }
    case "fox": {
      g.poly([-12, HEAD_Y - 4, -3, HEAD_Y - 17, -1, HEAD_Y - 3]).fill(dark).stroke({ width: 3, color: INK });
      g.poly([12, HEAD_Y - 4, 3, HEAD_Y - 17, 1, HEAD_Y - 3]).fill(dark).stroke({ width: 3, color: INK });
      g.ellipse(12, -7, 5, 8).fill(dark).stroke({ width: 3, color: INK });
      g.ellipse(13, -3, 2.6, 4).fill(0xffffff);
      head(g, body);
      g.ellipse(0, HEAD_Y + 4, 7, 5).fill(0xfff4e8); // white snout
      eyes(g); g.circle(0, HEAD_Y + 2, 1.6).fill(INK);
      break;
    }
    case "bear": {
      g.circle(-8, HEAD_Y - 9, 4.5).fill(body).stroke({ width: 3, color: INK });
      g.circle(8, HEAD_Y - 9, 4.5).fill(body).stroke({ width: 3, color: INK });
      g.circle(-8, HEAD_Y - 9, 2).fill(light); g.circle(8, HEAD_Y - 9, 2).fill(light);
      head(g, body);
      g.ellipse(0, HEAD_Y + 4, 6, 4.5).fill(light); g.circle(0, HEAD_Y + 2.5, 1.7).fill(INK);
      eyes(g, 4.5, HEAD_Y - 2);
      break;
    }
    case "frog": {
      g.circle(-6, HEAD_Y - 9, 4.5).fill(body).stroke({ width: 3, color: INK });
      g.circle(6, HEAD_Y - 9, 4.5).fill(body).stroke({ width: 3, color: INK });
      g.circle(-6, HEAD_Y - 9, 2.4).fill(0xffffff); g.circle(6, HEAD_Y - 9, 2.4).fill(0xffffff);
      g.circle(-6, HEAD_Y - 9, 1.1).fill(INK); g.circle(6, HEAD_Y - 9, 1.1).fill(INK);
      g.ellipse(0, HEAD_Y, HEAD_R + 1, HEAD_R - 2).fill(body).stroke({ width: 3, color: INK });
      g.arc(0, HEAD_Y + 1, 7, 0.15, Math.PI - 0.15).stroke({ width: 2.5, color: INK });
      break;
    }
    case "cat": {
      g.poly([-11, HEAD_Y - 5, -3, HEAD_Y - 16, 0, HEAD_Y - 4]).fill(body).stroke({ width: 3, color: INK });
      g.poly([11, HEAD_Y - 5, 3, HEAD_Y - 16, 0, HEAD_Y - 4]).fill(body).stroke({ width: 3, color: INK });
      g.poly([-9, HEAD_Y - 6, -4, HEAD_Y - 13, -1.5, HEAD_Y - 6]).fill(0xffd9e4);
      g.poly([9, HEAD_Y - 6, 4, HEAD_Y - 13, 1.5, HEAD_Y - 6]).fill(0xffd9e4);
      g.ellipse(11, -9, 3, 6).fill(dark).stroke({ width: 3, color: INK });
      head(g, body); eyes(g);
      g.circle(0, HEAD_Y + 3, 1.3).fill(0xff9bb0);
      g.moveTo(2, HEAD_Y + 3).lineTo(10, HEAD_Y + 2).moveTo(-2, HEAD_Y + 3).lineTo(-10, HEAD_Y + 2).stroke({ width: 1, color: INK, alpha: 0.6 });
      break;
    }
    case "deer": {
      g.moveTo(-4, HEAD_Y - 10).lineTo(-7, HEAD_Y - 18).moveTo(-5.5, HEAD_Y - 14).lineTo(-11, HEAD_Y - 16)
        .stroke({ width: 2.5, color: 0x8a6a3a });
      g.moveTo(4, HEAD_Y - 10).lineTo(7, HEAD_Y - 18).moveTo(5.5, HEAD_Y - 14).lineTo(11, HEAD_Y - 16)
        .stroke({ width: 2.5, color: 0x8a6a3a });
      g.ellipse(-10, HEAD_Y - 6, 2.6, 5).fill(dark).stroke({ width: 2.5, color: INK });
      g.ellipse(10, HEAD_Y - 6, 2.6, 5).fill(dark).stroke({ width: 2.5, color: INK });
      head(g, body);
      g.ellipse(0, HEAD_Y + 4, 5.5, 4.5).fill(light); g.circle(0, HEAD_Y + 3, 1.6).fill(INK);
      eyes(g, 4.5);
      break;
    }
  }
}

const ACCESSORY_COLOR: Record<Exclude<AccessoryKey, "none">, number> = {
  hat: 0xe2553c,
  bow: 0xff6f97,
  scarf: 0x4fb8c2,
  backpack: 0x9b6b3f,
};

function buildAccessory(key: Exclude<AccessoryKey, "none">, bodyColor: string): Graphics {
  const g = new Graphics();
  const c = ACCESSORY_COLOR[key];
  switch (key) {
    case "hat":
      g.ellipse(0, HEAD_Y - 9, 12, 4).fill(c).stroke({ width: 3, color: INK });
      g.roundRect(-7, HEAD_Y - 19, 14, 11, 3).fill(c).stroke({ width: 3, color: INK });
      g.roundRect(-6, HEAD_Y - 12, 12, 3, 1).fill(shade(c, 0.2));
      break;
    case "bow":
      g.poly([-1, HEAD_Y - 11, -9, HEAD_Y - 15, -9, HEAD_Y - 7]).fill(c).stroke({ width: 2.5, color: INK });
      g.poly([1, HEAD_Y - 11, 9, HEAD_Y - 15, 9, HEAD_Y - 7]).fill(c).stroke({ width: 2.5, color: INK });
      g.circle(0, HEAD_Y - 11, 2.2).fill(shade(c, 0.15)).stroke({ width: 2, color: INK });
      break;
    case "scarf":
      g.roundRect(-8, -18, 16, 5, 2).fill(c).stroke({ width: 3, color: INK });
      g.roundRect(-2, -17, 5, 10, 1.5).fill(shade(c, -0.12)).stroke({ width: 2.5, color: INK });
      break;
    case "backpack":
      g.roundRect(-10, -15, 5, 12, 2).fill(c).stroke({ width: 2.5, color: INK });
      g.roundRect(5, -15, 5, 12, 2).fill(c).stroke({ width: 2.5, color: INK });
      g.roundRect(-7, -14, 14, 10, 3).fill(c).stroke({ width: 3, color: INK });
      g.roundRect(-4, -12, 8, 5, 1.5).fill(shade(bodyColor, 0.2));
      break;
  }
  return g;
}
