process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

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
  isLoginInviteOnlyEnabled: () => Promise.resolve(false),
}));

import { query } from '../../db/postgres/client';
import { sendWhatsAppMessage } from '../whatsapp.service';
import { requestOTP } from '../auth.service';

const mockQuery = query as jest.MockedFunction<typeof query>;
const mockWhatsApp = sendWhatsAppMessage as jest.MockedFunction<typeof sendWhatsAppMessage>;

const PHONE = '+995599123456';
const FRESH_CODE_SQL = 'make_interval(secs => $3)';

function codeSentMomentsAgo(fresh: boolean): void {
  mockQuery.mockImplementation(((sql: string) => {
    if (sql.includes(FRESH_CODE_SQL)) {
      return Promise.resolve({ rows: fresh ? [{ id: 1 }] : [], rowCount: fresh ? 1 : 0 });
    }
    if (sql.includes('FROM otp_sends')) return Promise.resolve({ rows: [{ count: '0' }] });
    return Promise.resolve({ rows: [], rowCount: 0 });
  }) as never);
}

function ran(fragment: string): boolean {
  return mockQuery.mock.calls.some(([sql]) => String(sql).includes(fragment));
}

describe('#6340: a code request repeated within moments sends no second code', () => {
  beforeEach(() => jest.clearAllMocks());

  it('keeps the code already sent, sends nothing and counts nothing', async () => {
    const log = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    codeSentMomentsAgo(true);
    await requestOTP(PHONE, 'AUTH');
    expect(mockWhatsApp).not.toHaveBeenCalled();
    expect(ran('DELETE FROM "Otp"')).toBe(false);
    expect(ran('INSERT INTO "Otp"')).toBe(false);
    expect(ran('INSERT INTO otp_sends')).toBe(false);
    log.mockRestore();
  });

  it('sends a code as before when none was sent moments ago', async () => {
    codeSentMomentsAgo(false);
    await requestOTP(PHONE, 'AUTH');
    expect(mockWhatsApp).toHaveBeenCalledTimes(1);
    expect(ran('INSERT INTO "Otp"')).toBe(true);
  });

  it('looks for that phone and that kind of code only, in the last thirty seconds', async () => {
    codeSentMomentsAgo(false);
    await requestOTP(PHONE, 'REGISTER');
    const call = mockQuery.mock.calls.find(([sql]) => String(sql).includes(FRESH_CODE_SQL));
    expect(call?.[1]).toEqual(['995599123456', 'REGISTER', 30]);
  });
});
