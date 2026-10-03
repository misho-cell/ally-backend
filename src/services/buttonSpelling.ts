import { labelWithForeignLetter } from './buttonLetters';

/**
 * The tester's 1118 (5) and the founder's yes in 1120: button labels came out
 * misspelt („შევაჩყოთ", „შევაჭეროთ", „ფასუხს") on every second card. The reply
 * text is clean because GPT rewrites it; the labels are Claude's present_choices
 * and were never rewritten. They now ride in the SAME GPT call that writes the
 * final answer — no extra call. GPT returns them after a marker on the last
 * line, and the server keeps a corrected label only when it is the same button
 * spelt better.
 */
export const BUTTONS_MARK = '⟦BUTTONS⟧';
const LABEL_SEPARATOR = ' | ';
const MAX_LABEL_WORDS = 6;
/** A spelling fix changes a few letters; more than this share of the label is a rewording. */
const MAX_EDIT_SHARE = 0.3;
const MIN_EDITS_ALLOWED = 2;

/** What GPT is told when the reply carries buttons. */
export function buttonSpellingNote(labels: readonly string[]): string {
  return (
    '\n\n## Buttons\nThe reply ends with these buttons, written by another model:\n' +
    labels.map((label, i) => `${i + 1}. ${label}`).join('\n') +
    `\nAfter your answer, on its own last line, write ${BUTTONS_MARK} and then the same ` +
    `buttons separated by "${LABEL_SEPARATOR.trim()}", in the same order, with spelling and ` +
    'grammar corrected only — same meaning, same words where they are right, no new buttons.'
  );
}

export interface SplitAnswer {
  readonly text: string;
  readonly labels: readonly string[] | null;
}

/** The answer without the marker line, and the labels after it when GPT wrote them. */
export function splitButtons(written: string): SplitAnswer {
  const at = written.lastIndexOf(BUTTONS_MARK);
  if (at === -1) return { text: written, labels: null };
  const labels = written
    .slice(at + BUTTONS_MARK.length)
    .split(LABEL_SEPARATOR.trim())
    .map((label) => label.trim())
    .filter((label) => label !== '');
  return { text: written.slice(0, at).trimEnd(), labels };
}

/**
 * Each original label, or GPT's spelling of it when that is safe: the same
 * count, a label `keep` does not protect (the server's own approve and change
 * labels), ordinary letters, and only a few letters changed.
 */
export function correctedLabels(
  original: readonly string[],
  fromGpt: readonly string[] | null,
  keep: (label: string) => boolean,
): string[] {
  if (fromGpt === null || fromGpt.length !== original.length) return [...original];
  return original.map((label, i) => {
    const candidate = fromGpt[i];
    if (keep(label) || keep(candidate)) return label;
    if (candidate.split(/\s+/).length > MAX_LABEL_WORDS) return label;
    if (labelWithForeignLetter([candidate]) !== null) return label;
    return onlyRespelt(label, candidate) ? candidate : label;
  });
}

function onlyRespelt(before: string, after: string): boolean {
  const allowed = Math.max(MIN_EDITS_ALLOWED, Math.floor(before.length * MAX_EDIT_SHARE));
  return editDistance(before, after) <= allowed;
}

/** Levenshtein distance over code points. */
export function editDistance(a: string, b: string): number {
  const x = [...a];
  const y = [...b];
  let previous = Array.from({ length: y.length + 1 }, (_, j) => j);
  for (let i = 1; i <= x.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= y.length; j += 1) {
      const substitution = previous[j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1);
      current.push(Math.min(previous[j] + 1, current[j - 1] + 1, substitution));
    }
    previous = current;
  }
  return previous[y.length];
}

/**
 * Passes streamed text on, holding back everything from the marker onwards, so
 * the labels line never reaches the screen. A tail that could be the start of
 * the marker waits for the next delta.
 */
export function withoutButtonsLine(onText: (delta: string) => void): (delta: string) => void {
  let held = '';
  let marked = false;
  return (delta: string): void => {
    if (marked) return;
    held += delta;
    const at = held.indexOf(BUTTONS_MARK);
    if (at !== -1) {
      marked = true;
      if (at > 0) onText(held.slice(0, at));
      held = '';
      return;
    }
    const keepBack = partialMarkLength(held);
    const ready = held.slice(0, held.length - keepBack);
    held = held.slice(held.length - keepBack);
    if (ready !== '') onText(ready);
  };
}

function partialMarkLength(text: string): number {
  for (let n = Math.min(BUTTONS_MARK.length - 1, text.length); n > 0; n -= 1) {
    if (BUTTONS_MARK.startsWith(text.slice(-n))) return n;
  }
  return 0;
}
