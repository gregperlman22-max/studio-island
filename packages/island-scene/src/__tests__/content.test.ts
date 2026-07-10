import { describe, expect, it } from "vitest";
import {
  contentReport,
  getDialogueLine,
  getGreeting,
  getPractice,
  getPractices,
  getStarValue,
  getZoneDialogue,
} from "../content/loader";
import { practiceCards } from "../content/practice";
import { DIALOGUE_ID_RE, PRACTICE_ID_RE } from "../content/types";
import { sampleZones } from "../defaultLayout";
import { GUIDES } from "../render/guideCatalog";
import type { ZoneKey } from "../types";

/**
 * Content pipeline integrity (Session 3 task 5). Importing the loader in dev
 * mode already hard-fails on malformed content; this suite additionally pins:
 * - every zone has a greeting whose text is EXACTLY the pre-migration string
 *   (the guideCatalog messages, migrated verbatim — no rewording lane here),
 * - every next/goto/introLine reference resolves,
 * - IDs are well-formed and speakers match each zone's locked guide.
 */

// The 9 greeting texts, byte-for-byte as they shipped in guideCatalog.ts
// before the migration. If one of these fails, content was reworded —
// content changes are a separate lane; revert the JSON.
const LOCKED_GREETINGS: Record<ZoneKey, string> = {
  campfire_circle:
    "Hey there, friend! Welcome to Campfire Circle — pull up a log and get cozy!",
  treehouse_hideaway:
    "Whooo's there? Welcome to the Treehouse! Let your imagination soar up here!",
  art_hut:
    "Oh, hello! Welcome to the Art Hut — let's make something amazing together!",
  lighthouse_point:
    "Hey, take a deep breath... Welcome to Lighthouse Point. It's nice to just think here.",
  arcade_cove: "Woohoo! Welcome to Arcade Cove! Ready to play some games?!",
  star_market:
    "Ooh, a visitor! Welcome to Star Market — check out all the shiny stuff!",
  calm_beach: "Heyyy... welcome to Calm Beach. No rush here... just relax.",
  lazy_lagoon: "Ribbit! Welcome to Lazy Lagoon! Kick back and chill with me!",
  welcome_dock: "Ahoy! Welcome to the dock! This is where every adventure begins!",
};

const zoneKeys = sampleZones.map((z) => z.key);

describe("content pipeline", () => {
  it("loads with zero problems", () => {
    const report = contentReport();
    expect(report.problems).toEqual([]);
    expect(report.version).toBe(1);
    expect(report.zones.sort()).toEqual([...zoneKeys].sort());
  });

  it("every zone's greeting text matches the pre-migration string exactly", () => {
    for (const zone of zoneKeys) {
      const greet = getGreeting(zone);
      expect(greet, zone).toBeTruthy();
      expect(greet!.text, zone).toBe(LOCKED_GREETINGS[zone]);
    }
  });

  it("every dialogue id is well-formed and its speaker is the zone's guide", () => {
    for (const zone of zoneKeys) {
      const guideSpeaker = GUIDES[zone].name.toLowerCase().replace(/\s+/g, "_");
      for (const line of getZoneDialogue(zone)) {
        expect(line.id, line.id).toMatch(DIALOGUE_ID_RE);
        expect(line.id.startsWith(`${zone}.`), line.id).toBe(true);
        expect(line.speaker, line.id).toBe(guideSpeaker);
        expect(line.text.length, line.id).toBeGreaterThan(0);
      }
    }
  });

  it("every next/goto/introLine reference resolves to a real line", () => {
    for (const zone of zoneKeys) {
      for (const line of getZoneDialogue(zone)) {
        for (const ref of line.next ?? []) {
          expect(getDialogueLine(ref), `${line.id} → ${ref}`).toBeTruthy();
        }
        for (const c of line.choices ?? []) {
          expect(getDialogueLine(c.goto), `${line.id} → ${c.goto}`).toBeTruthy();
        }
      }
      for (const p of getPractices(zone)) {
        expect(p.id, p.id).toMatch(PRACTICE_ID_RE);
        expect(getDialogueLine(p.introLine), `${p.id} → ${p.introLine}`).toBeTruthy();
      }
    }
  });

  it("ships the example practice with placeholder text and 0 stars", () => {
    const p = getPractice("calm_beach.practice.wave-breathing");
    expect(p).toBeTruthy();
    expect(p!.title).toBe("Wave Breathing");
    expect(p!.guide).toBe("shelly");
    expect(p!.steps.length).toBeGreaterThan(0);
    for (const s of p!.steps) expect(s).toContain("PLACEHOLDER");
    expect(getStarValue(p!.id)).toBe(0);
    expect(getDialogueLine(p!.introLine)?.text).toContain("PLACEHOLDER");
  });

  it("the practice player renders introLine + steps from JSON, in order", () => {
    // The exact card sequence the Mode-2 PracticePlayer walks through, driven
    // straight from the content pipeline (loader → introLine text + steps).
    const p = getPractice("calm_beach.practice.wave-breathing")!;
    const introText = getDialogueLine(p.introLine)!.text;
    const cards = practiceCards(p, introText);

    // intro (from introLine) → one card per step → completion.
    expect(cards).toHaveLength(1 + p.steps.length + 1);
    expect(cards[0]).toEqual({ kind: "intro", title: p.title, body: introText });
    p.steps.forEach((step, i) => {
      expect(cards[i + 1]).toEqual({
        kind: "step",
        title: p.title,
        body: step, // rendered verbatim from practices.json
        index: i + 1,
        total: p.steps.length,
      });
    });
    expect(cards[cards.length - 1]).toEqual({ kind: "complete", title: p.title });
  });

  it("skips the intro card when a practice has no resolvable intro text", () => {
    const p = getPractice("calm_beach.practice.wave-breathing")!;
    const cards = practiceCards(p, "");
    expect(cards[0].kind).toBe("step");
    expect(cards).toHaveLength(p.steps.length + 1);
  });
});
