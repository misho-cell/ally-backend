import { APPROVE_LABEL, CHANGE_LABEL } from './choiceNotes';

/**
 * #6364, RULE D846 (Giorgi, 19 Oct 21:01 Tbilisi: „დაიმალოს ეგ შორთქათები"):
 * no card carries a shortcut-answer button — not the plan card's others, not
 * the helper's card, not an answer or reminder card. People answer by writing
 * or speaking in the chat field. One exception, confirmed by Giorgi: the plan
 * card keeps its two buttons, „ვადასტურებ" and „შევცვალოთ", exactly as before.
 *
 * Applied where buttons are stored and where they leave the server (history and
 * live events), so a card written before this rule shows none either.
 */
const KEPT_LABELS: ReadonlySet<string> = new Set([
  ...Object.values(APPROVE_LABEL),
  ...Object.values(CHANGE_LABEL),
]);

/** The plan card's own buttons, and nothing else; null when none remain. */
export function onlyPlanButtons(choices: unknown): string[] | null {
  if (!Array.isArray(choices)) return null;
  const kept = choices.filter(
    (label): label is string => typeof label === 'string' && KEPT_LABELS.has(label.trim()),
  );
  return kept.length > 0 ? kept : null;
}
