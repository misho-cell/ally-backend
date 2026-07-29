import jwt from 'jsonwebtoken';

jest.mock('../../db/postgres/client', () => ({
  query: jest.fn(),
  withTransaction: jest.fn(),
  default: { query: jest.fn() },
  __esModule: true,
}));

jest.mock('../whatsapp.service', () => ({
  sendWhatsAppMessage: jest.fn(),
}));

jest.mock('../contacts.service', () => ({
  createUserPhoneNode: jest.fn(),
}));

jest.mock('../inviteGate.service', () => ({
  checkRegistrationEligibility: jest.fn(),
}));

jest.mock('bcrypt', () => ({
  hash: jest.fn(),
  compare: jest.fn(),
}));

import jwt from 'jsonwebtoken';
import { query } from '../../db/postgres/client';
import { sendWhatsAppMessage } from '../whatsapp.service';
import { createUserPhoneNode } from '../contacts.service';
import { checkRegistrationEligibility } from '../inviteGate.service';
import bcrypt from 'bcrypt';
import {
  requestOTP,
  verifyOTP,
  registerUser,
  completeLogin,
  adminLogin,
  verifyToken,
} from '../auth.service';

const JWT_SECRET = 'test-jwt-secret-for-unit-tests';

const mockQuery = query as jest.MockedFunction<typeof query>;
const mockSendWhatsApp = sendWhatsAppMessage as jest.MockedFunction<typeof sendWhatsAppMessage>;
const mockCreatePhoneNode = createUserPhoneNode as jest.MockedFunction<typeof createUserPhoneNode>;
const mockBcryptHash = bcrypt.hash as jest.MockedFunction<typeof bcrypt.hash>;
const mockBcryptCompare = bcrypt.compare as jest.MockedFunction<typeof bcrypt.compare>;
const mockGate = checkRegistrationEligibility as jest.MockedFunction<
  typeof checkRegistrationEligibility
>;

beforeEach(() => {
  jest.clearAllMocks();
  mockCreatePhoneNode.mockResolvedValue(undefined);
  mockBcryptHash.mockResolvedValue('$2b$12$hashed' as never);
  mockGate.mockResolvedValue({ eligible: true, mode: 'open' });
});

describe('requestOTP', () => {
  it('inserts OTP record and sends WhatsApp message', async () => {
    // Route by fragment: the hardened flow also checks the per-phone cap,
    // deletes stale codes and records the send.
    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes('FROM otp_sends'))
        return Promise.resolve({ rows: [{ count: '0' }], rowCount: 1 } as never);
      return Promise.resolve({ rows: [], rowCount: 1 } as never);
    });
    mockSendWhatsApp.mockResolvedValue(undefined);

    await requestOTP('+995555123456', 'AUTH');

    expect(mockQuery.mock.calls.some((c) => (c[0] as string).includes('INSERT INTO "Otp"'))).toBe(
      true,
    );
    expect(mockSendWhatsApp).toHaveBeenCalledWith(
      '+995555123456',
      expect.stringMatching(/^\d{6}$/),
    );
  });

  it('propagates DB error', async () => {
    mockQuery.mockRejectedValue(new Error('DB down'));

    await expect(requestOTP('+995555123456', 'AUTH')).rejects.toThrow('DB down');
  });
});

describe('verifyOTP', () => {
  it('deletes OTP on successful verification and records the verification', async () => {
    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes('SELECT id FROM "Otp"'))
        return Promise.resolve({ rows: [{ id: 42 }], rowCount: 1 } as never);
      return Promise.resolve({ rows: [], rowCount: 1 } as never);
    });

    await verifyOTP('+995555123456', '123456', 'AUTH');

    const del = mockQuery.mock.calls.find((c) =>
      (c[0] as string).includes('DELETE FROM "Otp" WHERE id'),
    );
    expect(del?.[1]).toEqual([42]);
    expect(
      mockQuery.mock.calls.some((c) =>
        (c[0] as string).includes('INSERT INTO phone_verifications'),
      ),
    ).toBe(true);
  });

  it('throws when OTP not found or expired', async () => {
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 } as never);

    await expect(verifyOTP('+995555123456', '000000', 'AUTH')).rejects.toThrow(
      'კოდი არასწორია ან ვადა გასულია',
    );
  });
});

