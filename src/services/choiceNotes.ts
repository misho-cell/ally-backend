import { RunLanguage } from './runLanguage';

/**
 * ROW 306 — ONE LINE UNDER A BUTTON THAT DOES MORE THAN ITS LABEL ADMITS.
 *
 * The frontend asked for this narrowly, and was right to: a note under every
 * button teaches people to stop reading notes. So it is populated only where a
 * tap does something the label does not say — today exactly one button, plan
 * approval, because approving is what lets Netai write to real people in the
 * owner's name, and „I approve" does not say so.
 *
 * The note's language is the LABEL's language, not a guess about the reader:
 * the label on screen is already the conversation's, so the note matches it.
 */

/** The approve button's label per language — the one place it is defined. */
export const APPROVE_LABEL: Readonly<Record<RunLanguage, string>> = {
  // #1288 (Lika, 5 Oct): „ვადასტურებ" — the same present act, in her words.
  ka: 'ვადასტურებ',
  en: 'I approve',
  ru: 'Подтверждаю',
  es: 'Lo apruebo',
};

/** The change button's label per language, beside approve so both cards use one wording. */
export const CHANGE_LABEL: Readonly<Record<RunLanguage, string>> = {
  ka: 'შევცვალოთ',
  en: 'Change it',
  ru: 'Изменить',
  es: 'Cambiarlo',
};

const APPROVE_NOTE: Readonly<Record<RunLanguage, string>> = {
  ka: 'დადასტურების შემდეგ Netai შენი სახელით მისწერს გეგმაში დასახელებულ ადამიანებს.',
  en: 'Once you approve, Netai writes to the people in the plan in your name.',
  ru: 'После подтверждения Netai напишет людям из плана от вашего имени.',
  es: 'Al aprobar, Netai escribe a las personas del plan en tu nombre.',
};

function noteFor(label: string): string | null {
  const entry = Object.entries(APPROVE_LABEL).find(([, approve]) => approve === label.trim());
  return entry === undefined ? null : APPROVE_NOTE[entry[0] as RunLanguage];
}

/** `{ label: note }` for the buttons that need one, or undefined when none do. */
export function choiceNotesFor(choices: unknown): Readonly<Record<string, string>> | undefined {
  if (!Array.isArray(choices)) return undefined;
  const notes: Record<string, string> = {};
  for (const choice of choices) {
    if (typeof choice !== 'string') continue;
    const note = noteFor(choice);
    if (note !== null) notes[choice] = note;
  }
  return Object.keys(notes).length > 0 ? notes : undefined;
}
