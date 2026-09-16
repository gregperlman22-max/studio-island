import { describe, expect, it } from "vitest";

/**
 * The approved Treehouse journey — flow, discovery and the map's honesty.
 *
 * Pure model only; TravelView's drawing is covered by travelView.test.ts.
 */

const {
  abandon, advance, beginTravel, closeMap, discoveryReachable, findDiscovery,
  mapButtonRects, mapPanelRect, markPoint, newJourney, openMap, progressMarkerX,
  progressTrackRect, snapshotRect, stepToNextWaypoint, WALK_RATE,
} = await import("../travel/journey");
const { TREEHOUSE_ROUTE: R } = await import("../travel/route");
const {
  discoveryWaypoint, frameUnit, lateralK, nextWaypoint, project, cameraFor,
} = await import("../travel/routeModel");

const walk = (s: ReturnType<typeof newJourney>, seconds: number) => {
  let cur = s;
  for (let i = 0; i < seconds * 60; i++) cur = advance(cur, 1 / 60, true, 0);
  return cur;
};

describe("the approved flow", () => {
  it("starts on the destination card, not in the journey", () => {
    expect(newJourney(false).phase).toBe("card");
  });

  it("goes card → travel → arrival, and ends itself", () => {
    let s = beginTravel(newJourney(false));
    expect(s.phase).toBe("travel");
    s = walk(s, 1 / WALK_RATE + 1);
    expect(s.phase).toBe("arrival");
    expect(s.p).toBe(1);
  });

  it("does not walk while the map is open", () => {
    const s = openMap(beginTravel(newJourney(false)));
    expect(walk(s, 3).p).toBe(0);
    expect(walk(closeMap(s), 3).p).toBeGreaterThan(0);
  });

  it("does not walk unless the child is holding", () => {
    let s = beginTravel(newJourney(false));
    for (let i = 0; i < 180; i++) s = advance(s, 1 / 60, false, 0);
    expect(s.p).toBe(0);
  });

  it("takes a journey rather than an errand, but not a long one", () => {
    const seconds = 1 / WALK_RATE;
    expect(seconds).toBeGreaterThan(8);
    expect(seconds).toBeLessThan(20);
  });

  /** Consistent with the accepted amendment: leaving restarts, it does not
   *  resume — a half-finished walk restored later confuses a child more than
   *  setting off again. */
  it("returns to the island by restarting, not resuming", () => {
    const s = abandon(walk(beginTravel(newJourney(false)), 5));
    expect(s.phase).toBe("card");
    expect(s.p).toBe(0);
    expect(s.discovery).toBe("unseen");
  });
});

describe("reduced motion", () => {
  it("advances a waypoint at a time, with no holding and no steering", () => {
    let s = beginTravel(newJourney(true));
    const seen: number[] = [];
    for (let i = 0; i < 12 && s.phase === "travel"; i++) {
      s = stepToNextWaypoint(s, R);
      seen.push(s.p);
    }
    expect(seen[0]).toBe(R.waypoints[0]);
    expect(s.phase).toBe("arrival");
    // Holding does nothing at all under reduced motion.
    expect(walk(beginTravel(newJourney(true)), 3).p).toBe(0);
  });

  it("reaches every waypoint in order", () => {
    let p = 0;
    for (const w of R.waypoints) {
      expect(nextWaypoint(R, p)).toBe(w);
      p = w;
    }
    expect(nextWaypoint(R, p)).toBe(null);
  });
});

describe("the discovery stays optional and reachable", () => {
  it("sits off the path, so reaching it is a choice", () => {
    expect(Math.abs(R.discovery.side)).toBeGreaterThan(R.halfWidth);
  });

  it("is reachable while passing it in continuous travel", () => {
    let s = beginTravel(newJourney(false));
    s = { ...s, p: R.discovery.t };
    expect(discoveryReachable(s, R)).toBe(true);
  });

  /** The reduced-motion half of the requirement: the same two decisions —
   *  notice it, act on it — with no continuous steering anywhere. */
  it("is reachable from a waypoint under reduced motion", () => {
    const wp = discoveryWaypoint(R);
    expect(R.waypoints).toContain(wp);
    let s = beginTravel(newJourney(true));
    // Step to it the way a child would: taps only.
    for (let i = 0; i < 12 && s.p < wp; i++) s = stepToNextWaypoint(s, R);
    expect(s.p).toBe(wp);
    expect(discoveryReachable(s, R)).toBe(true);
  });

  it("can be skipped entirely, and costs nothing", () => {
    let s = beginTravel(newJourney(true));
    for (let i = 0; i < 12 && s.phase === "travel"; i++) s = stepToNextWaypoint(s, R);
    expect(s.phase).toBe("arrival");
    expect(s.discovery).toBe("unseen");
  });

  it("is found by tapping it, never by steering into it", () => {
    let s = beginTravel(newJourney(false));
    s = { ...s, p: R.discovery.t };
    expect(s.steer).toBe(0);            // no steering needed
    s = findDiscovery(s);
    expect(s.discovery).toBe("found");
    expect(discoveryReachable(s, R)).toBe(false); // and not offered twice
  });
});