// Route register's queries by fragment: duplicate check, verification consume
// (the OTP round-trip is now mandatory), user + phone inserts.
function routeRegisterQueries(opts: { userId?: number; verified?: boolean } = {}): void {
  mockQuery.mockImplementation((sql: string) => {
    if (sql.includes('SELECT id FROM "UserPhone"'))
      return Promise.resolve({ rows: [], rowCount: 0 } as never);
    if (sql.includes('DELETE FROM phone_verifications'))
      return Promise.resolve({ rows: [], rowCount: opts.verified === false ? 0 : 1 } as never);
    if (sql.includes('INSERT INTO "User"'))
      return Promise.resolve({ rows: [{ id: opts.userId ?? 7 }], rowCount: 1 } as never);
    return Promise.resolve({ rows: [], rowCount: 1 } as never);
  });
}

describe('registerUser', () => {
  it('creates user and phone record, returns token', async () => {
    routeRegisterQueries();

    const result = await registerUser('+995555123456', 'გიორგი');

    expect(result.token).toBeTruthy();
    const decoded = jwt.verify(result.token, JWT_SECRET) as { userId: string; role: string };
    expect(decoded.userId).toBe('7');
    expect(decoded.role).toBe('user');
    expect(mockCreatePhoneNode).toHaveBeenCalledWith('+995555123456');
  });

  it('refuses an unverified phone', async () => {
    routeRegisterQueries({ verified: false });

    await expect(registerUser('+995555123456', 'გიორგი')).rejects.toThrow(/დაუდასტურებელია/);
  });

  it('throws when phone already registered', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 1 }], rowCount: 1 } as never);

    await expect(registerUser('+995555123456', 'გიორგი')).rejects.toThrow(
      'ნომერი უკვე რეგისტრირებულია',
    );
  });

  it('rejects when the invite gate closes and creates no user', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 } as never);
    mockGate.mockResolvedValue({ eligible: false, reason: 'referral_required' });

    await expect(registerUser('+995555123456', 'გიორგი')).rejects.toThrow(
      'რეგისტრაციისთვის საჭიროა გამომწერი მეგობრის მოწვევა',
    );
    // Only the "already registered" lookup ran — no INSERTs.
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  it('records the inviter when the gate passes via referral', async () => {
    routeRegisterQueries();
    mockGate.mockResolvedValue({ eligible: true, mode: 'referral', inviterUserId: 5 });

    await registerUser('+995555123456', 'გიორგი', '+995599444420');

    expect(mockGate).toHaveBeenCalledWith('+995555123456', '+995599444420');
    const userInsertCall = mockQuery.mock.calls.find((c) =>
      (c[0] as string).includes('INSERT INTO "User"'),
    );
    expect(userInsertCall?.[0]).toContain('inviterReferralUserId');
    expect(userInsertCall?.[1]).toEqual(['გიორგი', '$2b$12$hashed', 5]);
  });

  it('parses +995 phone code correctly', async () => {
    routeRegisterQueries({ userId: 1 });

    await registerUser('+995555123456', 'Test');

    const phoneInsertCall = mockQuery.mock.calls.find((c) =>
      (c[0] as string).includes('INSERT INTO "UserPhone"'),
    );
    expect(phoneInsertCall?.[1]).toContain('+995');
    expect(phoneInsertCall?.[1]).toContain('555123456');
  });

  it('parses +44 phone code correctly', async () => {
    routeRegisterQueries({ userId: 1 });

    await registerUser('+447911123456', 'Test');

    const phoneInsertCall = mockQuery.mock.calls.find((c) =>
      (c[0] as string).includes('INSERT INTO "UserPhone"'),
    );
    expect(phoneInsertCall?.[1]).toContain('+44');
    expect(phoneInsertCall?.[1]).toContain('7911123456');
  });
});

