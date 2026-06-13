import { Container, Graphics } from "pixi.js";
import type { AccessoryKey, AvatarConfig, Species } from "../types";
import { hexNum, shade } from "./iso";

/**
 * Programmatic ANIMAL compositor. Draws a chunky, big-headed creature
 * (Animal Crossing proportions) of the given species, tinted by a soft pastel
 * body color, with an optional accessory and a display-color selection ring.
 *
 * There are deliberately NO human attributes — no skin tones, no hair, no
 * gender indicators. Origin (0,0) is the feet (ground contact); art is drawn
 * upward in negative-y so the renderer can place + y-sort it. Programmatic
 * now, swappable for atlas sprites later behind the same builder.
 */

export interface AvatarSprite {
  container: Container;
  /** Selection ring toggled when this is the local / focused avatar. */
  setSelected: (selected: boolean) => void;
}

export function buildAvatarSprite(config: AvatarConfig): AvatarSprite {
  const container = new Container();
  const body = hexNum(config.bodyColor);
  const bodyDark = shade(config.bodyColor, -0.16);
  const bodyLight = shade(config.bodyColor, 0.22);
  const belly = shade(config.bodyColor, 0.34);

  // Ground contact shadow.
  const shadow = new Graphics();
  shadow.ellipse(0, 0, 12, 4.5).fill({ color: 0x000000, alpha: 0.22 });
  container.addChild(shadow);

  // Selection ring (display color), under the body.
  const ring = new Graphics();
  ring.ellipse(0, -1, 14, 5.5).stroke({ width: 2.5, color: hexNum(config.displayColor), alpha: 0.95 });
  ring.visible = false;
  container.addChild(ring);

  const g = new Graphics();

  // Small rounded body + little feet.
  g.ellipse(-4, -2, 2.6, 2).fill(bodyDark);
  g.ellipse(4, -2, 2.6, 2).fill(bodyDark);
  g.roundRect(-7, -16, 14, 15, 6).fill(body);
  g.ellipse(0, -8, 5, 6).fill(belly); // belly

  // Species-specific head + features (drawn around head center ~ y -26).
  drawSpecies(g, config.species, { body, bodyDark, bodyLight });

  container.addChild(g);

  // Accessory on top.
  if (config.accessoryKey !== "none") {
    container.addChild(buildAccessory(config.accessoryKey, config.bodyColor));
  }

  return {
    container,
    setSelected: (selected: boolean) => {
      ring.visible = selected;
    },
  };
}

interface Tones {
  body: number;
  bodyDark: number;
  bodyLight: number;
}

const HEAD_Y = -26;

