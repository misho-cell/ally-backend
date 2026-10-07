import { AskTap, askTapOf, laterChoice } from './askOpening';
import { RunLanguage } from './runLanguage';

/**
 * D712 (the founder, 7 Oct): „I don't want fixed buttons. Netai should
 * understand context and give relevant buttons to the case and question …
 * like a human assistant." The buttons under a question are written by the
 * same step that writes the question — never chosen by reading its words.
 *
 * Each button says what it MEANS, so the server can still act on a tap: a yes
 * tells the asker at once, a no is a recorded decline, a later offers its
 * days. An „answer" is simply the reader's reply, like typed words.
 */
export enum ChoiceMeaning {
  Yes = 'yes',
  No = 'no',
  Later = 'later',
  Answer = 'answer',
}

export interface AskChoice {
  readonly label: string;
  readonly means: ChoiceMeaning;
}

export const MIN_ASK_CHOICES = 2;
export const MAX_ASK_CHOICES = 4;
export const MAX_CHOICE_CHARS = 40;

const MEANINGS: ReadonlySet<string> = new Set(Object.values(ChoiceMeaning));

function parseOne(raw: unknown): AskChoice | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const { label, means } = raw as { label?: unknown; means?: unknown };
  if (typeof label !== 'string' || typeof means !== 'string' || !MEANINGS.has(means)) return null;
  const trimmed = label.trim();
  if (trimmed === '' || trimmed.length > MAX_CHOICE_CHARS) return null;
  return { label: trimmed, means: means as ChoiceMeaning };
}

/** The buttons as given, or null when they are missing or any one is malformed. */
export function parseAskChoices(raw: unknown): AskChoice[] | null {
  if (!Array.isArray(raw)) return null;
  const parsed = raw.map(parseOne);
  if (parsed.some((choice) => choice === null)) return null;
  return parsed as AskChoice[];
}

/**
 * D712's rule 4: what makes a set of buttons no answer set at all. Null when
 * the set is fine. Whether each button FITS the question is the editor's
 * (D711) to judge; this is only what can be judged without reading meaning.
 */
export function choicesProblem(choices: readonly AskChoice[]): string | null {
  if (choices.length < MIN_ASK_CHOICES) return `at least ${MIN_ASK_CHOICES} buttons`;
  if (choices.length > MAX_ASK_CHOICES) return `at most ${MAX_ASK_CHOICES} buttons`;
  if (choices.every((choice) => choice.means === ChoiceMeaning.Later)) return 'not only „later"';
  const labels = new Set(choices.map((choice) => choice.label.toLowerCase()));
  if (labels.size !== choices.length) return 'no two buttons with the same words';
  return null;
}

/**
 * „Later" keeps the one label the server knows in every language, because a
 * later tap is answered with days to pick from and must be recognised as one.
 */
export function withServerLater(choices: readonly AskChoice[], language: RunLanguage): AskChoice[] {
  return choices.map((choice) =>
    choice.means === ChoiceMeaning.Later ? { ...choice, label: laterChoice(language) } : choice,
  );
}

/** The fixed labels of an older ask, read as meanings — so every ask carries them. */
export function choicesFromLabels(labels: readonly string[]): AskChoice[] {
  return labels.map((label) => {
    const tap = askTapOf(label);
    const means =
      tap === AskTap.Yes
        ? ChoiceMeaning.Yes
        : tap === AskTap.Decline
          ? ChoiceMeaning.No
          : tap === AskTap.Later
            ? ChoiceMeaning.Later
            : ChoiceMeaning.Answer;
    return { label, means };
  });
}

const TAP_OF_MEANING: Readonly<Record<ChoiceMeaning, AskTap | null>> = {
  [ChoiceMeaning.Yes]: AskTap.Yes,
  [ChoiceMeaning.No]: AskTap.Decline,
  [ChoiceMeaning.Later]: AskTap.Later,
  [ChoiceMeaning.Answer]: null,
};

/** What a message means when it is one of this ask's buttons; null for anything else. */
export function tapOfChoice(message: string, choices: readonly AskChoice[]): AskTap | null {
  const said = message.trim().toLowerCase();
  const pressed = choices.find((choice) => choice.label.toLowerCase() === said);
  return pressed ? TAP_OF_MEANING[pressed.means] : null;
}
