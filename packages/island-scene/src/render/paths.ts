import { Graphics } from "pixi.js";
import type { ZoneInstance, ZoneKey } from "../types";
import { footprintCenter } from "./iso";

/**
 * Worn dirt/sand walking trails connecting the island's zones, in the painted
 * storybook register of Alba: A Wildlife Adventure. Campfire Circle is the hub:
 * a spoke meanders out to every other zone.
 *
 * Each trail is its own Graphics (so it can be individually re-styled or
 * animated later). The caller adds them to a dedicated container layered ABOVE
 * the sand-base terrain but BELOW the landmark/decoration entities, so the
 * trails sit on the ground and a landmark sprite always paints over its own end.
 *
 * Routing is fully data-driven from the zone instances — positions are read from
 * the live layout, never hardcoded, so it adapts to wherever the zones sit (and
 * to new zones being added later).
 */

export interface PathStyle {
  /** Warm sandy-brown trail color, picked to blend into the painted terrain. */
  color: number;
  /** Stroke width (world px) — worn-trail width. */
  width: number;
  /** Blends the trail into the terrain rather than sitting on top harshly. */
  alpha: number;
}

const DEFAULT_STYLE: PathStyle = {
  color: 0xc4a46c,
  width: 21,
  alpha: 0.62,
};

/** Tiny deterministic [-1,1] hash so the meander is stable across rebuilds. */
function wobble(i: number, salt: number): number {
  const h = Math.sin((i + 1) * 12.9898 + salt * 78.233) * 43758.5453;
  return (h - Math.floor(h)) * 2 - 1;
}

/** Approx world-px radius of a zone footprint (half its diagonal extent). */
function footprintRadius(z: ZoneInstance): number {
  const c = footprintCenter(z.gridPosition, z.footprint.w, z.footprint.h);
  const corner = footprintCenter(z.gridPosition, 1, 1);
  return Math.hypot(c.x - corner.x, c.y - corner.y) || 24;
}

/**
 * Build the hub-and-spoke trail graphics. Returns one Graphics per trail so the
 * caller can add them to a dedicated container at the right z-order.
 *
 * @param zones    all zone instances (positions are read from these)
 * @param hubKey   the central hub zone (defaults to Campfire Circle)
 * @param style    trail appearance
 */
export function buildPaths(
  zones: ZoneInstance[],
  hubKey: ZoneKey = "campfire_circle",
  style: PathStyle = DEFAULT_STYLE,
): Graphics[] {
  const hub = zones.find((z) => z.key === hubKey);
  if (!hub) return [];

  const hubC = footprintCenter(hub.gridPosition, hub.footprint.w, hub.footprint.h);

  // Every other zone gets a spoke. Sort by bearing around the hub so the
  // endpoints fan out evenly around the campfire instead of crossing.
  const targets = zones
    .filter((z) => z.key !== hubKey)
    .map((z) => {
      const c = footprintCenter(z.gridPosition, z.footprint.w, z.footprint.h);
      return { z, c, angle: Math.atan2(c.y - hubC.y, c.x - hubC.x) };
    })
    .sort((a, b) => a.angle - b.angle);

  // Spokes converge AROUND the campfire, not on one pixel: fan their starts out
  // by this radius, each toward its own zone.
  const FAN_R = 26;

  return targets.map(({ z, c: dest }, i) => {
    // Direction hub → zone.
    const dx = dest.x - hubC.x;
    const dy = dest.y - hubC.y;
    const dist = Math.hypot(dx, dy) || 1;
    const ux = dx / dist;
    const uy = dy / dist;
    // Perpendicular (for the organic side-to-side meander).
    const px = -uy;
    const py = ux;

    // Start: fanned out around the campfire in this zone's direction.
    const sx = hubC.x + ux * FAN_R;
    const sy = hubC.y + uy * FAN_R;
    // End: pull back toward the hub by ~half a footprint so the trail reaches
    // the clearing's edge rather than burrowing under the landmark sprite.
    const pull = 0.5 * footprintRadius(z);
    const ex = dest.x - ux * pull;
    const ey = dest.y - uy * pull;

    // Two control points, offset perpendicular for a gentle wandering S-curve so
    // the trail meanders organically rather than taking the straight route.
    const span = Math.hypot(ex - sx, ey - sy);
    const amp = span * 0.16;
    const o1 = amp * wobble(i, 1);
    const o2 = -amp * (0.5 + 0.5 * Math.abs(wobble(i, 2))); // bias the far bend back
    const c1x = sx + (ex - sx) * 0.34 + px * o1;
    const c1y = sy + (ey - sy) * 0.34 + py * o1;
    const c2x = sx + (ex - sx) * 0.68 + px * o2;
    const c2y = sy + (ey - sy) * 0.68 + py * o2;

    const g = new Graphics();
    g.label = `path:${hubKey}->${z.key}`;
    g.eventMode = "none";
    // Single soft stroke, round cap/join, no outline or border — it reads as a
    // worn trail blending into the sand.
    g.moveTo(sx, sy)
      .bezierCurveTo(c1x, c1y, c2x, c2y, ex, ey)
      .stroke({ width: style.width, color: style.color, alpha: style.alpha, cap: "round", join: "round" });
    return g;
  });
}
