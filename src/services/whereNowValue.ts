/**
 * The tester's 49931 (1690 SMALL): after „აღარ" → „ახლა სად მუშაობს …?", the
 * owner wrote „ახლა მზიანი სამართლის ბიუროშია." and the whole sentence was
 * saved as the employer. The fact is the place, not the sentence: the filler
 * at the front, the verb and the stop at the end, and the Georgian „-ში(ა)"
 * („is at") on the last word are taken off. Anything this cannot read is kept
 * as written — a long value beats a lost one.
 */
const LEADING_FILLER: ReadonlySet<string> = new Set([
  'ახლა',
  'უკვე',
  'ამჟამად',
  'now',
  'currently',
  'already',
]);
const TRAILING_VERBS: ReadonlySet<string> = new Set(['მუშაობს', 'არის', 'ცხოვრობს', 'საქმიანობს']);
const ENGLISH_LEAD_RE = /^(?:(?:he|she|they)\s+)?(?:(?:works?|is|lives?)\s+)?(?:at|in|for)\s+/iu;
const EDGE_PUNCTUATION_RE = /^[\s„"“”'«»]+|[\s.!?…,;:„"“”'«»]+$/gu;
/** „-შია" (is at) and „-ში" (at), on the last word only. */
const LOCATIVE_SUFFIXES: readonly string[] = ['შია', 'ში'];
const GEORGIAN_VOWELS: ReadonlySet<string> = new Set(['ა', 'ე', 'ი', 'ო', 'უ']);
const GEORGIAN_LETTER_RE = /[ა-ჰ]$/u;
/** The nominative ending a consonant stem takes back once „-ში" is gone. */
const NOMINATIVE_ENDING = 'ი';
const MIN_STEM_CHARS = 2;

function withoutLocative(word: string): string {
  for (const suffix of LOCATIVE_SUFFIXES) {
    const stem = word.slice(0, -suffix.length);
    if (word.endsWith(suffix) && stem.length >= MIN_STEM_CHARS && GEORGIAN_LETTER_RE.test(stem)) {
      return GEORGIAN_VOWELS.has(stem.slice(-1)) ? stem : `${stem}${NOMINATIVE_ENDING}`;
    }
  }
  return word;
}

/** The value inside the owner's answer to „where now?". */
export function whereNowValue(line: string): string {
  const asWritten = line.trim();
  const words = asWritten.replace(EDGE_PUNCTUATION_RE, '').split(/\s+/u).filter(Boolean);
  while (words.length > 1 && LEADING_FILLER.has(words[0].toLowerCase())) words.shift();
  while (words.length > 1 && TRAILING_VERBS.has(words[words.length - 1])) words.pop();
  if (words.length === 0) return asWritten;
  words[words.length - 1] = withoutLocative(words[words.length - 1]);
  const value = words.join(' ').replace(ENGLISH_LEAD_RE, '').trim();
  return value === '' ? asWritten : value;
}
