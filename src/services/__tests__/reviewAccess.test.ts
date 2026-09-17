import { isReviewPhone, reviewLoginDigits } from '../reviewAccess';

/**
 * 17 September, Misho: „the test accounts do not work, and I need five to give
 * the tester".
 *
 * The OTP half was right and was never the wall. A number on the review list
 * still had to pass the INVITE GATE, and `invite_only` is enabled on the live
 * base — so a phone nobody has invited, with no cohort code and no social
 * proof, is refused with `referral_required` before the OTP is looked at. The
 * bypass opened the second door and left the first one locked.
 *
 * These hold the shape of the list itself, which is the part both doors share.
 */
const ORIGINAL = { phone: process.env.REVIEW_PHONE, otp: process.env.REVIEW_OTP };

afterEach(() => {
  process.env.REVIEW_PHONE = ORIGINAL.phone;
  process.env.REVIEW_OTP = ORIGINAL.otp;
  if (ORIGINAL.phone === undefined) delete process.env.REVIEW_PHONE;
  if (ORIGINAL.otp === undefined) delete process.env.REVIEW_OTP;
});

function withEnv(phone?: string, otp?: string): void {
  if (phone === undefined) delete process.env.REVIEW_PHONE;
  else process.env.REVIEW_PHONE = phone;
  if (otp === undefined) delete process.env.REVIEW_OTP;
  else process.env.REVIEW_OTP = otp;
}

describe('the review list is OFF unless both variables are set', () => {
  it('is empty with neither', () => {
    withEnv(undefined, undefined);

    expect(reviewLoginDigits().size).toBe(0);
    expect(isReviewPhone('+995555000001')).toBe(false);
  });

  it('is empty with the numbers but no code', () => {
    // Half-configured must be OFF, not half-open: a list with no code would
    // mean those numbers skip the invite gate and still cannot log in, which
    // is the worst of both.
    withEnv('+995555000001', undefined);

    expect(isReviewPhone('+995555000001')).toBe(false);
  });

  it('is empty with a code but no numbers', () => {
    withEnv(undefined, '123456');

    expect(reviewLoginDigits().size).toBe(0);
  });
});

describe('matching a number', () => {
  beforeEach(() => withEnv('+995555000001,+995555000002', '123456'));

  it('matches every number on the list', () => {
    expect(isReviewPhone('+995555000001')).toBe(true);
    expect(isReviewPhone('+995555000002')).toBe(true);
  });

  it('matches whatever spelling the login screen sends', () => {
    // The screen suggests the local form; the variable holds the full one. An
    // exact string compare would match neither, which is the failure mode this
    // whole codebase keeps finding in phone handling.
    for (const spelling of ['995555000001', '+995 555 00 00 01', '555000001']) {
      expect(isReviewPhone(spelling)).toBe(true);
    }
  });

  it('matches nobody else', () => {
    expect(isReviewPhone('+995555000003')).toBe(false);
    expect(isReviewPhone('+995599111222')).toBe(false);
  });

  it('survives spaces around the commas', () => {
    withEnv(' +995555000001 , +995555000002 ', '123456');

    expect(isReviewPhone('+995555000002')).toBe(true);
  });

  it('is not fooled by an empty entry in the list', () => {
    withEnv('+995555000001,,', '123456');

    expect(reviewLoginDigits().size).toBe(1);
    expect(isReviewPhone('')).toBe(false);
  });
});
