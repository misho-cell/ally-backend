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
jest.mock('../inviteGate.service', () => ({
  __esModule: true,
  checkRegistrationEligibility: jest.fn(),
  isLoginInviteOnlyEnabled: () => Promise.resolve(false),
}));
jest.mock('../reviewAccess', () => ({ __esModule: true, isReviewPhone: jest.fn() }));

import { query } from '../../db/postgres/client';
import { sendWhatsAppMessage } from '../whatsapp.service';
import { sendSmsOtp } from '../twilio.service';
import { checkRegistrationEligibility } from '../inviteGate.service';
import { isReviewPhone } from '../reviewAccess';
import {
  CodeNeedsInvitationError,
  eligibilityRefusalLine,
  OTP_INVITE_GATE_FLAG,
  OtpAdmission,
  otpGateVerdict,
  requestOTP,
  resendOTP,
} from '../auth.service';
import { EligibilityCheck } from '../../types';

/**
 * #5875 (D831): with `otp_invite_gate` on, a number nobody invited is sent no
 * WhatsApp code — refused before anything is generated, stored, counted or
 * sent. Members, review numbers and invited numbers still get theirs.
 */
const mockQuery = query as jest.MockedFunction<typeof query>;
const mockWhatsApp = sendWhatsAppMessage as jest.MockedFunction<typeof sendWhatsAppMessage>;
const mockSms = sendSmsOtp as jest.MockedFunction<typeof sendSmsOtp>;
const mockEligibility = checkRegistrationEligibility as jest.MockedFunction<
  typeof checkRegistrationEligibility
>;
const mockReview = isReviewPhone as jest.MockedFunction<typeof isReviewPhone>;

const PHONE = '+995555010203';
const LAST_FOUR = '0203';
const INVITE = { referralCode: 'TORNIKE20', referralPhone: '+995599000111' } as const;
const REFUSED: EligibilityCheck = { eligible: false, reason: 'referral_required' };
const ELIGIBLE: EligibilityCheck = { eligible: true, mode: 'referral', inviterUserId: 42 };
/** A code issued long ago, so the resend cooldown never depends on the clock. */
const OLD_CODE_AT = new Date(0);

interface World {
  readonly gateOn: boolean;
  readonly account: { id: number; belongs_to_netai: boolean } | null;
}

function arrange(world: World): void {
  mockQuery.mockImplementation((sql: string, params?: unknown[]) => {
    const answer = (rows: unknown[]): never => ({ rows, rowCount: rows.length }) as never;
    if (sql.includes('FROM app_flags') && params?.[0] === OTP_INVITE_GATE_FLAG) {
      return Promise.resolve(answer([{ enabled: world.gateOn }]));
    }
    if (sql.includes('FROM "UserPhone"')) {
      return Promise.resolve(answer(world.account ? [world.account] : []));
    }
    if (sql.includes('FROM otp_sends')) return Promise.resolve(answer([{ count: '0' }]));
    if (sql.includes('SELECT "createdAt" FROM "Otp"')) {
      return Promise.resolve(answer([{ createdAt: OLD_CODE_AT }]));
    }
    return Promise.resolve(answer([]));
  });
}

function sqlRun(): string[] {
  return mockQuery.mock.calls.map((call) => call[0]);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockReview.mockReturnValue(false);
  mockEligibility.mockResolvedValue(REFUSED);
});

describe('otpGateVerdict — who may be sent a code', () => {
  it('a review number may, without a lookup or an eligibility check', async () => {
    arrange({ gateOn: true, account: null });
    mockReview.mockReturnValue(true);

    await expect(otpGateVerdict(PHONE, {})).resolves.toEqual({
      allowed: true,
      admission: OtpAdmission.ReviewPhone,
    });
    expect(mockQuery).not.toHaveBeenCalled();
    expect(mockEligibility).not.toHaveBeenCalled();
  });

  it('a Netai member may, with no invitation asked', async () => {
    arrange({ gateOn: true, account: { id: 7, belongs_to_netai: true } });

    await expect(otpGateVerdict(PHONE, {})).resolves.toEqual({
      allowed: true,
      admission: OtpAdmission.Member,
    });
    expect(mockEligibility).not.toHaveBeenCalled();
  });

  it('asks the member question through the shared lookup', async () => {
    arrange({ gateOn: true, account: { id: 7, belongs_to_netai: true } });

    await otpGateVerdict(PHONE, {});

    const lookup = sqlRun().find((sql) => sql.includes('FROM "UserPhone"'));
    expect(lookup).toContain('belongs_to_netai');
    expect(lookup).toContain('LIMIT 1');
  });

  it('an old account that never used Netai still needs the invitation', async () => {
    arrange({ gateOn: true, account: { id: 8, belongs_to_netai: false } });
    mockEligibility.mockResolvedValue(ELIGIBLE);

    await expect(otpGateVerdict(PHONE, INVITE)).resolves.toEqual({
      allowed: true,
      admission: OtpAdmission.Invitation,
    });
    expect(mockEligibility).toHaveBeenCalledWith(PHONE, INVITE.referralPhone, INVITE.referralCode);
  });

  it('a stranger with an invitation code may', async () => {
    arrange({ gateOn: true, account: null });
    mockEligibility.mockResolvedValue(ELIGIBLE);

    await expect(otpGateVerdict(PHONE, INVITE)).resolves.toEqual({
      allowed: true,
      admission: OtpAdmission.Invitation,
    });
  });

  it('a stranger with no invitation is refused, for the gate’s own reason', async () => {
    arrange({ gateOn: true, account: null });
    mockEligibility.mockResolvedValue({ eligible: false, reason: 'invite_link_full' });

    await expect(otpGateVerdict(PHONE, {})).resolves.toEqual({
      allowed: false,
      reason: 'invite_link_full',
    });
  });

  it('a refusal that names no reason is refused for want of an invitation', async () => {
    arrange({ gateOn: true, account: null });
    mockEligibility.mockResolvedValue({ eligible: false });

    await expect(otpGateVerdict(PHONE, {})).resolves.toEqual({
      allowed: false,
      reason: 'referral_required',
    });
  });
});

