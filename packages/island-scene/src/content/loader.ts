import manifestJson from "../../content/manifest.json";
import starsJson from "../../content/economy/stars.json";
import {
  DIALOGUE_ID_RE,
  PRACTICE_ID_RE,
  type ContentManifest,
  type DialogueFile,
  type DialogueLine,
  type DialogueLineId,
  type MiniPractice,
  type PracticesFile,
  type StarsFile,
} from "./types";

/**
 * Content loader — assembles and validates everything under
 * `packages/island-scene/content/` at BUILD TIME (import.meta.glob with
 * eager imports; Vite inlines the JSON into the bundle). No runtime fetch,
 * so the One Law holds trivially: content ships with the code.
 *
 * Validation policy (per the sprint pack): a malformed file or a dangling
 * reference HARD-FAILS in dev with a message naming the file and field;
 * in production the offending entry is skipped with a console.warn so a
 * bad content drop can never blank the island for a child.
 */

// Every zone folder's dialogue/practices, discovered at build time.
const dialogueModules = import.meta.glob("../../content/zones/*/dialogue.json", {
  eager: true,
}) as Record<string, { default: DialogueFile }>;
const practiceModules = import.meta.glob("../../content/zones/*/practices.json", {
  eager: true,
}) as Record<string, { default: PracticesFile }>;

const problems: string[] = [];

/** Dev: throw. Prod: warn, and the caller skips the entry. */
function fail(msg: string): void {
  problems.push(msg);
  if (import.meta.env.DEV) {
    throw new Error(`[island-content] ${msg}`);
  }
  console.warn(`[island-content] ${msg} — entry skipped`);
}

