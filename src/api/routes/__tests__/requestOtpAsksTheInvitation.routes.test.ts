jest.mock('../../middleware/rateLimit.middleware', () => ({
  __esModule: true,
  rateLimit:
    () =>
    (_req: unknown, _res: unknown, next: () => void): void =>
      next(),
}));
jest.mock('../../../db/postgres/client', () => ({ query: jest.fn(), __esModule: true }));
jest.mock('../../../services/whatsapp.service', () => ({
  __esModule: true,
  sendWhatsAppMessage: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../../services/twilio.service', () => ({
  __esModule: true,
  sendSmsOtp: jest.fn().mockResolvedValue(undefined),
  checkTwilioCode: jest.fn().mockResolvedValue(false),
}));
jest.mock('../../../services/inviteGate.service', () => ({
  __esModule: true,
  checkRegistrationEligibility: jest.fn(),
  isLoginInviteOnlyEnabled: () => Promise.resolve(false),
}));

import express from 'express';
import type { AddressInfo } from 'net';
import type { Server } from 'http';
import authRouter from '../auth.routes';
import { query } from '../../../db/postgres/client';
import { sendWhatsAppMessage } from '../../../services/whatsapp.service';
import { sendSmsOtp } from '../../../services/twilio.service';
import { checkRegistrationEligibility } from '../../../services/inviteGate.service';
import { eligibilityRefusalLine, OTP_INVITE_GATE_FLAG } from '../../../services/auth.service';

/**
 * #5875 (D831), through the real router: POST /auth/request-otp and
 * /auth/resend-otp refuse a number with no invitation with 403 when
 * `otp_invite_gate` is on, and send nothing; with it off they answer as before.
 */
const mockQuery = query as jest.MockedFunction<typeof query>;
const mockWhatsApp = sendWhatsAppMessage as jest.MockedFunction<typeof sendWhatsAppMessage>;
const mockSms = sendSmsOtp as jest.MockedFunction<typeof sendSmsOtp>;
const mockEligibility = checkRegistrationEligibility as jest.MockedFunction<
  typeof checkRegistrationEligibility
>;

const PHONE = '+995555010203';
const REFUSAL = eligibilityRefusalLine(false, 'referral_required');
/** A code issued long ago, so the resend cooldown never depends on the clock. */
const OLD_CODE_AT = new Date(0);

let server: Server;
let base: string;
let gateOn = false;

beforeAll((done) => {
  const app = express();
  app.use(express.json());
  app.use('/auth', authRouter);
  server = app.listen(0, () => {
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/auth`;
    done();
  });
});
afterAll((done) => {
  server.close(() => done());
});

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  gateOn = false;
  mockEligibility.mockResolvedValue({ eligible: false, reason: 'referral_required' });
  mockQuery.mockImplementation((sql: string, params?: unknown[]) => {
    const answer = (rows: unknown[]): never => ({ rows, rowCount: rows.length }) as never;
    if (sql.includes('FROM app_flags') && params?.[0] === OTP_INVITE_GATE_FLAG) {
      return Promise.resolve(answer([{ enabled: gateOn }]));
    }
    if (sql.includes('FROM otp_sends')) return Promise.resolve(answer([{ count: '0' }]));
    if (sql.includes('SELECT "createdAt" FROM "Otp"')) {
      return Promise.resolve(answer([{ createdAt: OLD_CODE_AT }]));
    }
    return Promise.resolve(answer([]));
  });
});
afterEach(() => {
  jest.restoreAllMocks();
});

function post(path: string, body: Readonly<Record<string, unknown>>): Promise<Response> {
  return fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function wroteAnything(): boolean {
  return mockQuery.mock.calls.some(([sql]) => sql.includes('"Otp"') || sql.includes('otp_sends'));
}

describe('POST /auth/request-otp with otp_invite_gate on', () => {
  it('refuses a number with no invitation: 403, the eligibility line, nothing sent', async () => {
    gateOn = true;

    const res = await post('/request-otp', { phone: PHONE, actionType: 'AUTH' });

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({
      success: false,
      error: REFUSAL,
      reason: 'referral_required',
    });
    expect(mockWhatsApp).not.toHaveBeenCalled();
    expect(wroteAnything()).toBe(false);
  });

  it('sends the code when the body carries an invitation that admits', async () => {
    gateOn = true;
    mockEligibility.mockResolvedValue({ eligible: true, mode: 'referral', inviterUserId: 42 });

    const res = await post('/request-otp', {
      phone: PHONE,
      actionType: 'AUTH',
      referralCode: '  TORNIKE20 ',
      referralPhone: ' +995599000111 ',
    });

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ success: true, data: { sent: true } });
    expect(mockEligibility).toHaveBeenCalledWith(PHONE, '+995599000111', 'TORNIKE20');
    expect(mockWhatsApp).toHaveBeenCalledWith(PHONE, expect.stringMatching(/^\d{6}$/));
  });

  it('refuses a referral code that is not a string with 400, before any gate', async () => {
    gateOn = true;

    const res = await post('/request-otp', { phone: PHONE, actionType: 'AUTH', referralCode: 7 });

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ success: false });
    expect(mockEligibility).not.toHaveBeenCalled();
    expect(mockWhatsApp).not.toHaveBeenCalled();
  });
});

describe('POST /auth/request-otp with otp_invite_gate off — unchanged', () => {
  it('sends the code to a number with no invitation, as today', async () => {
    const res = await post('/request-otp', { phone: PHONE, actionType: 'AUTH' });

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ success: true, data: { sent: true } });
    expect(mockWhatsApp).toHaveBeenCalledWith(PHONE, expect.stringMatching(/^\d{6}$/));
    expect(mockEligibility).not.toHaveBeenCalled();
  });

  it('ignores the invitation fields', async () => {
    const res = await post('/request-otp', {
      phone: PHONE,
      actionType: 'AUTH',
      referralCode: 'TORNIKE20',
    });

    expect(res.status).toBe(200);
    expect(mockEligibility).not.toHaveBeenCalled();
  });

  it('still answers 400 for a missing phone, in the words it always used', async () => {
    const res = await post('/request-otp', { actionType: 'AUTH' });

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      success: false,
      error: 'Invalid value, phone is required',
    });
  });
});

describe('POST /auth/resend-otp', () => {
  it('with the gate on, refuses a number with no invitation: 403, nothing sent', async () => {
    gateOn = true;

    const res = await post('/resend-otp', { phone: PHONE, actionType: 'AUTH' });

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({
      success: false,
      error: REFUSAL,
      reason: 'referral_required',
    });
    expect(mockSms).not.toHaveBeenCalled();
    expect(mockWhatsApp).not.toHaveBeenCalled();
    expect(wroteAnything()).toBe(false);
  });

  it('with the gate off, resends as today', async () => {
    const res = await post('/resend-otp', { phone: PHONE, actionType: 'AUTH' });

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ success: true, data: { sent: true } });
    expect(mockSms).toHaveBeenCalledWith(PHONE);
    expect(mockEligibility).not.toHaveBeenCalled();
  });
});
