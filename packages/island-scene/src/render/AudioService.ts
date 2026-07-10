import { audioEntry, audioFileUrl, hasAudio, zoneAudioIds } from "../content/audio";
import { debugLog } from "./debug";

/**
 * AudioService — dialogue/practice voice playback (Session 4).
 *
 * Pre-generated files only: the island NEVER synthesizes speech at runtime.
 * Files are same-origin static assets under /public/audio, keyed by stable
 * content-line IDs through the audio manifest (content/audio.ts). This is the
 * package's ONLY persistent state — a global mute preference in localStorage —
 * which the One Law explicitly allows (local state, no network).
 *
 * HARD REQUIREMENT: a missing / unplayable file fails SILENTLY. No error is
 * ever surfaced to the child; the line just shows as text (the overlays draw
 * the text regardless of whether audio plays).
 *
 * Guarded for non-browser environments (SSR / tests): with no `Audio` or
 * `window`, every method is a no-op and the module still imports cleanly.
 */

const MUTE_KEY = "engage-island.audio.muted";

const hasAudioEl = typeof Audio !== "undefined";

/** Read the persisted global mute preference (default: not muted). */
export function readMutePreference(): boolean {
  try {
    return typeof localStorage !== "undefined" && localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}

/** Persist the global mute preference. */
export function writeMutePreference(muted: boolean): void {
  try {
    if (typeof localStorage !== "undefined") localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
  } catch {
    /* storage unavailable (private mode, etc.) — mute just won't persist */
  }
}

export interface AudioServiceOptions {
  /** Host-level enable (the `audioEnabled` prop). Muting is the child's toggle. */
  enabled: boolean;
}

export class AudioService {
  private enabled: boolean;
  private muted: boolean;
  /** Preloaded elements keyed by line ID. */
  private elements = new Map<string, HTMLAudioElement>();
  /** Line IDs whose file failed to load — never retried, always silent. */
  private unavailable = new Set<string>();
  private current: HTMLAudioElement | null = null;
  private destroyed = false;

  constructor(opts: AudioServiceOptions) {
    this.enabled = opts.enabled;
    this.muted = readMutePreference();
  }

  isMuted(): boolean {
    return this.muted;
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    writeMutePreference(muted);
    if (muted) this.stop();
  }

  toggleMute(): boolean {
    this.setMuted(!this.muted);
    return this.muted;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) this.stop();
  }

  /** True when audio may actually play right now. */
  private get live(): boolean {
    return hasAudioEl && this.enabled && !this.muted && !this.destroyed;
  }

  /**
   * Prime the voice files for a zone (dialogue lines + practice steps) so they
   * play instantly on display. Lazy: only manifest-listed lines are fetched,
   * and only once. A load error marks the line unavailable (silent fallback).
   */
  preloadZone(zone: string): void {
    if (!hasAudioEl || this.destroyed) return;
    for (const id of zoneAudioIds(zone)) {
      if (!hasAudio(id) || this.elements.has(id) || this.unavailable.has(id)) continue;
      this.element(id); // creating it kicks off preload
    }
  }

  /** Play a line's voice from the start. Silent no-op when not live, unlisted,
   *  or unavailable — the child only ever sees the text. */
  play(id: string): void {
    if (!this.live || !hasAudio(id) || this.unavailable.has(id)) return;
    const el = this.element(id);
    if (!el) return;
    this.stop();
    try {
      el.currentTime = 0;
    } catch {
      /* not seekable yet — play from wherever it is */
    }
    // play() rejects on autoplay policy / decode error — swallow it silently.
    void el.play().catch(() => {});
    this.current = el;
    debugLog(`[island-audio] play ${id}`);
  }

  /** Replay the current-or-given line (tap-to-replay on the speaking guide). */
  replay(id: string): void {
    this.play(id);
  }

  stop(): void {
    if (!this.current) return;
    try {
      this.current.pause();
      this.current.currentTime = 0;
    } catch {
      /* nothing playable */
    }
    this.current = null;
  }

  /** Get/create the preloaded element for a line, wiring the silent-fallback
   *  error handler. Returns null if the line has no manifest entry. */
  private element(id: string): HTMLAudioElement | null {
    const existing = this.elements.get(id);
    if (existing) return existing;
    const entry = audioEntry(id);
    if (!entry) return null;
    const el = new Audio(audioFileUrl(entry.file));
    el.preload = "auto";
    el.addEventListener("error", () => {
      this.unavailable.add(id);
      this.elements.delete(id);
      if (this.current === el) this.current = null;
      debugLog(`[island-audio] missing/failed ${id} — text-only fallback`);
    });
    this.elements.set(id, el);
    return el;
  }

  destroy(): void {
    this.destroyed = true;
    this.stop();
    this.elements.clear();
    this.unavailable.clear();
  }
}
