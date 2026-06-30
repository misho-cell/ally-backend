// Canonical phone format for comparisons (blocking, exclusion, etc.).
// Goal: "599 12 34 56", "995599123456", and "+995599123456" all map to the
// same value. Georgia (+995) is the default country code for local numbers.

const GEORGIA_CC = '995';
const GEORGIA_LOCAL_LEN = 9; // local Georgian numbers are 9 digits

export function normalizePhone(raw: string | null | undefined): string {
  if (!raw) return '';

  // Keep digits only; drop spaces, dashes, parentheses, leading +.
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 0) return '';

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
