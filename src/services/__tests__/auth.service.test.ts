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

jest.mock('bcrypt', () => ({
  hash: jest.fn(),
  compare: jest.fn(),
}));

import jwt from 'jsonwebtoken';
import { query } from '../../db/postgres/client';
import { sendWhatsAppMessage } from '../whatsapp.service';
import { createUserPhoneNode } from '../contacts.service';
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

beforeEach(() => {
  jest.clearAllMocks();
  mockCreatePhoneNode.mockResolvedValue(undefined);
  mockBcryptHash.mockResolvedValue('$2b$12$hashed' as never);
});

describe('requestOTP', () => {
  it('inserts OTP record and sends WhatsApp message', async () => {
    mockQuery.mockResolvedValue({ rows: [], rowCount: 1 } as never);
    mockSendWhatsApp.mockResolvedValue(undefined);

    await requestOTP('+995555123456', 'AUTH');

    expect(mockQuery).toHaveBeenCalledTimes(1);
    expect(mockQuery.mock.calls[0][0]).toContain('INSERT INTO "Otp"');
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
  it('deletes OTP on successful verification', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 42 }], rowCount: 1 } as never)
      .mockResolvedValueOnce({ rows: [], rowCount: 1 } as never);

    await verifyOTP('+995555123456', '123456', 'AUTH');

    expect(mockQuery).toHaveBeenCalledTimes(2);
    expect(mockQuery.mock.calls[1][0]).toContain('DELETE FROM "Otp"');
    expect(mockQuery.mock.calls[1][1]).toEqual([42]);
  });

  it('throws when OTP not found or expired', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 } as never);

    await expect(verifyOTP('+995555123456', '000000', 'AUTH')).rejects.toThrow(
      'კოდი არასწორია ან ვადა გასულია',
    );
  });
});

describe('registerUser', () => {
  it('creates user and phone record, returns token', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [], rowCount: 0 } as never)
      .mockResolvedValueOnce({ rows: [{ id: 7 }], rowCount: 1 } as never)
      .mockResolvedValueOnce({ rows: [], rowCount: 1 } as never);

    const result = await registerUser('+995555123456', 'გიორგი');

    expect(result.token).toBeTruthy();
    const decoded = jwt.verify(result.token, JWT_SECRET) as { userId: string; role: string };
    expect(decoded.userId).toBe('7');
    expect(decoded.role).toBe('user');
    expect(mockCreatePhoneNode).toHaveBeenCalledWith('+995555123456');
  });

  it('throws when phone already registered', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 1 }], rowCount: 1 } as never);

    await expect(registerUser('+995555123456', 'გიორგი')).rejects.toThrow(
      'ნომერი უკვე რეგისტრირებულია',
    );
  });

  it('parses +995 phone code correctly', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [], rowCount: 0 } as never)
      .mockResolvedValueOnce({ rows: [{ id: 1 }], rowCount: 1 } as never)
      .mockResolvedValueOnce({ rows: [], rowCount: 1 } as never);

    await registerUser('+995555123456', 'Test');

    const phoneInsertCall = mockQuery.mock.calls[2];
    expect(phoneInsertCall[1]).toContain('+995');
    expect(phoneInsertCall[1]).toContain('555123456');
  });

  it('parses +44 phone code correctly', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [], rowCount: 0 } as never)
      .mockResolvedValueOnce({ rows: [{ id: 1 }], rowCount: 1 } as never)
      .mockResolvedValueOnce({ rows: [], rowCount: 1 } as never);

    await registerUser('+447911123456', 'Test');

    const phoneInsertCall = mockQuery.mock.calls[2];
    expect(phoneInsertCall[1]).toContain('+44');
    expect(phoneInsertCall[1]).toContain('7911123456');
  });
});

describe('completeLogin', () => {
  it('returns token and isNewUser: false for existing phone', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 5 }], rowCount: 1 } as never);

    const result = await completeLogin('+995555123456');

    expect(result.isNewUser).toBe(false);
    expect(result.token).toBeTruthy();
    const decoded = jwt.verify(result.token, JWT_SECRET) as { userId: string };
    expect(decoded.userId).toBe('5');
  });

  it('returns empty token and isNewUser: true for unknown phone', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 } as never);

    const result = await completeLogin('+995000000000');

    expect(result.isNewUser).toBe(true);
    expect(result.token).toBe('');
  });
});

describe('adminLogin', () => {
  it('returns token for valid credentials', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: 1, password: 'hashed' }],
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
      rows: [{ id: 1, password: 'hashed' }],
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
