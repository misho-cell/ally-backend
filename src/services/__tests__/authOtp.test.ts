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
}));

import { query } from '../../db/postgres/client';
import { sendWhatsAppMessage } from '../whatsapp.service';
import { requestOTP, verifyOTP, registerUser, completeLogin } from '../auth.service';

const mockQuery = query as jest.MockedFunction<typeof query>;
const mockWhatsApp = sendWhatsAppMessage as jest.MockedFunction<typeof sendWhatsAppMessage>;

const PHONE = '+995599123456';

function rows(data: unknown[], rowCount = data.length): { rows: unknown[]; rowCount: number } {
  return { rows: data, rowCount };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('requestOTP hardening', () => {
  function setup(sendsLastHour: number): void {
    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes('FROM otp_sends'))
        return Promise.resolve(rows([{ count: String(sendsLastHour) }]) as never);
      return Promise.resolve(rows([]) as never);
    });
  }

  it('rejects when the per-phone hourly send cap is hit', async () => {
    setup(5);

    await expect(requestOTP(PHONE, 'REGISTER')).rejects.toThrow(/ბევრი კოდი/);
    expect(mockWhatsApp).not.toHaveBeenCalled();
  });

  it('invalidates earlier codes, stores a HASH, records the send', async () => {
    setup(0);

    await requestOTP(PHONE, 'REGISTER');

    const calls = mockQuery.mock.calls.map((c) => c[0] as string);
    expect(calls.some((sql) => sql.includes('DELETE FROM "Otp"'))).toBe(true);
    const insert = mockQuery.mock.calls.find((c) => (c[0] as string).includes('INSERT INTO "Otp"'));
    const storedOtp = (insert?.[1] as unknown[])[2] as string;
    // sha256 hex — never the 6-digit plaintext.
    expect(storedOtp).toMatch(/^[0-9a-f]{64}$/);
    expect(calls.some((sql) => sql.includes('INSERT INTO otp_sends'))).toBe(true);
    // The HUMAN gets the plaintext code, 6 digits.
    expect(mockWhatsApp).toHaveBeenCalledWith(PHONE, expect.stringMatching(/^\d{6}$/));
  });
});

describe('verifyOTP', () => {
  it('records a phone verification on success', async () => {
    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes('SELECT id FROM "Otp"')) return Promise.resolve(rows([{ id: 3 }]) as never);
      return Promise.resolve(rows([]) as never);
    });

    await verifyOTP(PHONE, '123456', 'REGISTER');

    const marker = mockQuery.mock.calls.find((c) =>
      (c[0] as string).includes('INSERT INTO phone_verifications'),
    );
    expect(marker).toBeDefined();
    expect((marker?.[1] as unknown[])[0]).toBe('995599123456'); // digits key
    expect((marker?.[1] as unknown[])[1]).toBe('REGISTER');
  });

  it('compares the HASH of the submitted code, not the plaintext', async () => {
    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes('SELECT id FROM "Otp"')) return Promise.resolve(rows([{ id: 3 }]) as never);
      return Promise.resolve(rows([]) as never);
    });

    await verifyOTP(PHONE, '123456', 'REGISTER');

    const select = mockQuery.mock.calls.find((c) =>
      (c[0] as string).includes('SELECT id FROM "Otp"'),
    );
    expect((select?.[1] as unknown[])[1]).toMatch(/^[0-9a-f]{64}$/);
  });

  it('throws on a wrong code (and no verification is recorded)', async () => {
    mockQuery.mockResolvedValue(rows([]) as never);

    await expect(verifyOTP(PHONE, '000000', 'REGISTER')).rejects.toThrow();
    expect(
      mockQuery.mock.calls.some((c) =>
        (c[0] as string).includes('INSERT INTO phone_verifications'),
      ),
    ).toBe(false);
  });
});

describe('registerUser requires a consumed verification', () => {
  function setup(opts: { verified: boolean }): void {
    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes('SELECT id FROM "UserPhone"')) return Promise.resolve(rows([]) as never); // no duplicate
      if (sql.includes('DELETE FROM phone_verifications'))
        return Promise.resolve(rows([], opts.verified ? 1 : 0) as never);
      if (sql.includes('INSERT INTO "User"')) return Promise.resolve(rows([{ id: 7 }]) as never);
      return Promise.resolve(rows([]) as never);
    });
  }

  it('refuses to mint an account for an unverified phone', async () => {
    setup({ verified: false });

    await expect(registerUser(PHONE, 'Lika')).rejects.toThrow(/დაუდასტურებელია/);
    expect(mockQuery.mock.calls.some((c) => (c[0] as string).includes('INSERT INTO "User"'))).toBe(
      false,
    );
  });

  it('mints the account when a fresh verification is consumed, storing a canonical phone', async () => {
    setup({ verified: true });

    const result = await registerUser('+995 599 12-34-56', 'Lika');

    expect(result.token).toBeTruthy();
    const phoneInsert = mockQuery.mock.calls.find((c) =>
      (c[0] as string).includes('INSERT INTO "UserPhone"'),
    );
    // No spaces/dashes ever again — unnormalized rows broke is_member/self-exclusion.
    expect((phoneInsert?.[1] as unknown[])[0]).toBe('+995599123456');
  });
});

describe('completeLogin requires a consumed verification', () => {
  it('refuses a session for an unverified phone', async () => {
    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes('FROM "UserPhone"')) return Promise.resolve(rows([{ id: 42 }]) as never);
      if (sql.includes('DELETE FROM phone_verifications'))
        return Promise.resolve(rows([], 0) as never);
      return Promise.resolve(rows([]) as never);
    });

    await expect(completeLogin(PHONE)).rejects.toThrow(/დაუდასტურებელია/);
  });

  it('mints a session against a fresh AUTH verification', async () => {
    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes('FROM "UserPhone"')) return Promise.resolve(rows([{ id: 42 }]) as never);
      if (sql.includes('DELETE FROM phone_verifications'))
        return Promise.resolve(rows([], 1) as never);
      return Promise.resolve(rows([]) as never);
    });

    const result = await completeLogin(PHONE);

    expect(result.isNewUser).toBe(false);
    expect(result.token).toBeTruthy();
  });

  it('still reports isNewUser for an unknown phone without demanding verification', async () => {
    mockQuery.mockResolvedValue(rows([]) as never);

    const result = await completeLogin('+995599000111');

    expect(result).toEqual({ token: '', isNewUser: true });
  });
});
