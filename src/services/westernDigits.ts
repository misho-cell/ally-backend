/**
 * 3106 (ST-009, 8 Oct): a Georgian weather reply came out with Persian digits
 * („ტენიანობა ۵۴-۸۸%"). Live, 14 days: 1 assistant message in 122,266. Rare,
 * but a digit the reader cannot read is a wrong answer, and a phone number
 * written in those digits would also pass the phone scrub, which reads 0–9.
 * So every final reply has its Arabic-Indic and Extended Arabic-Indic digits
 * turned into 0–9 before anything else reads it.
 */
const ARABIC_INDIC_ZERO = 0x0660;
const EXTENDED_ARABIC_INDIC_ZERO = 0x06f0;
const EASTERN_DIGIT_RE = /[٠-٩۰-۹]/gu;

function westernDigit(digit: string): string {
  const code = digit.codePointAt(0) ?? 0;
  const zero = code >= EXTENDED_ARABIC_INDIC_ZERO ? EXTENDED_ARABIC_INDIC_ZERO : ARABIC_INDIC_ZERO;
  return String(code - zero);
}

/** The same text with every Eastern Arabic digit written as 0–9. */
export function westernDigits(text: string): string {
  return text.replace(EASTERN_DIGIT_RE, westernDigit);
}
