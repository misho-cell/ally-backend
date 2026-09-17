import { normalizePhone, phoneDigits } from './phone';

/**
 * Store reviewers and QA test accounts, in one place because two doors have to
 * agree about them.
 *
 * Reviewers (Paddle, the app stores) and the tester's accounts must log into
 * the LIVE app and cannot receive a Georgian SMS. `REVIEW_PHONE` is a
 * comma-separated list of numbers and `REVIEW_OTP` is the code they verify
 * with; both must be set or the whole mechanism is off, which is how it is
 * meant to spend most of its life.
 *
 * WHY THIS MOVED OUT OF auth.service — 17 September, Misho: „the test accounts
 * do not work". The OTP half was right and it was never the wall. A number on
 * the review list still had to pass the INVITE GATE, and `invite_only` is
 * enabled on the live base: a phone nobody has invited, with no cohort code
 * and no social proof, is refused with `referral_required` before the OTP is
 * even looked at. So the bypass opened the second door and left the first one
 * locked, and the test accounts could not be created at all.
 *
 * The gate and the OTP check now read the same list, from here.
 *
 * WHAT BEING ON THIS LIST NOW MEANS, written out because it is a lot for one
 * environment variable to carry and nobody should have to read three files to
 * find out:
 *
 *   - no SMS is ever sent to the number
 *   - it verifies with the fixed REVIEW_OTP instead of a real code
 *   - it passes the invite gate as „the company invited itself"
 *   - it gets a 365-day pro subscription at registration
 *
 * All four are gone the moment the two variables are unset, which is the undo
 * and the reason the mechanism is env-driven rather than a column: there is no
 * state to clean up afterwards.
 */
export function reviewLoginDigits(): ReadonlySet<string> {
  const phones = process.env.REVIEW_PHONE;
  if (!phones || !process.env.REVIEW_OTP) return new Set();
  return new Set(
    phones
      .split(',')
      .map((p) => phoneDigits(normalizePhone(p.trim())))
      .filter(Boolean),
  );
}

/**
 * Normalized before comparing, on both sides: the login screen suggests the
 * local „5XX…" spelling while the variable is likely to hold the full form,
 * and an exact string compare would quietly match neither.
 */
export function isReviewPhone(phone: string): boolean {
  return reviewLoginDigits().has(phoneDigits(normalizePhone(phone)));
}
