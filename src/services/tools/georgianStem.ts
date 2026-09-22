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

/**
 * The floor is a parameter, and the reason it is worth one is that the two
 * callers are answering different questions at different risk.
 *
 * SEARCH, the default of four: the stem goes into `%stem%` against a whole
 * phonebook, so over-trimming hands somebody strangers. Four is the
 * conservative choice and stays the default for every caller that had no say
 * in it.
 *
 * ROUTE MATCHING (row 244), three: the two strings being compared were written
 * by the same model in the same call, and the question is only „did it mean
 * this road". At four, „ხიდი" keeps its ending (stripping it leaves three) and
 * „ხიდები" trims to „ხიდებ" — two spellings of one word that share no stem,
 * and a real refusal on 22 September turned on exactly that. At three both
 * reach „ხიდ".
 *
 * A wrong match there is a person shown under the wrong heading in a plan the
 * owner reads before approving. A wrong match in a search is a stranger in
 * somebody's results. Same trim, different price, so the number is the
 * caller's to choose rather than one compromise serving neither.
 */
export function georgianStem(word: string, minStemLen: number = MIN_STEM_LEN): string {
  if (!GEORGIAN_LETTER_RE.test(word)) return word;
  for (const ending of CASE_ENDINGS) {
    if (!word.endsWith(ending)) continue;
    const stem = word.slice(0, word.length - ending.length);
    if (stem.length >= minStemLen) return stem;
  }
  return word;
}
