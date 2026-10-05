jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));
jest.mock('../tokenWallet.service', () => ({
  __esModule: true,
  adjustTestAccountTokens: jest.fn().mockResolvedValue(500),
}));

import { readFileSync } from 'fs';
import { join } from 'path';
import { query } from '../../db/postgres/client';
import {
  chosenFictionalPhone,
  createTestSeat,
  SeatCreationRefused,
} from '../testSeatCreate.service';

const mockQuery = query as jest.MockedFunction<typeof query>;
const FICTION = '+447700900123';

function holders(registered: number, realHolders: number): never {
  return { rows: [{ registered, real_holders: realHolders }], rowCount: 1 } as never;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockQuery.mockResolvedValue({ rows: [], rowCount: 0 } as never);
});

/**
 * K (Misho, 5 Oct, §91): the D651 test needs a seat registering on a number
 * other seats already hold. A caller may name it — only a fictional number
 * nobody is registered on and that only test seats have saved.
 */
describe('a seat on a number only seats hold', () => {
  it('takes a fictional number held by seats alone', async () => {
    mockQuery.mockResolvedValueOnce(holders(0, 0));
    await expect(chosenFictionalPhone(` ${FICTION} `)).resolves.toBe(FICTION);
    const [sql, params, timeout] = mockQuery.mock.calls[0];
    expect(String(sql)).toContain('FROM "UserAlias" WHERE phone = $1');
    expect(String(sql)).toContain('FROM "UserTags" WHERE phone = $1');
    expect(String(sql)).toContain('NOT EXISTS (SELECT 1 FROM test_seats s');
    expect(params).toEqual([FICTION]);
    expect(timeout).toBeGreaterThan(0);
  });

  it('refuses a number outside the reserved ranges without asking the database', async () => {
    await expect(chosenFictionalPhone('+995555123456')).rejects.toBeInstanceOf(SeatCreationRefused);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('refuses a number somebody is registered on', async () => {
    mockQuery.mockResolvedValueOnce(holders(1, 0));
    await expect(chosenFictionalPhone(FICTION)).rejects.toThrow('already registered');
  });

  it('refuses a number one real phonebook holds', async () => {
    mockQuery.mockResolvedValueOnce(holders(0, 1));
    await expect(chosenFictionalPhone(FICTION)).rejects.toThrow('not a test seat');
  });

  it('refuses before a single row is written', async () => {
    mockQuery.mockResolvedValueOnce(holders(0, 1));
    await expect(
      createTestSeat('Seat', [], 500, 'admin:1', 'D651 test', { phone: FICTION }),
    ).rejects.toBeInstanceOf(SeatCreationRefused);
    const writes = mockQuery.mock.calls.filter(([sql]) => /INSERT/u.test(String(sql)));
    expect(writes).toHaveLength(0);
  });

  it('is passed through by the admin route', () => {
    const admin = readFileSync(
      join(__dirname, '..', '..', 'api', 'routes', 'admin.routes.ts'),
      'utf8',
    );
    expect(admin).toContain(
      "body('phone').optional().isString().trim().isLength({ min: 8, max: 20 })",
    );
    expect(admin).toContain('invitedBy: invited_by?.toString(), phone }');
  });
});
