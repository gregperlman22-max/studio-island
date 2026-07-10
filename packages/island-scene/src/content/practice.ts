import type { MiniPractice } from "./types";

/**
 * The ordered "cards" a mini-practice renders as — pure data, no Pixi, so the
 * sequence is unit-testable and the PracticePlayer just draws whatever this
 * returns. All spoken text comes straight from the content pipeline (the
 * guide's intro line + the practice steps); the completion card carries no
 * content (it's a UI flourish, like ZoneView's "You found it!").
 */
export type PracticeCard =
  | { kind: "intro"; title: string; body: string }
  | { kind: "step"; title: string; body: string; index: number; total: number }
  | { kind: "complete"; title: string };

/**
 * intro (skipped when no intro line resolved) → one card per step → completion.
 * `introText` is the resolved text of the practice's `introLine`.
 */
export function practiceCards(practice: MiniPractice, introText: string): PracticeCard[] {
  const cards: PracticeCard[] = [];
  if (introText) cards.push({ kind: "intro", title: practice.title, body: introText });
  practice.steps.forEach((body, i) =>
    cards.push({
      kind: "step",
      title: practice.title,
      body,
      index: i + 1,
      total: practice.steps.length,
    }),
  );
  cards.push({ kind: "complete", title: practice.title });
  return cards;
}
