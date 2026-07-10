import type { ZoneKey } from "../types";

/**
 * Content pipeline types — the contract for everything under
 * `packages/island-scene/content/`. Designed in Session 3 of the Fable 5
 * sprint; every later island, quest, and audio file keys off these IDs.
 *
 * ID RULES (recorded decisions Q2/Q3, July 2026):
 * - Dialogue line: `<zone>.<speaker>.<node>.<seq>` — four dot-separated parts.
 *   `<zone>` is the canonical ZoneKey exactly as the renderer knows it
 *   (snake_case, e.g. `calm_beach`) — NOT the kebab spelling in the sprint
 *   pack's illustrative example; the recorded Q3 decision standardizes on the
 *   island's 9 zone keys. `<seq>` is a zero-padded 3-digit counter.
 * - Mini-practice: `<zone>.practice.<slug>` — three parts, kebab-case slug.
 * - IDs are STABLE FOREVER once assigned. Audio files will be keyed to them.
 *   Never renumber, never reuse.
 */

/** `<zone>.<speaker>.<node>.<seq>`, e.g. `calm_beach.shelly.greet.001`. */
export type DialogueLineId = string;
/** `<zone>.practice.<slug>`, e.g. `calm_beach.practice.wave-breathing`. */
export type PracticeId = string;

export const DIALOGUE_ID_RE = /^[a-z0-9_]+\.[a-z0-9_]+\.[a-z0-9-]+\.\d{3}$/;
export const PRACTICE_ID_RE = /^[a-z0-9_]+\.practice\.[a-z0-9-]+$/;

/** A branch option shown to the child. `goto` must resolve to a real line. */
export interface DialogueChoice {
  label: string;
  goto: DialogueLineId;
}

/**
 * The atomic content unit. Exactly one of `next`/`choices` drives what
 * follows: `next` (first entry) advances linearly, `choices` branches,
 * both null ends the dialogue.
 */
export interface DialogueLine {
  id: DialogueLineId;
  /** Speaker key — the zone's guide (e.g. "shelly"); matches the id's 2nd part. */
  speaker: string;
  text: string;
  /** Line(s) that can follow; the player advances to `next[0]`. Null = end. */
  next: DialogueLineId[] | null;
  /** Branch options; mutually exclusive with a non-empty `next`. */
  choices: DialogueChoice[] | null;
  /** Audio manifest reference — null until the Session 4 audio layer lands. */
  audio: string | null;
}

/** One guided mini-practice, launched from a zone (Mode 2 practice space). */
export interface MiniPractice {
  id: PracticeId;
  title: string;
  /** Guide key who leads it (e.g. "shelly"). */
  guide: string;
  steps: string[];
  /**
   * Star award. 0 placeholder — real values are assigned at build time per
   * the roadmap rule (Phase 4 story quests pay most; leave headroom).
   */
  stars: number;
  /** Dialogue line that introduces the practice (must resolve). */
  introLine: DialogueLineId;
}

/** Wrapper for a zone's dialogue.json. */
export interface DialogueFile {
  version: number;
  lines: DialogueLine[];
}

/** Wrapper for a zone's practices.json. */
export interface PracticesFile {
  version: number;
  practices: MiniPractice[];
}

/** economy/stars.json — star values per activity/practice id. */
export interface StarsFile {
  version: number;
  values: Record<PracticeId, number>;
}

/** manifest.json — index of all content files + content version. */
export interface ContentManifest {
  version: number;
  files: string[];
}

/** Everything the loader assembled and validated for one zone. */
export interface ZoneContent {
  zone: ZoneKey;
  lines: DialogueLine[];
  practices: MiniPractice[];
}
