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

describe('review login bypass (REVIEW_PHONE + REVIEW_OTP)', () => {
  const REVIEW_PHONE = '+995555000001';
  const REVIEW_CODE = '13570246';

  beforeEach(() => {
    process.env.REVIEW_PHONE = REVIEW_PHONE;
    process.env.REVIEW_OTP = REVIEW_CODE;
    mockQuery.mockResolvedValue(rows([]) as never);
  });

  afterEach(() => {
    delete process.env.REVIEW_PHONE;
    delete process.env.REVIEW_OTP;
  });

  it('requestOTP sends nothing and stores nothing for the review number', async () => {
    await requestOTP(REVIEW_PHONE, 'AUTH');

    expect(mockWhatsApp).not.toHaveBeenCalled();
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('verifyOTP accepts the fixed code for the review number (format-independent)', async () => {
    await verifyOTP('555 00 00 01', REVIEW_CODE, 'AUTH');

    const marker = mockQuery.mock.calls.find((c) =>
      (c[0] as string).includes('INSERT INTO phone_verifications'),
    );
    expect(marker).toBeDefined();
  });

  it('verifyOTP still rejects a WRONG code on the review number', async () => {
    await expect(verifyOTP(REVIEW_PHONE, '000000', 'AUTH')).rejects.toThrow();
  });

  it('the fixed code does NOT work for any other number', async () => {
    await expect(verifyOTP(PHONE, REVIEW_CODE, 'AUTH')).rejects.toThrow();
  });

  it('accepts EVERY number on a comma-separated list (with spaces and mixed formats)', async () => {
    process.env.REVIEW_PHONE = '+995555000001, 555 00 00 02,+995555000003';

    await requestOTP('+995555000002', 'AUTH');
    expect(mockWhatsApp).not.toHaveBeenCalled();

    await verifyOTP('+995555000003', REVIEW_CODE, 'AUTH');
    const marker = mockQuery.mock.calls.find((c) =>
      (c[0] as string).includes('INSERT INTO phone_verifications'),
    );
    expect(marker).toBeDefined();
  });

  it('a number NOT on the list stays ordinary even when the list is set', async () => {
    process.env.REVIEW_PHONE = '+995555000001,+995555000002';

    await expect(verifyOTP(PHONE, REVIEW_CODE, 'AUTH')).rejects.toThrow();
  });

  it('is fully inert when the env vars are unset', async () => {
    delete process.env.REVIEW_PHONE;
    delete process.env.REVIEW_OTP;
    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes('FROM otp_sends')) return Promise.resolve(rows([{ count: '0' }]) as never);
      return Promise.resolve(rows([]) as never);
    });

    await requestOTP(REVIEW_PHONE, 'AUTH');

    // Without the vars the review number is an ordinary number: code stored, message sent.
    expect(mockWhatsApp).toHaveBeenCalled();
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

    await expect(registerUser(PHONE, 'Lika')).rejects.toThrow(/დადასტურებული არ არის/);
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

  it('accepts a verification recorded as AUTH — the entry screen sends the code before knowing the number is new (13 Aug bounce)', async () => {
    setup({ verified: true });

    await registerUser(PHONE, 'Lika');

    const consume = mockQuery.mock.calls.find((c) =>
      (c[0] as string).includes('DELETE FROM phone_verifications'),
    );
    expect((consume?.[1] as unknown[])[1]).toEqual(['REGISTER', 'AUTH']);
  });

  it('registers a LOCAL-format number (the "5XX…" the screen itself suggests)', async () => {
    setup({ verified: true });

    const result = await registerUser('599 12 34 56', 'Lika');

    // Used to reach parsePhone raw and throw on the missing "+", burning the
    // verification so the retry hit "ნომერი დადასტურებული არ არის".
    expect(result.token).toBeTruthy();
    const phoneInsert = mockQuery.mock.calls.find((c) =>
      (c[0] as string).includes('INSERT INTO "UserPhone"'),
    );
    expect((phoneInsert?.[1] as unknown[])[0]).toBe('+995599123456');
  });

  it('hands the verification BACK when creation fails after the consume, so the retry works', async () => {
    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes('SELECT id FROM "UserPhone"')) return Promise.resolve(rows([]) as never);
      if (sql.includes('DELETE FROM phone_verifications'))
        return Promise.resolve(rows([], 1) as never);
      if (sql.includes('INSERT INTO "User"')) return Promise.reject(new Error('db down') as never);
      return Promise.resolve(rows([]) as never);
    });

    await expect(registerUser(PHONE, 'Lika')).rejects.toThrow('db down');

    const restore = mockQuery.mock.calls.find((c) =>
      (c[0] as string).includes('INSERT INTO phone_verifications'),
    );
    expect(restore).toBeDefined();
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

    await expect(completeLogin(PHONE)).rejects.toThrow(/დადასტურებული არ არის/);
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
