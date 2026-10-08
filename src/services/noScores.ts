/**
 * 3236 (ME-032, seat 179995, 2 of 3): „შენი აზრით, როგორი ადამიანი ვარ?
 * შემაფასე ქულით." → „პირველი შთაბეჭდილებით, ૮/૧૦. პირდაპირი ხარ…" (the score in
 * Gujarati digits), and „Rate my networking skills from 1 to 10" → „my early
 * read is 6/10". The rule: never a score or a rating of the owner; and digits
 * are always 0-9 (Persian ones in 3106 too).
 */

/** Zero of each decimal-digit script Netai has met or may meet in a reply. */
const DIGIT_ZEROS: readonly number[] = [
  0x0660, // Arabic-Indic
  0x06f0, // Persian
  0x0966, // Devanagari
  0x09e6, // Bengali
  0x0a66, // Gurmukhi
  0x0ae6, // Gujarati
  0x0b66, // Oriya
  0x0be6, // Tamil
  0x0c66, // Telugu
  0x0ce6, // Kannada
  0x0d66, // Malayalam
  0x0e50, // Thai
  0x0ed0, // Lao
  0x0f20, // Tibetan
  0x1040, // Myanmar
  0x17e0, // Khmer
  0x1810, // Mongolian
  0xff10, // Fullwidth
];

const DIGIT_VALUE: ReadonlyMap<number, number> = new Map(
  DIGIT_ZEROS.flatMap((zero) => Array.from({ length: 10 }, (_, d) => [zero + d, d] as const)),
);

/** Every Unicode decimal digit that is not 0-9, as its value. */
function asciiDigit(ch: string): string {
  const value = DIGIT_VALUE.get(ch.codePointAt(0) ?? 0);
  return value === undefined ? ch : String(value);
}

const FOREIGN_DIGIT_RE = new RegExp(
  `[${DIGIT_ZEROS.map((z) => `\\u{${z.toString(16)}}-\\u{${(z + 9).toString(16)}}`).join('')}]`,
  'gu',
);

/** The reply with every foreign digit written 0-9. */
export function withPlainDigits(reply: string): string {
  return reply.replace(FOREIGN_DIGIT_RE, asciiDigit);
}

/** The owner asks to be rated or scored. */
const ASKS_FOR_A_SCORE_RE =
  /(შემაფას|ქულით|ქულა\s+დამიწერე|\brate\s+(?:me|my)\b|\bscore\s+(?:me|my)\b|from\s+1\s+to\s+10|1\s*-\s*10|оцени\s+меня|по\s+шкале|puntúa|califica)/iu;

export function asksForAScore(ownerLine: string): boolean {
  return ASKS_FOR_A_SCORE_RE.test(ownerLine);
}

/** „6/10", „8 / 10", „7 out of 10", „8 ქულა 10-დან". */
const SCORE_RE =
  /\b\d{1,2}(?:[.,]\d)?\s*(?:\/\s*10\b|out\s+of\s+10\b|ქულა\s+10|из\s+10\b|de\s+10\b)/iu;
const SENTENCE_RE = /[^.!?\n]+[.!?]*\s*/gu;

/** The reply without the sentences that give a score; unchanged when none does. */
export function withoutScores(reply: string): string {
  if (!SCORE_RE.test(reply)) return reply;
  const kept = (reply.match(SENTENCE_RE) ?? []).filter((sentence) => !SCORE_RE.test(sentence));
  const out = kept.join('').trim();
  return out === '' ? reply : out;
}
