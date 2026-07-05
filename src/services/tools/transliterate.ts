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

// Common Georgian→Latin spelling drift: the canonical multi-letter form people
// are taught vs. how they actually type the sound. Applied to Latin terms so
// one query matches tags stored under either spelling (ISSUE 4). Not lossless —
// a dropped letter (ღ written as nothing) can't be reconstructed; full
// forgiveness needs a normalized index, tracked separately.
const DRIFT_PAIRS: readonly [string, string][] = [
  ['gh', 'r'], // ღ
  ['kh', 'x'], // ხ
  ['ts', 'c'], // ც / წ
  ['q', 'k'], // ყ / ქ
  ['zh', 'j'], // ჟ
];

const MAX_TERMS = 8;

function driftVariants(term: string): string[] {
  const out = new Set<string>([term]);
  for (const [from, to] of DRIFT_PAIRS) {
    const swapped = term.split(from).join(to);
    if (swapped !== term) out.add(swapped);
  }
  return [...out];
}

/**
 * Query terms to try: the lowercased original, its Latin transliteration when
 * Georgian, and common drift variants of the Latin form — deduped and capped.
 */
export function buildSearchTerms(rawQuery: string): readonly string[] {
  const lower = rawQuery.trim().toLowerCase();
  if (!lower) return [];
  const terms = new Set<string>([lower]);
  const latin = hasGeorgian(lower) ? georgianToLatin(lower) : lower;
  for (const variant of driftVariants(latin)) terms.add(variant);
  return [...terms].slice(0, MAX_TERMS);
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
