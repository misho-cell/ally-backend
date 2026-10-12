process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

jest.mock('../../db/postgres/client', () => ({ query: jest.fn(), __esModule: true }));
jest.mock('bcrypt', () => ({ __esModule: true, default: { compare: jest.fn() } }));

import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { query } from '../../db/postgres/client';
import { adminLogin } from '../auth.service';

/**
 * The admin session length is a security parameter: there is no refresh and
 * no revocation list, so the TTL IS the blast radius of a stolen admin token.
 * Raised from 8h to 12h on 19 September, and temporarily to 100h on
 * 12 October (§137) on Misho's ask. This test reads the token adminLogin really
 * issues, so the number cannot change without this assertion changing with it.
 */
const mockQuery = query as jest.MockedFunction<typeof query>;
const mockCompare = bcrypt.compare as unknown as jest.Mock;
const HOUR_SECONDS = 60 * 60;
const ADMIN_SESSION_HOURS = 100;

function ttlSeconds(token: string): number {
  const decoded = jwt.decode(token) as { iat: number; exp: number };
  return decoded.exp - decoded.iat;
}

describe('the admin session length', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQuery.mockResolvedValue({
      rows: [{ id: 7, password: 'hash', hasAccessToAlly: true }],
      rowCount: 1,
    } as never);
    mockCompare.mockResolvedValue(true);
  });

  it('is one hundred hours for now (§137, temporary)', async () => {
    const { token } = await adminLogin('admin@example.com', 'right');
    expect(ttlSeconds(token)).toBe(ADMIN_SESSION_HOURS * HOUR_SECONDS);
  });

  it('issues nothing on a wrong password', async () => {
    mockCompare.mockResolvedValue(false);
    await expect(adminLogin('admin@example.com', 'wrong')).rejects.toThrow();
  });
});
