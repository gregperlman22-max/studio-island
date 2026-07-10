import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import audioManifest from "../../content/audio-manifest.json";
import {
  audioCoverageReport,
  audioManifestVersion,
  hasAudio,
  practiceStepAudioId,
  zoneAudioIds,
} from "../content/audio";
import { getPractice } from "../content/loader";
import { DIALOGUE_ID_RE } from "../content/types";
import { sampleZones } from "../defaultLayout";

/**
 * Session 4 audio-layer guards. The key requirement from the sprint pack:
 * "manifest entries all point to existing files OR are flagged in a dev-mode
 * report." Here we enforce the first half (no dangling manifest entries) and
 * exercise the coverage report that produces the per-zone missing checklist.
 */

const PUBLIC_DIR = join(__dirname, "../../public");
const entries = (audioManifest as { entries: Record<string, { file: string; duration: number }> }).entries;

describe("audio manifest", () => {
  it("every manifest entry points to a file that actually ships", () => {
    for (const [id, entry] of Object.entries(entries)) {
      expect(entry.file, id).toMatch(/^audio\/.+\.(wav|mp3)$/);
      expect(typeof entry.duration, id).toBe("number");
      expect(existsSync(join(PUBLIC_DIR, entry.file)), `${id} → ${entry.file}`).toBe(true);
    }
  });

  it("every manifest key is a well-formed content-line ID in its zone's universe", () => {
    for (const id of Object.keys(entries)) {
      expect(id, id).toMatch(DIALOGUE_ID_RE);
      const zone = id.split(".")[0];
      expect(zoneAudioIds(zone), id).toContain(id);
    }
  });

  it("wires exactly the 3 scratch lines (dialogue greeting + practice step)", () => {
    const keys = Object.keys(entries).sort();
    expect(keys).toEqual(
      [
        "calm_beach.shelly.greet.001",
        "calm_beach.shelly.wave-breathing-step.001",
        "welcome_dock.captain_pete.greet.001",
      ].sort(),
    );
    expect(audioManifestVersion).toBe(1);
  });
});

describe("practice step audio IDs", () => {
  it("derives stable four-part IDs for the example practice's steps", () => {
    const p = getPractice("calm_beach.practice.wave-breathing")!;
    p.steps.forEach((_, i) => {
      const id = practiceStepAudioId(p, i);
      expect(id).toBe(`calm_beach.shelly.wave-breathing-step.${String(i + 1).padStart(3, "0")}`);
      expect(id).toMatch(DIALOGUE_ID_RE);
    });
    // The intro line + all step IDs live in the zone's audio universe.
    const ids = zoneAudioIds("calm_beach");
    expect(ids).toContain(p.introLine);
    expect(ids).toContain("calm_beach.shelly.wave-breathing-step.001");
  });
});

describe("audio coverage report (the missing-audio checklist)", () => {
  const report = audioCoverageReport();

  it("covers all 9 zones and counts the 3 wired lines as voiced", () => {
    expect(report.zones.map((z) => z.zone).sort()).toEqual(
      sampleZones.map((z) => z.key).sort(),
    );
    expect(report.totalWithAudio).toBe(3);
    expect(report.totalMissing).toBeGreaterThan(0);
    expect(report.totalLines).toBe(report.totalWithAudio + report.totalMissing);
  });

  it("flags lines without a voice file (e.g. the practice intro + campfire greeting)", () => {
    const calm = report.zones.find((z) => z.zone === "calm_beach")!;
    // Wired: greet + step 001. Not wired yet: the practice intro line + steps 2..n.
    expect(calm.missing).toContain("calm_beach.shelly.practice-intro.001");
    expect(hasAudio("campfire_circle.bruno.greet.001")).toBe(false);
    const campfire = report.zones.find((z) => z.zone === "campfire_circle")!;
    expect(campfire.missing).toContain("campfire_circle.bruno.greet.001");
    expect(campfire.withAudio).toBe(0);
  });
});
