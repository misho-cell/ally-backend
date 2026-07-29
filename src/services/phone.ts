// Canonical phone format for comparisons (blocking, exclusion, etc.).
// Goal: "599 12 34 56", "995599123456", and "+995599123456" all map to the
// same value. Georgia (+995) is the default country code for local numbers.

const GEORGIA_CC = '995';
const GEORGIA_LOCAL_LEN = 9; // local Georgian numbers are 9 digits

export function normalizePhone(raw: string | null | undefined): string {
  if (!raw) return '';

  // Keep digits only; drop spaces, dashes, parentheses, leading +.
  let digits = raw.replace(/\D/g, '');
  if (digits.length === 0) return '';

  // Trunk-prefixed local form ("0599 12 34 56") — drop the leading zero so it
  // folds into the same canonical value as "599123456" / "+995599123456".
  if (digits.startsWith('0') && digits.length === GEORGIA_LOCAL_LEN + 1) {
    digits = digits.slice(1);
  }

  // Already has the Georgian country code.
  if (digits.startsWith(GEORGIA_CC) && digits.length > GEORGIA_LOCAL_LEN) {
    return '+' + digits;
  }

  // Bare local Georgian number → prepend country code.
  if (digits.length === GEORGIA_LOCAL_LEN) {
    return '+' + GEORGIA_CC + digits;
  }

  // Otherwise assume it already includes a country code.
  return '+' + digits;
}

/**
 * Digits-only canonical key for format-independent DB comparisons — pairs with
 * SQL `regexp_replace(col, '\D', '', 'g')` on the other side.
 */
export function phoneDigits(raw: string | null | undefined): string {
  return normalizePhone(raw).replace(/\D/g, '');
}