describe('completeLogin', () => {
  it('returns token and isNewUser: false for a verified existing phone', async () => {
    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes('FROM "UserPhone"'))
        return Promise.resolve({ rows: [{ id: 5 }], rowCount: 1 } as never);
      if (sql.includes('DELETE FROM phone_verifications'))
        return Promise.resolve({ rows: [], rowCount: 1 } as never);
      return Promise.resolve({ rows: [], rowCount: 1 } as never);
    });

    const result = await completeLogin('+995555123456');

    expect(result.isNewUser).toBe(false);
    expect(result.token).toBeTruthy();
    const decoded = jwt.verify(result.token, JWT_SECRET) as { userId: string };
    expect(decoded.userId).toBe('5');
  });

  it('refuses a session when the phone was not verified', async () => {
    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes('FROM "UserPhone"'))
        return Promise.resolve({ rows: [{ id: 5 }], rowCount: 1 } as never);
      if (sql.includes('DELETE FROM phone_verifications'))
        return Promise.resolve({ rows: [], rowCount: 0 } as never);
      return Promise.resolve({ rows: [], rowCount: 1 } as never);
    });

    await expect(completeLogin('+995555123456')).rejects.toThrow(/დაუდასტურებელია/);
  });

  it('returns empty token and isNewUser: true for unknown phone', async () => {
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 } as never);

    const result = await completeLogin('+995000000000');

    expect(result.isNewUser).toBe(true);
    expect(result.token).toBe('');
  });
});

describe('adminLogin', () => {
  it('returns token for valid credentials', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: 1, password: 'hashed', hasAccessToAlly: true }],
      rowCount: 1,
    } as never);
    mockBcryptCompare.mockResolvedValueOnce(true as never);

    const result = await adminLogin('admin@test.com', 'secret');

    expect(result.token).toBeTruthy();
    const decoded = jwt.verify(result.token, JWT_SECRET) as { role: string };
    expect(decoded.role).toBe('admin');
  });

  it('throws when user not found', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 } as never);

    await expect(adminLogin('nobody@test.com', 'pass')).rejects.toThrow(
      'მომხმარებელი ვერ მოიძებნა',
    );
  });

  it('throws on wrong password', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: 1, password: 'hashed', hasAccessToAlly: true }],
      rowCount: 1,
    } as never);
    mockBcryptCompare.mockResolvedValueOnce(false as never);

    await expect(adminLogin('admin@test.com', 'wrong')).rejects.toThrow('არასწორი პაროლი');
  });
});

describe('verifyToken', () => {
  it('returns AuthPayload for valid token', () => {
    const token = jwt.sign({ userId: '42', role: 'user' }, JWT_SECRET);

    const result = verifyToken(token);

    expect(result).toEqual({ userId: '42', role: 'user' });
  });

  it('returns AuthPayload for admin token', () => {
    const token = jwt.sign({ userId: '1', role: 'admin' }, JWT_SECRET, { expiresIn: '8h' });

    const result = verifyToken(token);

    expect(result).toEqual({ userId: '1', role: 'admin' });
  });

  it('throws for invalid token', () => {
    expect(() => verifyToken('not-a-valid-token')).toThrow();
  });

  it('throws when payload missing userId', () => {
    const token = jwt.sign({ role: 'user' }, JWT_SECRET);

    expect(() => verifyToken(token)).toThrow('Invalid authentication token');
  });

  it('throws when payload missing role', () => {
    const token = jwt.sign({ userId: '1' }, JWT_SECRET);

    expect(() => verifyToken(token)).toThrow('Invalid authentication token');
  });

  it('throws for expired token', () => {
    const token = jwt.sign({ userId: '1', role: 'user' }, JWT_SECRET, { expiresIn: '-1s' });

    expect(() => verifyToken(token)).toThrow();
  });
});