describe("the journey map", () => {
  const SIZES = [
    ["phone", 390, 844],
    ["tablet", 768, 1024],
    ["desktop", 1440, 900],
  ] as const;

  it.each(SIZES)("fits on screen at %s", (_n, w, h) => {
    const panel = mapPanelRect(w, h);
    expect(panel.x).toBeGreaterThanOrEqual(0);
    expect(panel.x + panel.w).toBeLessThanOrEqual(w);
    expect(panel.y).toBeGreaterThan(0);
    const btns = mapButtonRects(panel, w, h);
    for (const b of [btns.keepGoing, btns.backToIsland]) {
      expect(b.h).toBeGreaterThanOrEqual(56);
      expect(b.x).toBeGreaterThanOrEqual(0);
      expect(b.x + b.w).toBeLessThanOrEqual(w);
      expect(b.y + b.h).toBeLessThanOrEqual(h);
    }
  });

  /**
   * The honesty requirement. The walkgrid and landmark coordinates are locked
   * and nobody has pathfound a route across the island, so progress is shown on
   * a track BELOW the map rather than as a line drawn over the terrain. If this
   * ever starts overlapping the island panel, the map has begun asserting a
   * navigable route through locked geography.
   */
  it.each(SIZES)("keeps the progress track off the island itself at %s", (_n, w, h) => {
    const panel = mapPanelRect(w, h);
    const track = progressTrackRect(panel);
    expect(track.y, "progress track overlaps the map panel").toBeGreaterThanOrEqual(panel.y + panel.h);
  });

  it("shows position along the track, from start to destination", () => {
    const track = progressTrackRect(mapPanelRect(1440, 900));
    expect(progressMarkerX(track, 0)).toBeCloseTo(track.x, 5);
    expect(progressMarkerX(track, 1)).toBeCloseTo(track.x + track.w, 5);
    expect(progressMarkerX(track, 0.5)).toBeCloseTo(track.x + track.w / 2, 5);
  });
});

describe("the projection, and the two fixes the POC earned", () => {
  const cam = cameraFor(R);

  /** A width-only rule collapsed on a phone: the world scaled down with the
   *  narrow screen and the child became ~10% of the frame. */
  it("scales the world off the LARGER viewport dimension", () => {
    const phone = lateralK(cam, { w: 390, h: 844 });
    const widthOnly = 390 * cam.lateralFrac;
    expect(phone).toBeGreaterThan(widthOnly * 1.5);
    expect(phone).toBeCloseTo(844 * cam.lateralFrac, 5);
    expect(lateralK(cam, { w: 1440, h: 900 })).toBeCloseTo(1440 * cam.lateralFrac, 5);
  });

  /** Height alone made the canopy grow with a tall viewport and seal a portrait
   *  phone shut — 100% of the frame was leaves. */
  it("clamps screen-edge framing against the width", () => {
    expect(frameUnit({ w: 390, h: 844 })).toBeCloseTo(390 * 0.85, 5);
    expect(frameUnit({ w: 1440, h: 900 })).toBeCloseTo(900, 5);
  });

  it("recedes: further along the route is smaller and nearer the horizon", () => {
    const view = { w: 1440, h: 900 };
    const near = project(0.1, 0, 0, 0, cam, view);
    const far = project(0.6, 0, 0, 0, cam, view);
    expect(far.k).toBeLessThan(near.k);
    expect(far.y).toBeLessThan(near.y);
    expect(far.z).toBeGreaterThan(near.z);
  });

  it("culls what is behind the camera", () => {
    expect(project(0, 0, 0.5, 0, cam, { w: 1440, h: 900 }).visible).toBe(false);
  });

  it("holds the Friend at a constant size while the world moves past", () => {
    const view = { w: 1440, h: 900 };
    const a = project(0.2 + 0.0245, 0, 0.2, 0, cam, view);
    const b = project(0.8 + 0.0245, 0, 0.8, 0, cam, view);
    expect(a.k).toBeCloseTo(b.k, 6);
    expect(a.y).toBeCloseTo(b.y, 6);
  });

  it("hides the destination until the gap in the trees", () => {
    expect(R.revealAt).toBeGreaterThan(0.3);
    expect(R.revealAt).toBeLessThan(0.8);
  });
});

describe("the journey map's snapshot", () => {
  const VIEWS = [
    { n: "phone", w: 390, h: 844 },
    { n: "tablet", w: 768, h: 1024 },
    { n: "desktop", w: 1440, h: 900 },
  ];

  it("covers the panel completely at every viewport", () => {
    for (const v of VIEWS) {
      const panel = mapPanelRect(v.w, v.h);
      // A portrait still in a landscape panel, and the reverse.
      for (const tex of [{ w: 390, h: 844 }, { w: 1440, h: 900 }, { w: 560, h: 347 }]) {
        const fit = snapshotRect(panel, tex.w, tex.h);
        expect(fit.x, `${v.n}: bare panel on the left`).toBeLessThanOrEqual(panel.x + 0.001);
        expect(fit.y, `${v.n}: bare panel on the top`).toBeLessThanOrEqual(panel.y + 0.001);
        expect(fit.x + fit.w).toBeGreaterThanOrEqual(panel.x + panel.w - 0.001);
        expect(fit.y + fit.h).toBeGreaterThanOrEqual(panel.y + panel.h - 0.001);
        // Aspect preserved — a squashed island is not the island.
        expect(fit.w / fit.h).toBeCloseTo(tex.w / tex.h, 6);
      }
    }
  });

  it("puts a mark where the snapshot actually put it, crop and all", () => {
    const panel = mapPanelRect(390, 844);
    const fit = snapshotRect(panel, 560, 347);
    // The centre of the still is the centre of the panel, whatever the crop.
    const mid = markPoint(fit, { x: 0.5, y: 0.5 });
    expect(mid.x).toBeCloseTo(panel.x + panel.w / 2, 6);
    expect(mid.y).toBeCloseTo(panel.y + panel.h / 2, 6);
    // And a mark moves with the image, not with the panel.
    const right = markPoint(fit, { x: 1, y: 0.5 });
    expect(right.x).toBeCloseTo(fit.x + fit.w, 6);
  });
});
