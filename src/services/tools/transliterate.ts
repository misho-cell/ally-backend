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

export function buildSearchTerms(rawQuery: string): readonly string[] {
  const lower = rawQuery.toLowerCase();
  if (!hasGeorgian(lower)) return [lower];
  const transliterated = georgianToLatin(lower);
  return transliterated === lower ? [lower] : [lower, transliterated];
}