describe('requestOTP with otp_invite_gate on', () => {
  it('refuses a stranger before anything is generated, stored, counted or sent', async () => {
    arrange({ gateOn: true, account: null });

    const sending = requestOTP(PHONE, 'AUTH');

    await expect(sending).rejects.toBeInstanceOf(CodeNeedsInvitationError);
    await expect(sending).rejects.toMatchObject({
      reason: 'referral_required',
      message: eligibilityRefusalLine(false, 'referral_required'),
    });
    expect(mockWhatsApp).not.toHaveBeenCalled();
    expect(sqlRun().some((sql) => sql.includes('"Otp"'))).toBe(false);
    expect(sqlRun().some((sql) => sql.includes('otp_sends'))).toBe(false);
  });

  it('logs one line, and no digit of the number', async () => {
    arrange({ gateOn: true, account: null });
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      await expect(requestOTP(PHONE, 'AUTH')).rejects.toThrow();
      expect(warn).toHaveBeenCalledTimes(1);
      const line = String(warn.mock.calls[0][0]);
      expect(line).toContain('[otp-gate]');
      expect(line).not.toContain(LAST_FOUR);
    } finally {
      warn.mockRestore();
    }
  });

  it('sends the code to an invited number', async () => {
    arrange({ gateOn: true, account: null });
    mockEligibility.mockResolvedValue(ELIGIBLE);

    await requestOTP(PHONE, 'AUTH', INVITE);

    expect(mockWhatsApp).toHaveBeenCalledWith(PHONE, expect.stringMatching(/^\d{6}$/));
  });

  it('sends the code to a member', async () => {
    arrange({ gateOn: true, account: { id: 7, belongs_to_netai: true } });

    await requestOTP(PHONE, 'AUTH');

    expect(mockWhatsApp).toHaveBeenCalledTimes(1);
  });
});

describe('requestOTP with otp_invite_gate off — exactly as before', () => {
  it('sends to a stranger and never asks the gate', async () => {
    arrange({ gateOn: false, account: null });

    await requestOTP(PHONE, 'AUTH', INVITE);

    expect(mockWhatsApp).toHaveBeenCalledWith(PHONE, expect.stringMatching(/^\d{6}$/));
    expect(mockEligibility).not.toHaveBeenCalled();
    expect(sqlRun().some((sql) => sql.includes('FROM "UserPhone"'))).toBe(false);
  });
});

describe('resendOTP', () => {
  it('with the gate on, refuses a stranger before the code lookup and sends nothing', async () => {
    arrange({ gateOn: true, account: null });

    await expect(resendOTP(PHONE, 'AUTH')).rejects.toBeInstanceOf(CodeNeedsInvitationError);
    expect(mockSms).not.toHaveBeenCalled();
    expect(mockWhatsApp).not.toHaveBeenCalled();
    expect(sqlRun().some((sql) => sql.includes('"Otp"') || sql.includes('otp_sends'))).toBe(false);
  });

  it('with the gate on, resends to an invited number', async () => {
    arrange({ gateOn: true, account: null });
    mockEligibility.mockResolvedValue(ELIGIBLE);

    await resendOTP(PHONE, 'AUTH', INVITE);

    expect(mockSms).toHaveBeenCalledWith(PHONE);
  });

  it('with the gate off, resends as before and never asks the gate', async () => {
    arrange({ gateOn: false, account: null });

    await resendOTP(PHONE, 'AUTH');

    expect(mockSms).toHaveBeenCalledWith(PHONE);
    expect(mockEligibility).not.toHaveBeenCalled();
  });
});