const zoneFromPath = (path: string): string =>
  path.match(/content\/zones\/([^/]+)\//)?.[1] ?? "";

const isStr = (v: unknown): v is string => typeof v === "string";
const isStrArr = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every(isStr);

// ── Assemble + validate ─────────────────────────────────────────────

const linesById = new Map<DialogueLineId, DialogueLine>();
const linesByZone = new Map<string, DialogueLine[]>();
const practicesByZone = new Map<string, MiniPractice[]>();
const practicesById = new Map<string, MiniPractice>();

for (const [path, mod] of Object.entries(dialogueModules)) {
  const zone = zoneFromPath(path);
  const file = mod.default;
  if (!file || !Array.isArray(file.lines)) {
    fail(`${path}: not a { version, lines[] } dialogue file`);
    continue;
  }
  const zoneLines: DialogueLine[] = [];
  for (const line of file.lines) {
    const where = `${path} line "${(line as { id?: unknown })?.id ?? "?"}"`;
    if (!isStr(line.id) || !DIALOGUE_ID_RE.test(line.id)) {
      fail(`${where}: id must match <zone>.<speaker>.<node>.<seq> (got "${line.id}")`);
      continue;
    }
    const [idZone, idSpeaker] = line.id.split(".");
    if (idZone !== zone) {
      fail(`${where}: id zone "${idZone}" ≠ folder zone "${zone}"`);
      continue;
    }
    if (!isStr(line.speaker) || line.speaker !== idSpeaker) {
      fail(`${where}: speaker "${line.speaker}" ≠ id speaker "${idSpeaker}"`);
      continue;
    }
    if (!isStr(line.text) || line.text.length === 0) {
      fail(`${where}: text must be a non-empty string`);
      continue;
    }
    if (line.next !== null && !isStrArr(line.next)) {
      fail(`${where}: next must be null or an array of line ids`);
      continue;
    }
    if (
      line.choices !== null &&
      !(Array.isArray(line.choices) &&
        line.choices.every((c) => isStr(c?.label) && isStr(c?.goto)))
    ) {
      fail(`${where}: choices must be null or [{ label, goto }]`);
      continue;
    }
    if (line.next?.length && line.choices?.length) {
      fail(`${where}: next and choices are mutually exclusive`);
      continue;
    }
    if (line.audio !== null && !isStr(line.audio)) {
      fail(`${where}: audio must be null (until Session 4) or a manifest key`);
      continue;
    }
    if (linesById.has(line.id)) {
      fail(`${where}: duplicate dialogue id`);
      continue;
    }
    linesById.set(line.id, line);
    zoneLines.push(line);
  }
  linesByZone.set(zone, zoneLines);
}

for (const [path, mod] of Object.entries(practiceModules)) {
  const zone = zoneFromPath(path);
  const file = mod.default;
  if (!file || !Array.isArray(file.practices)) {
    fail(`${path}: not a { version, practices[] } file`);
    continue;
  }
  const zonePractices: MiniPractice[] = [];
  for (const p of file.practices) {
    const where = `${path} practice "${(p as { id?: unknown })?.id ?? "?"}"`;
    if (!isStr(p.id) || !PRACTICE_ID_RE.test(p.id)) {
      fail(`${where}: id must match <zone>.practice.<slug> (got "${p.id}")`);
      continue;
    }
    if (p.id.split(".")[0] !== zone) {
      fail(`${where}: id zone ≠ folder zone "${zone}"`);
      continue;
    }
    if (!isStr(p.title) || !isStr(p.guide) || !isStrArr(p.steps) || p.steps.length === 0) {
      fail(`${where}: title/guide/steps malformed`);
      continue;
    }
    if (typeof p.stars !== "number" || p.stars < 0) {
      fail(`${where}: stars must be a number >= 0`);
      continue;
    }
    if (!isStr(p.introLine)) {
      fail(`${where}: introLine must be a dialogue line id`);
      continue;
    }
    if (practicesById.has(p.id)) {
      fail(`${where}: duplicate practice id`);
      continue;
    }
    practicesById.set(p.id, p);
    zonePractices.push(p);
  }
  practicesByZone.set(zone, zonePractices);
}

// Referential integrity: every next/goto/introLine resolves to a real line.
for (const line of linesById.values()) {
  for (const ref of line.next ?? []) {
    if (!linesById.has(ref)) fail(`dialogue "${line.id}": next → "${ref}" does not exist`);
  }
  for (const c of line.choices ?? []) {
    if (!linesById.has(c.goto)) fail(`dialogue "${line.id}": choice → "${c.goto}" does not exist`);
  }
}
for (const p of practicesById.values()) {
  if (!linesById.has(p.introLine)) {
    fail(`practice "${p.id}": introLine → "${p.introLine}" does not exist`);
  }
}

// Stars: every value keys a real practice (headroom rule: values may be 0).
const stars = starsJson as StarsFile;
for (const [pid, value] of Object.entries(stars.values ?? {})) {
  if (!practicesById.has(pid)) fail(`stars.json: value for unknown practice "${pid}"`);
  if (typeof value !== "number" || value < 0) fail(`stars.json: "${pid}" value must be >= 0`);
}

// Manifest: must list exactly the content files that exist.
const manifest = manifestJson as ContentManifest;
{
  const discovered = [
    ...Object.keys(dialogueModules),
    ...Object.keys(practiceModules),
  ]
    .map((p) => p.replace(/^.*?content\//, ""))
    .concat("economy/stars.json", "audio-manifest.json", "build-items.json")
    .sort();
  const listed = [...(manifest.files ?? [])].sort();
  if (JSON.stringify(discovered) !== JSON.stringify(listed)) {
    fail(
      `manifest.json out of date — listed [${listed.join(", ")}] vs on disk [${discovered.join(", ")}]`,
    );
  }
}

// ── Public accessors ────────────────────────────────────────────────

export function getDialogueLine(id: DialogueLineId): DialogueLine | null {
  return linesById.get(id) ?? null;
}

/** All dialogue lines authored for a zone (file order). */
export function getZoneDialogue(zone: string): DialogueLine[] {
  return linesByZone.get(zone) ?? [];
}

/**
 * The zone's greeting entry point: its `<zone>.<guide>.greet.001` line.
 * Null when a zone has no authored greeting (prod soft-skip path).
 */
export function getGreeting(zone: string): DialogueLine | null {
  return getZoneDialogue(zone).find((l) => l.id.endsWith(".greet.001")) ?? null;
}

export function getPractices(zone: string): MiniPractice[] {
  return practicesByZone.get(zone) ?? [];
}

export function getPractice(id: string): MiniPractice | null {
  return practicesById.get(id) ?? null;
}

/** Star award for a practice — stars.json value, else the practice's own field, else 0. */
export function getStarValue(practiceId: string): number {
  return stars.values?.[practiceId] ?? practicesById.get(practiceId)?.stars ?? 0;
}

export const contentVersion: number = manifest.version;

/** Dev tooling: everything the loader saw, incl. problems (empty in a clean build). */
export function contentReport(): {
  version: number;
  zones: string[];
  lineCount: number;
  practiceCount: number;
  problems: string[];
} {
  return {
    version: manifest.version,
    zones: [...linesByZone.keys()].sort(),
    lineCount: linesById.size,
    practiceCount: practicesById.size,
    problems: [...problems],
  };
}
