import { buildMeaningWordGroups, toWordStartPattern } from './transliterate';

/**
 * #8647 (the tester's 81446; example 3 for Misho, the TBC loan test): the
 * second circle searched „თიბისი ბანკი", found 52 people, ranked them by how
 * many friends hold them, and cut at 50 — the credit officer the owner needed
 * for a stuck business loan was lost in the cut. The search knew the company
 * and not the need. The owner's own words („ბიზნეს სესხი") now rank, among the
 * people who match the search equally, the ones whose labels say the need.
 */
const MAX_NEED_GROUPS = 8;
const MIN_NEED_WORD_CHARS = 4;
/**
 * Words of asking, not of the need: „ვინმე მჭირდება" („I need someone") says
 * nothing about who. A group whose first spelling starts with one of these is
 * left out, so only the need itself ranks.
 */
const ASKING_STEMS: readonly string[] = [
  'ვინმე',
  'ვიღაც',
  'მჭირდებ',
  'მინდა',
  'ვეძებ',
  'მოძებნ',
  'მეძებნ',
  'გამეჭედ',
  'დამეხმარ',
  'იქნებ',
  'ხომ',
  'რომელიც',
  'კარგ',
  'სანდო',
  'ძალიან',
  'ახლა',
  'სასწრაფოდ',
  'someone',
  'somebody',
  'need',
  'want',
  'looking',
  'find',
  'help',
  'please',
  'good',
  'urgent',
];

function isAskingWord(word: string): boolean {
  const w = word.toLowerCase();
  return ASKING_STEMS.some((stem) => w.startsWith(stem));
}

/** One alternation of the owner's need words, minus the search's own; null when none. */
export function needPattern(ownerLine: string, searchGroups: readonly string[][]): string | null {
  const searched = new Set(searchGroups.flat().map((w) => w.toLowerCase()));
  const groups = buildMeaningWordGroups(ownerLine)
    .filter((group) => group.every((w) => !searched.has(w.toLowerCase())))
    .filter((group) => !isAskingWord(group[0] ?? ''))
    .slice(0, MAX_NEED_GROUPS);
  const words = groups.flat().filter((w) => w.length >= MIN_NEED_WORD_CHARS);
  return words.length === 0 ? null : words.map(toWordStartPattern).join('|');
}
