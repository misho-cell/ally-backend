const mockQuery = jest.fn();
jest.mock('../../db/postgres/client', () => ({
  __esModule: true,
  query: (...a: unknown[]) => mockQuery(...a),
}));

import { readFileSync } from 'fs';
import { join } from 'path';
import {
  MAX_REFILLS_PER_DAY,
  REFILL_BELOW,
  REFILL_TO,
  refillBelowFloor,
} from '../tokenFloor.service';

beforeEach(() => jest.resetAllMocks());

/** #7627: George ran out at 22:31 and three goals stopped while answers came in. */
describe('a goal never stops for tokens', () => {
  it('fills a real member back to the floor, at most a few times a day', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ amount: 1850 }] });
    expect(await refillBelowFloor('598')).toBe(1850);
    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(params).toEqual(['598', REFILL_TO, 'floor_refill', REFILL_BELOW, MAX_REFILLS_PER_DAY]);
    expect(sql).toContain('WHERE wallet.balance < $4');
    expect(sql).toContain('NOT EXISTS (SELECT 1 FROM test_seats');
    expect(sql).toContain('"deletedAt" IS NULL');
    expect(sql).toContain("INTERVAL '24 hours') < $5");
  });

  it('adds nothing when the wallet is above the floor', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    expect(await refillBelowFloor('598')).toBe(0);
  });

  it('runs after every debit, and a failure never fails the run', () => {
    const wallet = readFileSync(join(__dirname, '..', 'tokenWallet.service.ts'), 'utf8');
    expect(wallet).toMatch(
      /settleRunAgainstTheBalance\(userId, runId, tokens\);\s*\/\/ #7627[\s\S]{0,120}await refillBelowFloor\(userId\)/u,
    );
    expect(wallet).toContain('floor refill failed');
  });
});