function drawSpecies(g: Graphics, species: Species, t: Tones): void {
  const { body, bodyDark, bodyLight } = t;
  const head = () => g.circle(0, HEAD_Y, 10).fill(body);
  const eyes = (dx = 3.2, dy = -27.5, r = 1.3) => {
    g.circle(-dx, dy, r).fill(0x2a2a2a);
    g.circle(dx, dy, r).fill(0x2a2a2a);
  };
  const muzzle = (color: number, y = -23) => {
    g.ellipse(0, y, 5, 3.6).fill(color);
    g.ellipse(0, y - 1.5, 1.6, 1.2).fill(0x2a2a2a); // nose
  };

  switch (species) {
    case "bunny": {
      // tall ears
      g.ellipse(-4, HEAD_Y - 13, 2.6, 8).fill(body);
      g.ellipse(4, HEAD_Y - 13, 2.6, 8).fill(body);
      g.ellipse(-4, HEAD_Y - 13, 1.2, 5).fill(bodyLight);
      g.ellipse(4, HEAD_Y - 13, 1.2, 5).fill(bodyLight);
      head();
      eyes();
      muzzle(bodyLight, -22.5);
      break;
    }
    case "fox": {
      // pointed ears + tail
      g.poly([-9, HEAD_Y - 4, -3, HEAD_Y - 13, -2, HEAD_Y - 3]).fill(bodyDark);
      g.poly([9, HEAD_Y - 4, 3, HEAD_Y - 13, 2, HEAD_Y - 3]).fill(bodyDark);
      g.ellipse(10, -6, 4, 6).fill(bodyDark);
      g.ellipse(11, -3, 2.5, 3).fill(0xffffff);
      head();
      g.ellipse(0, -23, 6, 4).fill(0xfff4e8); // white snout
      eyes();
      g.circle(0, -24.5, 1.5).fill(0x2a2a2a);
      break;
    }
    case "bear": {
      // round ears
      g.circle(-7, HEAD_Y - 8, 3.6).fill(body);
      g.circle(7, HEAD_Y - 8, 3.6).fill(body);
      g.circle(-7, HEAD_Y - 8, 1.8).fill(bodyLight);
      g.circle(7, HEAD_Y - 8, 1.8).fill(bodyLight);
      head();
      muzzle(bodyLight);
      eyes(3, -28);
      break;
    }
    case "frog": {
      // wide head, eyes on top
      g.ellipse(0, HEAD_Y, 11, 8).fill(body);
      g.circle(-5, HEAD_Y - 7, 3.4).fill(body);
      g.circle(5, HEAD_Y - 7, 3.4).fill(body);
      g.circle(-5, HEAD_Y - 7, 1.8).fill(0xffffff);
      g.circle(5, HEAD_Y - 7, 1.8).fill(0xffffff);
      g.circle(-5, HEAD_Y - 7, 0.9).fill(0x2a2a2a);
      g.circle(5, HEAD_Y - 7, 0.9).fill(0x2a2a2a);
      g.arc(0, HEAD_Y, 6, 0.15, Math.PI - 0.15).stroke({ width: 1.4, color: shade("#2a2a2a", 0) });
      break;
    }
    case "cat": {
      // triangle ears + whiskers + tail
      g.poly([-8, HEAD_Y - 4, -3, HEAD_Y - 12, -1, HEAD_Y - 4]).fill(body);
      g.poly([8, HEAD_Y - 4, 3, HEAD_Y - 12, 1, HEAD_Y - 4]).fill(body);
      g.poly([-7, HEAD_Y - 5, -3.5, HEAD_Y - 10, -2, HEAD_Y - 5]).fill(bodyLight);
      g.poly([7, HEAD_Y - 5, 3.5, HEAD_Y - 10, 2, HEAD_Y - 5]).fill(bodyLight);
      g.ellipse(9, -8, 2.4, 5).fill(bodyDark);
      head();
      eyes();
      g.circle(0, -23.5, 1.1).fill(0xff9bb0);
      g.moveTo(2, -23).lineTo(8, -24).stroke({ width: 0.8, color: 0xffffff });
      g.moveTo(-2, -23).lineTo(-8, -24).stroke({ width: 0.8, color: 0xffffff });
      break;
    }
    case "deer": {
      // antlers + long ears + snout
      g.moveTo(-3, HEAD_Y - 8).lineTo(-5, HEAD_Y - 14).moveTo(-4, HEAD_Y - 11).lineTo(-8, HEAD_Y - 13)
        .stroke({ width: 1.6, color: shade("#9a7a4a", 0) });
      g.moveTo(3, HEAD_Y - 8).lineTo(5, HEAD_Y - 14).moveTo(4, HEAD_Y - 11).lineTo(8, HEAD_Y - 13)
        .stroke({ width: 1.6, color: shade("#9a7a4a", 0) });
      g.ellipse(-8, HEAD_Y - 5, 2.2, 4).fill(bodyDark);
      g.ellipse(8, HEAD_Y - 5, 2.2, 4).fill(bodyDark);
      head();
      g.ellipse(0, -22.5, 5, 4).fill(bodyLight);
      g.ellipse(0, -23.5, 1.5, 1.1).fill(0x2a2a2a);
      eyes(3.2, -27.5);
      break;
    }
  }
}

const ACCESSORY_COLOR: Record<Exclude<AccessoryKey, "none">, number> = {
  hat: 0xe8643c,
  bow: 0xff6f97,
  scarf: 0x5ec3c9,
  backpack: 0x9b6b3f,
};

function buildAccessory(key: Exclude<AccessoryKey, "none">, bodyColor: string): Graphics {
  const g = new Graphics();
  const c = ACCESSORY_COLOR[key];
  switch (key) {
    case "hat":
      g.ellipse(0, HEAD_Y - 8, 9, 3).fill(c);
      g.roundRect(-5, HEAD_Y - 15, 10, 8, 3).fill(c);
      g.ellipse(0, HEAD_Y - 15, 5, 2).fill(shade("#ffffff", -0.1));
      break;
    case "bow":
      g.poly([-1, HEAD_Y - 9, -7, HEAD_Y - 12, -7, HEAD_Y - 6]).fill(c);
      g.poly([1, HEAD_Y - 9, 7, HEAD_Y - 12, 7, HEAD_Y - 6]).fill(c);
      g.circle(0, HEAD_Y - 9, 1.8).fill(shade(`#ffffff`, -0.05));
      break;
    case "scarf":
      g.roundRect(-7, -17, 14, 4, 2).fill(c);
      g.roundRect(-2, -16, 4, 9, 1.5).fill(0x4aa8ae);
      break;
    case "backpack":
      g.roundRect(-8, -14, 4, 10, 2).fill(c);
      g.roundRect(4, -14, 4, 10, 2).fill(c);
      g.roundRect(-6, -13, 12, 9, 3).fill(c);
      g.roundRect(-3, -11, 6, 4, 1.5).fill(shade(bodyColor, 0.2));
      break;
  }
  return g;
}
