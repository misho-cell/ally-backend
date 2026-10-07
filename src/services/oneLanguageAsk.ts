import { AskChoice } from './askChoices';
import { carriesLanguage, detectRunLanguage, RunLanguage } from './runLanguage';

/**
 * The tester's 44551 / 44584 (case 1 and the six cases, 7 Oct): one message to
 * a helper mixed languages. The body was English (the reader's guessed
 * language), the buttons Georgian (written by the asking model in the owner's
 * language) and „I'll answer later" English again; in the recommend case a
 * Georgian question sat under an English lead-in because its translation did
 * not happen. One message is in one language: the body's, when the body is
 * not in the language guessed for the reader.
 */
enum Script {
  Georgian = 'georgian',
  Cyrillic = 'cyrillic',
  Latin = 'latin',
}

const SCRIPT_OF_LANGUAGE: Readonly<Record<RunLanguage, Script>> = {
  ka: Script.Georgian,
  ru: Script.Cyrillic,
  en: Script.Latin,
  es: Script.Latin,
};

const LETTER_RE = /\p{L}/u;

/** The script a text is written in; null for a text with no letters. */
function scriptOf(text: string): Script | null {
  if (!LETTER_RE.test(text)) return null;
  return SCRIPT_OF_LANGUAGE[detectRunLanguage(text)];
}

/** The language the whole message goes in: the reader's, unless the body is in another script. */
export function messageLanguage(body: string, readerLanguage: RunLanguage): RunLanguage {
  // „one more thing" says nothing about a language; the reader's own stands.
  if (!carriesLanguage(body)) return readerLanguage;
  const script = scriptOf(body);
  if (script === null || script === SCRIPT_OF_LANGUAGE[readerLanguage]) return readerLanguage;
  return detectRunLanguage(body);
}

/** True when a button's label is written in the message's script (or has no letters). */
export function labelFits(label: string, language: RunLanguage): boolean {
  const script = scriptOf(label);
  return script === null || script === SCRIPT_OF_LANGUAGE[language];
}

export function choicesFit(choices: readonly AskChoice[], language: RunLanguage): boolean {
  return choices.every((choice) => labelFits(choice.label, language));
}
