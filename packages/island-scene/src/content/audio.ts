import audioManifest from "../../content/audio-manifest.json";
import { sampleZones } from "../defaultLayout";
import type { MiniPractice } from "./types";
import { getPractices, getZoneDialogue } from "./loader";

/**
 * Audio index + coverage (Session 4). Pure data — no HTMLAudioElement, no
 * localStorage — so it imports cleanly in tests and SSR. The AudioService
 * (src/render/AudioService.ts) layers playback on top.
 *
 * The manifest maps a stable content-line ID to a pre-generated voice file.
 * Audio is ALWAYS a pre-recorded file; the island never synthesizes speech.
 * A line with no manifest entry simply has no audio (text-only fallback) and
 * shows up in the dev-mode missing-audio report.
 *
 * The audio-ID universe is every dialogue line ID plus every practice STEP ID
 * (practice intro lines are themselves dialogue lines, so they're already in
 * the dialogue set). Step IDs are derived deterministically so a step can be
 * keyed to a voice file even though steps live as plain strings in
 * practices.json — see practiceStepAudioId.
 */

export interface AudioEntry {
  /** Path relative to the served root (BASE_URL), e.g. "audio/calm_beach/…". */
  file: string;
  /** Clip length in seconds (authoring metadata; playback doesn't require it). */
  duration: number;
}

interface AudioManifest {
  version: number;
  entries: Record<string, AudioEntry>;
}

const manifest = audioManifest as AudioManifest;

export const audioManifestVersion: number = manifest.version;

/** The voice file for a line ID, or null if none is authored yet. */
export function audioEntry(id: string): AudioEntry | null {
  return manifest.entries[id] ?? null;
}

export function hasAudio(id: string): boolean {
  return id in manifest.entries;
}

/** Resolve a manifest file path to a served URL (honours the Vite base path). */
export function audioFileUrl(file: string): string {
  const base = import.meta.env.BASE_URL;
  return `${base}${file}`;
}

/**
 * The stable audio ID for a practice step. Steps live as plain strings in
 * practices.json, but audio is keyed to IDs — so we derive one in the same
 * four-part dot shape as a dialogue line:
 *   `<zone>.<guide>.<practice-slug>-step.<seq>`
 * e.g. calm_beach.shelly.wave-breathing-step.001. Deterministic and stable:
 * never renumber once a voice file is recorded against it.
 */
export function practiceStepAudioId(practice: MiniPractice, index: number): string {
  const [zone, , slug] = practice.id.split(".");
  const seq = String(index + 1).padStart(3, "0");
  return `${zone}.${practice.guide}.${slug}-step.${seq}`;
}

/**
 * Every audio-bearing line ID for a zone, in play order: the zone's dialogue
 * lines (which include practice intro lines) followed by each practice's step
 * IDs. De-duplicated, so a practice intro that's also a dialogue line appears
 * once.
 */
export function zoneAudioIds(zone: string): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  const add = (id: string) => {
    if (!seen.has(id)) {
      seen.add(id);
      ids.push(id);
    }
  };
  for (const line of getZoneDialogue(zone)) add(line.id);
  for (const p of getPractices(zone)) {
    add(p.introLine); // belt-and-suspenders (normally already a dialogue line)
    p.steps.forEach((_, i) => add(practiceStepAudioId(p, i)));
  }
  return ids;
}

export interface ZoneAudioCoverage {
  zone: string;
  total: number;
  withAudio: number;
  /** Line IDs still needing a voice file (no manifest entry). */
  missing: string[];
}

export interface AudioCoverage {
  zones: ZoneAudioCoverage[];
  totalLines: number;
  totalWithAudio: number;
  totalMissing: number;
}

/** Per-zone checklist of which content lines have a voice file vs. still need one. */
export function audioCoverageReport(): AudioCoverage {
  const zones: ZoneAudioCoverage[] = [];
  let totalLines = 0;
  let totalWithAudio = 0;
  for (const z of sampleZones) {
    const ids = zoneAudioIds(z.key);
    const missing = ids.filter((id) => !hasAudio(id));
    zones.push({
      zone: z.key,
      total: ids.length,
      withAudio: ids.length - missing.length,
      missing,
    });
    totalLines += ids.length;
    totalWithAudio += ids.length - missing.length;
  }
  return {
    zones,
    totalLines,
    totalWithAudio,
    totalMissing: totalLines - totalWithAudio,
  };
}

/**
 * Log the missing-audio checklist (dev only). Gives a per-zone list of the
 * content lines that still need a voice file recorded.
 */
export function logMissingAudioReport(): void {
  if (!import.meta.env.DEV) return;
  const r = audioCoverageReport();
  const lines: string[] = [
    `[island-audio] voice coverage: ${r.totalWithAudio}/${r.totalLines} lines have audio ` +
      `(${r.totalMissing} still needed)`,
  ];
  for (const z of r.zones) {
    if (z.missing.length === 0) {
      lines.push(`  ✓ ${z.zone} — all ${z.total} lines voiced`);
    } else {
      lines.push(`  • ${z.zone} — needs ${z.missing.length}/${z.total}:`);
      for (const id of z.missing) lines.push(`      – ${id}`);
    }
  }
  console.info(lines.join("\n"));
}
