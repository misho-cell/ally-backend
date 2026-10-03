import type { RunLanguage } from './runLanguage';

/**
 * Board #68 (a loyal Ally customer, 1 Oct, via Tornike): choice buttons offer
 * only what the model thought of, and she often wants something else. Misho,
 * 3 October: every set of buttons also carries „other — I'll write it".
 *
 * Added by the server after the model's own labels, so no prompt has to
 * remember it, in the conversation's language. A set that already ends in an
 * „other" option keeps its own. The app opens the text box when it is tapped;
 * if the label arrives as a message instead, the model reads it as a request
 * to type freely.
 */
const OTHER_LABELS: Readonly<Record<RunLanguage, string>> = {
  ka: 'სხვა, მე დავწერ',
  en: "Other, I'll write it",
  ru: 'Другое, напишу сам',
  es: 'Otro, lo escribo yo',
};

/** The words an „other" option starts with, in every language we speak. */
const OTHER_STARTS = ['სხვა', 'other', 'другое', 'otro'];

function isAnOtherOption(label: string): boolean {
  const lowered = label.trim().toLowerCase();
  return OTHER_STARTS.some((start) => lowered.startsWith(start));
}

export function otherChoiceLabel(language: RunLanguage): string {
  return OTHER_LABELS[language];
}

/** The buttons with „other, I'll write it" after them; none stays none. */
export function withOtherChoice(
  choices: readonly string[] | null,
  language: RunLanguage,
): string[] | null {
  if (choices === null || choices.length === 0) return choices === null ? null : [];
  if (choices.some(isAnOtherOption)) return [...choices];
  return [...choices, otherChoiceLabel(language)];
}

/**
 * The frontend's ask (TO_BACKEND, 3 Oct): the client recognised the appended
 * button by its exact text, a contract with our wording. This is the
 * structural half: the index of the server's „other, I'll write it" button,
 * which opens the composer and sends nothing. Undefined when the set has
 * none; a model-made „other" is a button like any other and is not flagged.
 */
export function otherChoiceIndex(choices: unknown): number | undefined {
  if (!Array.isArray(choices) || choices.length === 0) return undefined;
  const last = choices[choices.length - 1];
  const labels: readonly string[] = Object.values(OTHER_LABELS);
  return typeof last === 'string' && labels.includes(last) ? choices.length - 1 : undefined;
}

/** The field to spread next to a button set: `other_choice_index`, or nothing. */
export function otherChoiceField(choices: unknown): { other_choice_index?: number } {
  const index = otherChoiceIndex(choices);
  return index === undefined ? {} : { other_choice_index: index };
}
