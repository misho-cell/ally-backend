/**
 * Trim a Georgian noun's case ending down to its stem.
 *
 * Live-caught (1 Sep): a note stored as "ეძებს ინვესტორს" was invisible to a
 * search for "ინვესტორი" — the insight search matches `%word%` literally, and
 * the dative "ინვესტორს" does not contain the nominative "ინვესტორი". Every
 * inflection shares the STEM, so matching on the stem finds all of them.
 *
 * Deliberately conservative: one ending, longest first, and only when at least
 * MIN_STEM_LEN characters survive — over-trimming a short word would match far
 * more than the user asked for. A stem is always a prefix of the word it came
 * from, so `%stem%` matches everything `%word%` did and more: recall only
 * grows, nothing that used to match stops matching.
 */

// Longest first: "ებისთვის" must win over "ის" and "ს".
const CASE_ENDINGS: readonly string[] = [
  'ებისთვის',
  'ებისგან',
  'ისთვის',
  'ებამდე',
  'ისგან',
  'ებთან',
  'ებში',
  'ებზე',
  'ებით',
  'ებმა',
  'ებს',
  'ები',
  'თან',
  'ამდე',
  'ში',
  'ზე',
  'ის',
  'ით',
  'ად',
  'მა',
  'ს',
  'ი',
  'მ',
];
const MIN_STEM_LEN = 4;
const GEORGIAN_LETTER_RE = /[ა-ჰ]/u;

export function georgianStem(word: string): string {
  if (!GEORGIAN_LETTER_RE.test(word)) return word;
  for (const ending of CASE_ENDINGS) {
    if (!word.endsWith(ending)) continue;
    const stem = word.slice(0, word.length - ending.length);
    if (stem.length >= MIN_STEM_LEN) return stem;
  }
  return word;
}
