import { georgianToLatin, nameKey, splitIntoWords } from './transliterate';
import { canonicalNameForm } from './nameForms';

/**
 * 5908 (founder P1): which of the labels OTHER members saved on a number may be
 * told to the owner as the names the network knows that number by.
 *
 * Row 289 (D539 / D523) keeps other people's words private, and that stands for
 * everything that is not a name: „deda nino" or „gizhi levani" say who saved
 * the number and what they think, and never reach the run. A label is given
 * only when every word of it is
 *   - a word the owner just asked by (in either script, or another form of the
 *     same first name) — the owner's own words, as Misho ruled on 2 October; or
 *   - a word at least two different members put on the number independently —
 *     the network's word, not one person's (the floor aboutMe uses for the
 *     names others saved a member as).
 * Only the label text is given; never who saved it.
 */

export enum LabelKind {
  Alias = 'alias',
  Tag = 'tag',
}

export interface NetworkLabel {
  /** Internal only — used to count distinct savers, never returned. */
  readonly saverId: string;
  readonly label: string;
  readonly kind: LabelKind;
}

/** Two members saving the same word is the network's word (aboutMe's floor). */
const MIN_SAVERS_FOR_A_WORD = 2;
/** At most this many names travel — enough to recognise the person. */
const MAX_NETWORK_NAMES = 5;
/** An asked word this short must match a whole word, as in toWordStartPattern. */
const EXACT_WORD_MAX_CHARS = 4;
const HAS_LETTER_RE = /\p{L}/u;
/** ფ is typed as „p" as often as „f" (transliterate's DRIFT_PAIRS). */
const P_AS_F_RE = /p/g;

/** The form one word is compared by: Latin, one spelling, one form of a first name. */
export function nameWordKey(word: string): string {
  const latin = georgianToLatin(word.toLocaleLowerCase());
  return nameKey(canonicalNameForm(latin)).replace(P_AS_F_RE, 'f');
}

/** The keys of every spelling the name search built for the owner's words. */
export function askedWordKeys(groups: readonly (readonly string[])[]): ReadonlySet<string> {
  return new Set(
    groups
      .flat()
      .map(nameWordKey)
      .filter((key) => key !== ''),
  );
}

function wasAsked(key: string, asked: ReadonlySet<string>): boolean {
  if (asked.has(key)) return true;
  return [...asked].some((a) => a.length > EXACT_WORD_MAX_CHARS && key.startsWith(a));
}

function labelKeys(label: string): string[] {
  return splitIntoWords(label)
    .map(nameWordKey)
    .filter((key) => key !== '');
}

/** How many different members put each word on the number — names (aliases) only. */
function saversPerWord(labels: readonly NetworkLabel[]): ReadonlyMap<string, number> {
  const savers = new Map<string, Set<string>>();
  for (const { saverId, label, kind } of labels) {
    if (kind !== LabelKind.Alias) continue;
    for (const key of labelKeys(label)) {
      const set = savers.get(key) ?? new Set<string>();
      set.add(saverId);
      savers.set(key, set);
    }
  }
  return new Map([...savers].map(([key, set]) => [key, set.size]));
}

function isSayable(
  label: NetworkLabel,
  keys: readonly string[],
  asked: ReadonlySet<string>,
  savers: ReadonlyMap<string, number>,
): boolean {
  if (keys.length === 0 || !HAS_LETTER_RE.test(label.label)) return false;
  return keys.every(
    (key) =>
      wasAsked(key, asked) ||
      (label.kind === LabelKind.Alias && (savers.get(key) ?? 0) >= MIN_SAVERS_FOR_A_WORD),
  );
}

/**
 * The names other members know this number by that may be said, each spelling
 * once — „Goga" and „Gogi" both, since each is how somebody knows him — and
 * never the owner's own label in any script.
 */
export function networkNamesFor(
  labels: readonly NetworkLabel[],
  ownLabel: string | null,
  asked: ReadonlySet<string>,
): string[] {
  const savers = saversPerWord(labels);
  const ownKey = ownLabel === null ? null : labelKeys(ownLabel).join(' ');
  const seen = new Set<string>();
  const names: string[] = [];
  for (const label of labels) {
    if (names.length >= MAX_NETWORK_NAMES) break;
    const keys = labelKeys(label.label);
    const shown = label.label.trim();
    const spelling = shown.toLocaleLowerCase();
    if (keys.join(' ') === ownKey || seen.has(spelling)) continue;
    if (!isSayable(label, keys, asked, savers)) continue;
    seen.add(spelling);
    names.push(shown);
  }
  return names;
}
