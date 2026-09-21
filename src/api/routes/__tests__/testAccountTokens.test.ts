jest.mock('../../../db/postgres/client', () => ({ query: jest.fn(), __esModule: true }));

import { readFileSync } from 'fs';
import { join } from 'path';
import { query } from '../../../db/postgres/client';
import {
  adjustTestAccountTokens,
  MAX_ADMIN_TOKEN_ADJUSTMENT,
  TokenAdjustmentOutOfRange,
} from '../../../services/tokenWallet.service';
import { isFictionalTestAccount } from '../../../services/testSeatTokens';

const mockQuery = query as jest.MockedFunction<typeof query>;

/**
 * §19, and what makes it narrower than what it replaces.
 *
 * The four `admin_adjust` rows already in the ledger were typed straight into
 * the database in July: 999,999 tokens to account 501, 100,000 to 160584,
 * 1,000 each to two more — no external_id, no note, no code path. That is the
 * precedent this operation had.
 *
 * Registered in docs/ADMIN_WRITE_OPERATIONS.md before it was built (D44) and
 * authorised by Misho on 21 September for a TEST account. The scoping is mine,
 * and these are the parts of it that must not quietly loosen.
 */
describe('a token grant that cannot reach a real person', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQuery.mockResolvedValue({ rows: [{ balance: '500' }], rowCount: 1 } as never);
  });

  it('writes admin_adjust, never topup — a grant is not a purchase', async () => {
    await adjustTestAccountTokens('171872', 500, 'row 217 drill', 'admin:abc');

    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('INSERT INTO token_transactions');
    expect(params[2]).toBe('admin_adjust');
    expect(params[2]).not.toBe('topup');
  });

  it('stores the reason on the row, so July cannot happen again', async () => {
    await adjustTestAccountTokens('171872', 500, 'row 217 drill', 'admin:abc');

    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('note');
    expect(params[4]).toBe('row 217 drill');
    expect(params[3]).toBe('admin:abc');
  });

  /** The undo is the same call negated, which only works if negatives pass. */
  it('takes a negative amount, because that IS the undo', async () => {
    await adjustTestAccountTokens('171872', -500, 'undo', 'admin:def');
    expect((mockQuery.mock.calls[0][1] as unknown[])[1]).toBe(-500);
  });

  it('refuses zero — a no-op row is a lie in a ledger', async () => {
    await expect(adjustTestAccountTokens('171872', 0, 'x', 'admin:g')).rejects.toBeInstanceOf(
      TokenAdjustmentOutOfRange,
    );
    expect(mockQuery).not.toHaveBeenCalled();
  });

  /** An extra digit must be a refusal, not a million tokens. */
  it.each([MAX_ADMIN_TOKEN_ADJUSTMENT + 1, -(MAX_ADMIN_TOKEN_ADJUSTMENT + 1), 999_999])(
    'refuses %s',
    async (amount) => {
      await expect(
        adjustTestAccountTokens('171872', amount, 'x', 'admin:h'),
      ).rejects.toBeInstanceOf(TokenAdjustmentOutOfRange);
      expect(mockQuery).not.toHaveBeenCalled();
    },
  );

  /**
   * The line that matters most, asserted against the REAL accounts the July
   * rows reached. 501 is the founder and 160584 is a real user; neither is
   * available through this operation.
   */
  it.each(['501', '160584', '13927', '564', '963', '4511'])(
    'is not reachable for real account %s',
    (id) => {
      expect(isFictionalTestAccount(id)).toBe(false);
    },
  );

  it.each(['171870', '171871', '171872', '171873', '171874', '171936'])(
    'is reachable for fictional account %s',
    (id) => {
      expect(isFictionalTestAccount(id)).toBe(true);
    },
  );
});

/**
 * The route is what enforces the account check — this asserts it is actually
 * wired, since the service layer deliberately does not know about the six.
 * Comments stripped first: the block above quotes the rules, and a plain
 * search would pass against my own note about the guard rather than the guard.
 */
describe('the route does the refusing', () => {
  const code = readFileSync(join(__dirname, '..', 'admin.routes.ts'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '');

  it('checks the account before it adjusts anything', () => {
    const at = code.indexOf("'/test-accounts/:id/tokens'");
    expect(at).toBeGreaterThan(-1);
    const handler = code.slice(at, code.indexOf('adminRouter.get', at));
    expect(handler.indexOf('isFictionalTestAccount')).toBeLessThan(
      handler.indexOf('adjustTestAccountTokens'),
    );
    expect(handler).toContain('status(403)');
  });

  it('bounds the amount and demands a note at the edge too', () => {
    const at = code.indexOf("'/test-accounts/:id/tokens'");
    const handler = code.slice(at, code.indexOf('adminRouter.get', at));
    expect(handler).toContain('MAX_ADMIN_TOKEN_ADJUSTMENT');
    expect(handler).toContain("body('note')");
  });
});
