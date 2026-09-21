/**
 * A TypeScript twin of the database's `normalize_search_token` (migration 043).
 *
 * WHY IT EXISTS. The fuzzy tag pass compares
 * `normalize_search_token(tag) % normalize_search_token($term)`, so two query
 * terms with the SAME normalized form are the same pattern to the database —
 * a second one costs a full extra `%` + `similarity` evaluation and buys no
 * row the first did not already reach.
 *
 * Measured on the live function, 21 September, over the six terms the tag
 * search builds for „santexniki":
 *
 *   santexniki · santekhniki · santexniqi · სანთეხნიქი · სანტეხნიქი · სანთეხნიკი
 *     → all six normalize to `santekniki`
 *
 * Six terms, one pattern. Same for „accountant" (six → `accountant`),
 * „marketing" and „advokati". The pass charges per term and its cost is steep
 * (3 terms 405 ms, 6 terms 2 179 ms on this database), so the redundancy is
 * paid in seconds of somebody's search.
 *
 * TWO IMPLEMENTATIONS OF ONE RULE IS THE RISK, and it is the reason for the
 * test beside this file: it reads 043_normalize_georgian.sql and asserts the
 * letters and folds below are the ones the database actually uses. If the SQL
 * changes and this does not, that test fails rather than the search quietly
 * deduplicating by a rule the database no longer applies.
 */

/** `translate()`'s first argument: the Georgian alphabet, in the SQL's order. */
export const GEORGIAN_LETTERS = 'აბგდევზთიკლმნოპჟრსტუფქღყშჩცძწჭხჯჰ';
/** `translate()`'s second argument: one Latin letter per Georgian letter. */
export const LATIN_LETTERS = 'abgdevztiklmnopjrstufkgkscczcckjh';

/** The digraph and letter folds applied after transliteration, in SQL order. */
export const FOLDS: readonly (readonly [string, string])[] = [
  ['gh', 'g'],
  ['kh', 'k'],
  ['zh', 'j'],
  ['ts', 'c'],
  ['x', 'k'],
  ['q', 'k'],
];

const LETTER_MAP = new Map<string, string>(
  [...GEORGIAN_LETTERS].map((letter, index) => [letter, LATIN_LETTERS[index]]),
);

/**
 * The normalized form the database will compare this term by: Georgian letters
 * to Latin first, then the digraph folds — the same order as the SQL, because
 * transliteration produces letters the folds then act on.
 */
export function normalizeSearchToken(input: string): string {
  let out = '';
  for (const character of input.toLowerCase()) out += LETTER_MAP.get(character) ?? character;
  for (const [from, to] of FOLDS) out = out.split(from).join(to);
  return out;
}
