process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

/**
 * THE REVIEW NUMBER HAS THREE DOORS AND ONLY TWO WERE HELD.
 *
 * Sabotage, 22 September: `if (isReviewPhone(phone)) return;` removed from
 * `resendOTP` — 3,746 tests passed. The identical line in `requestOTP` is
 * held, and `isReviewLogin` is held. The third door had nothing on it, and
 * `resendOTP` had no test of any kind — not the guard, not the cooldown, not
 * the send cap.
 *
 * WHAT THE MISSING LINE COSTS, and it has cost it before. A review number has
 * no stored code: `requestOTP` returns without writing one, because the fixed
 * env code is what verifies it. So a reviewer who taps „send again" reaches a
 * SELECT that can only come back empty and is told „OTP არ მოიძებნა. ჯერ კოდი
 * მოითხოვეთ" — ask for a code first. They just did. There is no way forward
 * from that screen.
 *
 * That is 17 September again in a different door: „the test accounts do not
 * work, and I need five to give the tester". That one was the invite gate and
 * it cost a day. This is the same account, the same dead end, one screen over.
 *
 * The cooldown and the cap are tested here too, because they were reached only
 * by `requestOTP` before and this function has its own copies.
 */
jest.mock('../../db/postgres/client', () => ({ query: jest.fn(), __esModule: true }));
jest.mock('../whatsapp.service', () => ({
  __esModule: true,
  sendWhatsAppMessage: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../twilio.service', () => ({
  __esModule: true,
  sendSmsOtp: jest.fn().mockResolvedValue(undefined),
  checkTwilioCode: jest.fn().mockResolvedValue(false),
}));
jest.mock('../contacts.service', () => ({
  __esModule: true,
  createUserPhoneNode: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../inviteGate.service', () => ({
  __esModule: true,
  checkRegistrationEligibility: jest.fn().mockResolvedValue({ eligible: true, mode: 'open' }),
  // The login gate (row 229, §34 of the write register) ships OFF, so these
  // tests see the behaviour every real login has today. Its own file proves
  // the ON case; here it must simply not change anything.
  isLoginInviteOnlyEnabled: () => Promise.resolve(false),
}));

import { query } from '../../db/postgres/client';
import { sendSmsOtp } from '../twilio.service';
import { resendOTP } from '../auth.service';

const mockQuery = query as jest.MockedFunction<typeof query>;
const mockSms = sendSmsOtp as jest.MockedFunction<typeof sendSmsOtp>;

const REVIEW = '+995555000001';
const ORDINARY = '+995599123456';

const ORIGINAL = { phone: process.env.REVIEW_PHONE, otp: process.env.REVIEW_OTP };

/** Long enough ago that the cooldown is not what any of these tests measures. */
function codeAskedForSecondsAgo(seconds: number): void {
  mockQuery.mockImplementation((sql: string) => {
    if (sql.includes('FROM otp_sends')) return Promise.resolve({ rows: [{ count: '0' }] } as never);
    if (sql.includes('FROM "Otp"'))
      return Promise.resolve({
        rows: [{ createdAt: new Date(Date.now() - seconds * 1000) }],
        rowCount: 1,
      } as never);
    return Promise.resolve({ rows: [], rowCount: 0 } as never);
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  process.env.REVIEW_PHONE = REVIEW;
  process.env.REVIEW_OTP = '123456';
});

afterEach(() => {
  process.env.REVIEW_PHONE = ORIGINAL.phone;
  process.env.REVIEW_OTP = ORIGINAL.otp;
  if (ORIGINAL.phone === undefined) delete process.env.REVIEW_PHONE;
  if (ORIGINAL.otp === undefined) delete process.env.REVIEW_OTP;
});

describe('the review number can press „send again" and not be trapped', () => {
  it('returns quietly instead of failing, with no stored code to find', async () => {
    // The base answers as it really would for a review number: nothing stored.
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 } as never);

    await expect(resendOTP(REVIEW, 'AUTH')).resolves.toBeUndefined();
  });

  it('asks the base nothing at all', async () => {
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 } as never);

    await resendOTP(REVIEW, 'AUTH');

    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('sends no message, because there is no code to send', async () => {
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 } as never);

    await resendOTP(REVIEW, 'AUTH');

    expect(mockSms).not.toHaveBeenCalled();
  });

  /**
   * THE CONTROL, and it is the whole point. Without it „returns quietly" would
   * pass for a function that returns quietly for everybody. An ordinary number
   * with nothing stored MUST hit the dead end — that error is correct there.
   */
  it('still refuses an ordinary number that never asked for a code', async () => {
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 } as never);

    await expect(resendOTP(ORDINARY, 'AUTH')).rejects.toThrow('OTP არ მოიძებნა');
  });

  /** And the list being off must not turn the review number into an exception. */
  it('treats the number as ordinary when the review list is unset', async () => {
    delete process.env.REVIEW_PHONE;
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 } as never);

    await expect(resendOTP(REVIEW, 'AUTH')).rejects.toThrow('OTP არ მოიძებნა');
  });
});

describe('resendOTP holds its own copies of the cooldown and the cap', () => {
  it('refuses inside the thirty-second cooldown', async () => {
    codeAskedForSecondsAgo(5);

    await expect(resendOTP(ORDINARY, 'AUTH')).rejects.toThrow('წამი დაიცადოთ');
    expect(mockSms).not.toHaveBeenCalled();
  });

  it('sends once the cooldown has passed', async () => {
    codeAskedForSecondsAgo(31);

    await resendOTP(ORDINARY, 'AUTH');

    expect(mockSms).toHaveBeenCalledWith(ORDINARY);
  });

  it('refuses when the hourly per-phone send cap is already spent', async () => {
    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes('FROM otp_sends'))
        return Promise.resolve({ rows: [{ count: '5' }] } as never);
      if (sql.includes('FROM "Otp"'))
        return Promise.resolve({
          rows: [{ createdAt: new Date(Date.now() - 60_000) }],
          rowCount: 1,
        } as never);
      return Promise.resolve({ rows: [], rowCount: 0 } as never);
    });

    await expect(resendOTP(ORDINARY, 'AUTH')).rejects.toThrow('ძალიან ბევრი კოდი');
    expect(mockSms).not.toHaveBeenCalled();
  });
});
