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
/**
 * #1486 (39416): „ვებ-ში დავეხო გალერეაზე და გამოფენა შეგვაცნობა განოს რომ" was
 * garbled past respelling. The writer marks such a label and the button goes:
 * a button the owner cannot read is worse than one button fewer.
 */
export const UNFIXABLE_MARK = '⟦X⟧';
const LABEL_SEPARATOR = ' | ';
const MAX_LABEL_WORDS = 6;
/**
 * A spelling fix changes a few letters; more than this share of the label is a
 * rewording. Was 0.3: the tester's 1133 (36530) kept „მაიას ვაქვანაქრ გაცნობა",
 * one garbled word in 23 letters, whose fix is 9 edits against a cap of 6.
 */
const MAX_EDIT_SHARE = 0.4;
const MIN_EDITS_ALLOWED = 2;

/** What GPT is told when the reply carries buttons. */
export function buttonSpellingNote(labels: readonly string[]): string {
  return (
    '\n\n## Buttons\nThe reply ends with these buttons, written by another model:\n' +
    labels.map((label, i) => `${i + 1}. ${label}`).join('\n') +
    `\nAfter your answer, on its own last line, ALWAYS write ${BUTTONS_MARK} and then the same ` +
    `buttons separated by "${LABEL_SEPARATOR.trim()}", in the same order, with spelling and ` +
    'grammar corrected only — same meaning, same words where they are right, no new buttons. ' +
    // The tester's 1152 (38590): the writer returned „ლიზის კონტაქტის გადაწემა" unchanged,
    // and in the next run returned no line at all, so the garbled label stood.
    'The other model often misspells Georgian. Read every label word by word as a native ' +
    'speaker: a word that does not exist or has a wrong letter is to be fixed, e.g. ' +
    '„გადაწემა" → „გადაცემა", „მერუ" → „მერე", „ავირხოთ" → „ავირჩიოთ", „ერთ-ორს ადამიანი" → ' +
    '„ერთ-ორ ადამიანს". If a label is so garbled that you cannot tell what it was meant to ' +
    `say, write ${UNFIXABLE_MARK} in its place. Write the line even when nothing needed fixing.`
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
  return original.flatMap((label, i) => {
    const candidate = fromGpt[i];
    if (keep(label)) return [label];
    if (candidate === UNFIXABLE_MARK) return [];
    return [respeltOrKept(label, candidate, keep)];
  });
}

function respeltOrKept(label: string, candidate: string, keep: (label: string) => boolean): string {
  if (keep(candidate)) return label;
  if (candidate.split(/\s+/).length > MAX_LABEL_WORDS) return label;
  if (labelWithForeignLetter([candidate]) !== null) return label;
  return onlyRespelt(label, candidate) ? candidate : label;
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

/**
 * #1486 (L23, 39337): „წერ არა" for „ჯერ არა" stood on a card — in runs where
 * the final writer returned no buttons line, nothing respelt it. The buttons
 * offered most often are known; a label one letter away from one of them is
 * that button misspelt, and becomes it, whatever the writer returned.
 */
const KNOWN_LABELS: readonly string[] = [
  'ჯერ არა',
  'გადაწყდა',
  'შევაჩეროთ',
  'მოგვიანებით',
  'ვადასტურებ',
];
/** Shorter labels („კი", „არა") are a letter apart from each other's neighbours. */
const MIN_SNAP_LENGTH = 4;
const SNAP_EDITS = 1;

/**
 * #1783 (tester 41152): told to say „შენი გავლით" in its own question, the
 * model wrote it on the button too — „შენი გავლით გავაგრძელოთ". A button is
 * the owner's own voice, and the channel button is „ჩემი გავლით".
 */
const THROUGH_YOU_RE = /^შენი გავლით/;
const THROUGH_ME = 'ჩემი გავლით';

function inTheOwnersVoice(label: string): string {
  return label.replace(THROUGH_YOU_RE, THROUGH_ME);
}

export function snappedToKnownLabels(labels: readonly string[]): string[] {
  return labels.map(inTheOwnersVoice).map((label) => {
    if ([...label].length < MIN_SNAP_LENGTH || KNOWN_LABELS.includes(label)) return label;
    return KNOWN_LABELS.find((known) => editDistance(label, known) <= SNAP_EDITS) ?? label;
  });
}

/**
 * #1783 (tester 41317, 41417): above the channel buttons Netai wrote „გაცნობა
 * ჩემი გავლით შევათანხმოთ." — in its own voice „through me" reads as through
 * Netai, and it was no question. Twice the prompt asked and twice it slipped;
 * when the channel button is on screen, the server now says „შენი გავლით" in
 * Netai's text and makes sure a question stands above the buttons.
 */
const THROUGH_ME_IN_TEXT_RE = /ჩემი გავლით/g;
const THROUGH_YOU = 'შენი გავლით';
const ENDS_ON_A_QUESTION_RE = /[?？]\s*$/;
const CHANNEL_QUESTION = 'პირდაპირ დაგაკავშირო, თუ შენი გავლით გავაგრძელოთ?';

export function channelQuestionInNetaisVoice(text: string, labels: readonly string[]): string {
  const channelOnScreen = labels.some(
    (label) => label.startsWith(THROUGH_ME) || THROUGH_YOU_RE.test(label),
  );
  if (!channelOnScreen) return text;
  const inNetaisVoice = text.replace(THROUGH_ME_IN_TEXT_RE, THROUGH_YOU).trimEnd();
  if (inNetaisVoice === '') return CHANNEL_QUESTION;
  return ENDS_ON_A_QUESTION_RE.test(inNetaisVoice)
    ? inNetaisVoice
    : `${inNetaisVoice}\n\n${CHANNEL_QUESTION}`;
}
