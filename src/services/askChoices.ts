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
  /** 2907: on a reader's own person, what she saved about them and was shown beside the name. */
  readonly detail?: string;
}

export const MIN_ASK_CHOICES = 2;
export const MAX_ASK_CHOICES = 4;
export const MAX_CHOICE_CHARS = 40;
export const MAX_CHOICE_DETAIL_CHARS = 80;

const MEANINGS: ReadonlySet<string> = new Set(Object.values(ChoiceMeaning));

function parseOne(raw: unknown): AskChoice | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const { label, means } = raw as { label?: unknown; means?: unknown };
  if (typeof label !== 'string' || typeof means !== 'string' || !MEANINGS.has(means)) return null;
  const trimmed = label.trim();
  if (trimmed === '' || trimmed.length > MAX_CHOICE_CHARS) return null;
  const { detail } = raw as { detail?: unknown };
  const kept =
    typeof detail === 'string' && detail.trim() !== '' && detail.length <= MAX_CHOICE_DETAIL_CHARS
      ? detail.trim()
      : undefined;
  return { label: trimmed, means: means as ChoiceMeaning, ...(kept && { detail: kept }) };
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
 * 2579 (ask 16669, 8 Oct): „რომელ სპორტდარბაზში დადიხარ?" carried the button
 * „ამ სპორტდარბაზში დავდივარ" — „I go to THIS gym", and no gym is named. A
 * concrete answer that only points („this", „that") answers nothing; it goes.
 * Only when the buttons left are still a valid set.
 */
const POINTING_OPENINGS: ReadonlySet<string> = new Set([
  'ამ',
  'იმ',
  'this',
  'that',
  'этот',
  'эта',
  'это',
  'этом',
  'этой',
  'este',
  'esta',
  'ese',
  'esa',
]);

function onlyPoints(choice: AskChoice): boolean {
  if (choice.means !== ChoiceMeaning.Answer) return false;
  const first = choice.label.trim().split(/\s+/u)[0]?.toLowerCase() ?? '';
  return POINTING_OPENINGS.has(first);
}

export function withoutPointingAnswers(choices: readonly AskChoice[]): AskChoice[] {
  const kept = choices.filter((choice) => !onlyPoints(choice));
  return kept.length < choices.length && choicesProblem(kept) === null ? kept : [...choices];
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

/** The most of the reader's own people put beside the model's buttons (2907). */
const MAX_OWN_PEOPLE_BESIDE = MAX_ASK_CHOICES - 2;

/**
 * 2907 (the master test run's QA-029; Misho's yes, §99.4 — it bends D712's
 * „one author"): the helper's own saved dentist was no longer offered, because
 * the reader's fitting people became buttons only when the asking model wrote
 * none, and since D712 it always writes some. The asking model cannot write
 * them — it must not see the reader's phonebook — so the server puts them
 * first: the reader's people, then the model's own „no" (or the plain one),
 * then „later". Four at most.
 */
export function ownPeopleBeside(
  names: readonly string[],
  authored: readonly AskChoice[],
  plainNo: string,
  later: string,
): AskChoice[] {
  const people = names
    .slice(0, MAX_OWN_PEOPLE_BESIDE)
    .map((label) => ({ label, means: ChoiceMeaning.Answer }));
  const no = authored.find((choice) => choice.means === ChoiceMeaning.No) ?? {
    label: plainNo,
    means: ChoiceMeaning.No,
  };
  return [...people, no, { label: later, means: ChoiceMeaning.Later }];
}

/** 2907: each of the reader's own people carries what the line showed beside the name. */
export function withPeopleDetails(
  choices: readonly AskChoice[],
  details: Readonly<Record<string, string>>,
): AskChoice[] {
  return choices.map((choice) =>
    choice.means === ChoiceMeaning.Answer && details[choice.label]
      ? { ...choice, detail: details[choice.label] }
      : choice,
  );
}

/**
 * 2907 (46235): a tap on the reader's own person, read as what she was shown —
 * „ნინო სტომატოლოგი (კლინიკა ღიმილი, ვაკე)" — so her assistant passes the
 * clinic she approved with the tap, not the bare name. Null for anything else.
 */
/**
 * 2186 (the founder's own screen, 7 Oct: „it is not human alike"): asked whom
 * she would recommend, the helper could name only one — one button per person.
 * The buttons stay four; „both" / „all of them", typed or said, is every person
 * offered, each with what she saved beside the name.
 */
const ALL_OF_THEM_RE =
  /^\s*(?:ორივე|სამივე|ყველა|ორივეს|სამივეს|both|all\s+(?:of\s+them|three)|оба|обе|все|ambos|ambas|todos)(?:[\s,]+\S+){0,3}[\s.!,)]*$/iu;

export function allPeopleText(message: string, choices: readonly AskChoice[]): string | null {
  if (!ALL_OF_THEM_RE.test(message)) return null;
  const people = choices.filter((choice) => choice.means === ChoiceMeaning.Answer);
  if (people.length < 2) return null;
  return people
    .map((person) => (person.detail ? `${person.label} (${person.detail})` : person.label))
    .join('; ');
}

export function tappedPersonText(message: string, choices: readonly AskChoice[]): string | null {
  const said = message.trim().toLowerCase();
  const pressed = choices.find(
    (choice) => choice.detail !== undefined && choice.label.toLowerCase() === said,
  );
  return pressed ? `${pressed.label} (${pressed.detail})` : null;
}
