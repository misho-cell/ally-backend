const GEO_TO_LATIN: readonly [string, string][] = [
  ['ა', 'a'],
  ['ბ', 'b'],
  ['გ', 'g'],
  ['დ', 'd'],
  ['ე', 'e'],
  ['ვ', 'v'],
  ['ზ', 'z'],
  ['თ', 't'],
  ['ი', 'i'],
  ['კ', 'k'],
  ['ლ', 'l'],
  ['მ', 'm'],
  ['ნ', 'n'],
  ['ო', 'o'],
  ['პ', 'p'],
  ['ჟ', 'zh'],
  ['რ', 'r'],
  ['ს', 's'],
  ['ტ', 't'],
  ['უ', 'u'],
  ['ფ', 'f'],
  ['ქ', 'k'],
  ['ღ', 'gh'],
  ['ყ', 'q'],
  ['შ', 'sh'],
  ['ჩ', 'ch'],
  ['ც', 'ts'],
  ['ძ', 'dz'],
  ['წ', 'ts'],
  ['ჭ', 'ch'],
  ['ხ', 'kh'],
  ['ჯ', 'j'],
  ['ჰ', 'h'],
];

const GEO_REGEX = /[ა-ჿ]/;

export function hasGeorgian(text: string): boolean {
  return GEO_REGEX.test(text);
}

export function georgianToLatin(text: string): string {
  let result = text;
  for (const [geo, lat] of GEO_TO_LATIN) {
    result = result.split(geo).join(lat);
  }
  return result;
}

// Common Georgian/Armenian→Latin spelling drift: the canonical multi-letter
// form people are taught vs. how they actually type the sound. Applied to Latin
// terms so one query matches tags stored under either spelling (ISSUE 4 / search
// Bug 3). Each entry rewrites every occurrence of `from` → `to` in the seed.
// Genuinely two-way sounds are listed in BOTH directions — e.g. q↔k, so a query
// for "chikava" also generates "chiqava" (the k→q direction was the gap). One-way
// entries (gh→g "drop the h") are listed once so we don't rewrite every plain
// g/h and flood the query with noise. Not lossless — a fully dropped letter can't
// be reconstructed; full forgiveness needs the normalized index (migration 036).
const DRIFT_PAIRS: readonly [string, string][] = [
  ['gh', 'r'], // ღ — "gh" → typed "r"
  ['gh', 'g'], // ღ — "gh" → typed "g" (drop the h)
  ['kh', 'x'], // ხ — "kh" → "x"
  ['kh', 'h'], // ხ — "kh" → "h" (drop the k)
  ['x', 'kh'], // ხ — "x" → "kh"
  ['ts', 'c'], // ც / წ — "ts" → "c"
  ['c', 'ts'], // ც / წ — "c" → "ts"
  ['q', 'k'], // ყ / ქ — "q" → "k"
  ['k', 'q'], // ქ / ყ — "k" → "q"  (Chikava ↔ Chiqava)
  ['zh', 'j'], // ჟ — "zh" → "j"
];

// Armenian surname endings people spell interchangeably (asriants / asriyants /
// asriiants). Fold them so the caller needn't guess which the tag was saved as.
// Longest first so "petrosyants" matches "yants" (stem "petros"), not the "ants"
// substring (which would leave a stray "y" in the stem).
const ARMENIAN_ENDINGS: readonly string[] = ['iants', 'yants', 'ants'];

const MAX_TERMS = 12;

function driftVariants(term: string): string[] {
  const out = new Set<string>([term]);
  for (const [from, to] of DRIFT_PAIRS) {
    const swapped = term.split(from).join(to);
    if (swapped !== term) out.add(swapped);
  }
  return [...out];
}

// If the term ends in one of the interchangeable Armenian endings, also emit the
// term with each of the other endings; otherwise return it unchanged.
function endingVariants(term: string): string[] {
  for (const ending of ARMENIAN_ENDINGS) {
    if (term.endsWith(ending)) {
      const stem = term.slice(0, term.length - ending.length);
      return ARMENIAN_ENDINGS.map((e) => stem + e);
    }
  }
  return [term];
}

/**
 * Query terms to try: the lowercased original, its Latin transliteration when
 * Georgian, common drift variants of the Latin form, and Armenian-ending folds —
 * deduped and capped.
 */
export function buildSearchTerms(rawQuery: string): readonly string[] {
  const lower = rawQuery.trim().toLowerCase();
  if (!lower) return [];
  const terms = new Set<string>([lower]);
  const latin = hasGeorgian(lower) ? georgianToLatin(lower) : lower;
  for (const drift of driftVariants(latin)) {
    for (const withEnding of endingVariants(drift)) terms.add(withEnding);
  }
  return [...terms].slice(0, MAX_TERMS);
}

/**
 * Split a multi-word query into per-word variant groups, each the full set of
 * word-start patterns for that word (transliteration + drift folds). A caller
 * can then rank a contact by HOW MANY distinct query words it matched — so
 * "Dachi Axel" ranks the one person carrying both tags above the ~150 who carry
 * only the common "Axel" (search Bug 2). A single-word query yields one group,
 * degrading to the plain single-term behaviour.
 */
export function buildWordGroups(rawQuery: string): string[][] {
  const words = rawQuery.trim().split(/\s+/).filter(Boolean);
  return words
    .map((word) => buildSearchTerms(word).map(toWordStartPattern))
    .filter((group) => group.length > 0);
}

/**
 * A Postgres regex that anchors a term to the START of a word, so "nasa"
 * matches the word "nasa..." but never the fragment inside "Inasaridze"
 * (ISSUE 3). Word-start (not exact) keeps prefix typing ("law" → "lawyer")
 * working. Regex metacharacters in the term are escaped.
 */
export function toWordStartPattern(term: string): string {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return '\\m' + escaped;
}
