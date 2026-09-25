jest.mock('../../db/postgres/client', () => ({
  query: jest.fn(),
  /**
   * The settle runs inside a transaction so the balance read and the debit
   * write are one atomic act (row 271 B). The fake hands the callback a client
   * whose `query` IS the mock, so the world below answers every statement
   * inside the transaction exactly as it answers one outside — a transaction
   * the mock quietly emptied would let an unfloored debit pass.
   */
  withTransaction: jest.fn((callback: (client: { query: unknown }) => unknown) =>
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-var-requires
    callback({ query: jest.requireMock('../../db/postgres/client').query }),
  ),
  __esModule: true,
}));

import { query, withTransaction } from '../../db/postgres/client';
import { clearPriceCache } from '../costLedger.service';
import {
  checkRunAllowance,
  creditTopup,
  debitRun,
  ensurePeriodGrant,
  expireStaleGrants,
  getWalletSummary,
  listTopupPackages,
} from '../tokenWallet.service';

const mockQuery = query as jest.MockedFunction<typeof query>;

function rows(data: unknown[]): { rows: unknown[]; rowCount: number } {
  return { rows: data, rowCount: data.length };
}

interface WalletWorld {
  walletEnabled: boolean;
  subscriptionStatus: string | null;
  subscriptionTier?: string;
  balance: number;
  runCostUsd: number;
  staleGrants?: { period_key: string; amount: number }[];
  monthDebits?: number;
  /** The run was already debited: the insert hits the unique index and writes nothing. */
  debitConflict?: boolean;
}

const PRICES: Record<string, number> = {
  'tokens.usd_per_token': 0.01,
  'tokens.monthly_grant': 1000,
  'tokens.monthly_grant.pro': 1000,
  'tokens.monthly_grant.enterprise': 5500,
  'tokens.trial_grant': 120,
  'infra.overhead_pct': 10,
};

function setWorld(world: WalletWorld): { inserts: () => unknown[][] } {
  const inserts: unknown[][] = [];
  mockQuery.mockImplementation((sql: string, params?: unknown[]) => {
    if (sql.includes('FROM app_flags'))
      return Promise.resolve(rows([{ enabled: world.walletEnabled }]) as never);
    if (sql.includes('FROM provider_prices')) {
      const key = (params as string[])[0];
      return Promise.resolve(rows([{ value: String(PRICES[key] ?? 0) }]) as never);
    }
    if (sql.includes('subscription_status'))
      return Promise.resolve(
        (world.subscriptionStatus === null
          ? rows([])
          : rows([
              {
                subscription_status: world.subscriptionStatus,
                subscription_tier: world.subscriptionTier ?? 'pro',
              },
            ])) as never,
      );
    // The wallet lock the settle takes before it reads the balance.
    if (sql.includes('FOR UPDATE')) return Promise.resolve(rows([{ '?column?': 1 }]) as never);
    if (sql.includes('INSERT INTO token_transactions')) {
      inserts.push(params ?? []);
      // One row written — the ordinary case. A test of the one-debit-per-run
      // index (migration 126) overrides this with rowCount 0.
      return Promise.resolve({ rows: [], rowCount: world.debitConflict ? 0 : 1 } as never);
    }
    if (sql.includes('SUM(cost_usd) AS total FROM usage_events'))
      return Promise.resolve(rows([{ total: String(world.runCostUsd) }]) as never);
    if (sql.includes('NOT EXISTS')) return Promise.resolve(rows(world.staleGrants ?? []) as never);
    if (sql.includes('to_date('))
      return Promise.resolve(rows([{ spent: String(world.monthDebits ?? 0) }]) as never);
    if (sql.includes('FROM token_transactions'))
      return Promise.resolve(
        rows([{ balance: String(world.balance), granted: '1000', spent: '260' }]) as never,
      );
    throw new Error(`Unexpected query: ${sql}`);
  });
  return { inserts: () => inserts };
}

beforeEach(() => {
  jest.clearAllMocks();
  clearPriceCache();
});

describe('ensurePeriodGrant', () => {
  it('grants the monthly amount to an active subscriber', async () => {
    const { inserts } = setWorld({
      walletEnabled: true,
      subscriptionStatus: 'active',
      balance: 0,
      runCostUsd: 0,
    });

    await ensurePeriodGrant('7');

    expect(inserts()[0]).toEqual(['7', 1000, 'monthly_grant']);
  });

  it('grants the enterprise amount to an enterprise subscriber', async () => {
    const { inserts } = setWorld({
      walletEnabled: true,
      subscriptionStatus: 'active',
      subscriptionTier: 'enterprise',
      balance: 0,
      runCostUsd: 0,
    });

    await ensurePeriodGrant('7');

    expect(inserts()[0]).toEqual(['7', 5500, 'monthly_grant']);
  });

  it('falls back to the tierless grant for unknown tiers', async () => {
    const { inserts } = setWorld({
      walletEnabled: true,
      subscriptionStatus: 'active',
      subscriptionTier: 'legacy-mystery',
      balance: 0,
      runCostUsd: 0,
    });

    await ensurePeriodGrant('7');

    expect(inserts()[0]).toEqual(['7', 1000, 'monthly_grant']);
  });

  it('grants the trial amount to a trialing user', async () => {
    const { inserts } = setWorld({
      walletEnabled: true,
      subscriptionStatus: 'trialing',
      balance: 0,
      runCostUsd: 0,
    });

    await ensurePeriodGrant('7');

    expect(inserts()[0]).toEqual(['7', 120, 'trial_grant', 'trial']);
  });

  it('grants nothing to inactive users', async () => {
    const { inserts } = setWorld({
      walletEnabled: true,
      subscriptionStatus: 'inactive',
      balance: 0,
      runCostUsd: 0,
    });

    await ensurePeriodGrant('7');

    expect(inserts()).toHaveLength(0);
  });
});

describe('checkRunAllowance', () => {
  it('allows everything when the wallet flag is off', async () => {
    setWorld({ walletEnabled: false, subscriptionStatus: 'active', balance: 0, runCostUsd: 0 });

    const result = await checkRunAllowance('7');

    expect(result).toEqual({ allowed: true, balance: null });
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  it('allows a positive balance and blocks a zero balance', async () => {
    setWorld({ walletEnabled: true, subscriptionStatus: 'active', balance: 5, runCostUsd: 0 });
    expect(await checkRunAllowance('7')).toEqual({ allowed: true, balance: 5 });

    setWorld({ walletEnabled: true, subscriptionStatus: 'active', balance: 0, runCostUsd: 0 });
    expect(await checkRunAllowance('7')).toEqual({ allowed: false, balance: 0 });
  });
});

describe('debitRun', () => {
  it('debits ceil(cost × (1 + overhead) / token value) for the run', async () => {
    const { inserts } = setWorld({
      walletEnabled: true,
      subscriptionStatus: 'active',
      balance: 100,
      runCostUsd: 0.253,
    });

    const debit = await debitRun('7', 'run-1');

    // 0.253 × 1.10 = 0.2783 → / 0.01 = 27.83 → ceil = 28
    expect(debit).toEqual({ charged: 28, absorbed: 0 });
    expect(inserts()[0]).toEqual(['7', -28, 'chat_debit', 'run-1', 0]);
  });

  it('a retried settle of the same run charges nothing — one debit per run (Task 25 e)', async () => {
    setWorld({
      walletEnabled: true,
      subscriptionStatus: 'active',
      balance: 100,
      runCostUsd: 0.253,
      debitConflict: true,
    });

    expect(await debitRun('7', 'run-1')).toEqual({ charged: 0, absorbed: 0 });
    const [sql] = mockQuery.mock.calls.find(([s]) =>
      String(s).includes('INSERT INTO token_transactions'),
    ) as [string];
    expect(sql).toContain("ON CONFLICT (run_id) WHERE reason = 'chat_debit'");
  });

  it('debits nothing when the wallet is off or the run cost is zero', async () => {
    setWorld({ walletEnabled: false, subscriptionStatus: 'active', balance: 100, runCostUsd: 5 });
    expect(await debitRun('7', 'run-1')).toEqual({ charged: 0, absorbed: 0 });

    const { inserts } = setWorld({
      walletEnabled: true,
      subscriptionStatus: 'active',
      balance: 100,
      runCostUsd: 0,
    });
    expect(await debitRun('7', 'run-1')).toEqual({ charged: 0, absorbed: 0 });
    expect(inserts()).toHaveLength(0);
  });
});

/**
 * ⚠️ ROW 271 (B) — THE BALANCE COULD GO BELOW ZERO, AND TWICE AT ONCE.
 *
 * Misho, 25 September: „so that it can NOT exceed the token count under any
 * circumstance."
 *
 * The two leaks, both from the live ledger rather than from reasoning:
 *
 *   * Seat 171873, 21 September: 15 tokens left, one question cost 31, balance
 *     -16. A run's cost is simply not bounded by what is left.
 *   * Seat 171874, 25 September: balance 17, a run at 15:59:59 charged 23 and
 *     a second at 16:00:22 charged 29 — 17 -> -6 -> -35. Nothing was reserved
 *     between the check and the charge, so both runs were told yes.
 *
 * D348 allows ONE crossing. Two at once nobody decided, and thirty-five deep
 * nobody decided either.
 */
describe('the wallet stops at zero', () => {
  it('charges only what is left and records the rest as absorbed', async () => {
    // The seat's own numbers: 15 left, a run that cost 31.
    const { inserts } = setWorld({
      walletEnabled: true,
      subscriptionStatus: 'active',
      balance: 15,
      runCostUsd: 0.282,
    });

    // 0.282 × 1.10 = 0.3102 → / 0.01 = 31.02 → ceil = 32
    expect(await debitRun('7', 'run-1')).toEqual({ charged: 15, absorbed: 17 });
    expect(inserts()[0]).toEqual(['7', -15, 'chat_debit', 'run-1', 17]);
  });

  /**
   * The second of two runs that started together. It charges nothing and the
   * balance stays at zero instead of reaching -35 — and a row is still
   * written, because „this run cost 29 and the house paid it" is a fact the
   * books must hold. Returning silently is how the old behaviour would have
   * looked identical from outside.
   */
  it('charges nothing at zero, and still writes down what the house paid', async () => {
    const { inserts } = setWorld({
      walletEnabled: true,
      subscriptionStatus: 'active',
      balance: 0,
      runCostUsd: 0.2636,
    });

    expect(await debitRun('7', 'run-2')).toEqual({ charged: 0, absorbed: 29 });
    expect(inserts()[0]).toEqual(['7', 0, 'chat_debit', 'run-2', 29]);
  });

  /** Eight accounts are already below zero from before the floor. None deeper. */
  it('does not dig an already-negative balance any deeper', async () => {
    const { inserts } = setWorld({
      walletEnabled: true,
      subscriptionStatus: 'active',
      balance: -35,
      runCostUsd: 0.09,
    });

    expect(await debitRun('7', 'run-3')).toEqual({ charged: 0, absorbed: 10 });
    expect(inserts()[0]).toEqual(['7', 0, 'chat_debit', 'run-3', 10]);
  });

  /** A run that fits is untouched — the floor is a floor, not a tax. */
  it('changes nothing for a run the balance covers', async () => {
    const { inserts } = setWorld({
      walletEnabled: true,
      subscriptionStatus: 'active',
      balance: 1000,
      runCostUsd: 0.09,
    });

    expect(await debitRun('7', 'run-4')).toEqual({ charged: 10, absorbed: 0 });
    expect(inserts()[0]).toEqual(['7', -10, 'chat_debit', 'run-4', 0]);
  });

  /**
   * ⚠️ THE CONCURRENCY HALF, AND IT IS THE HALF THAT ACTUALLY PRODUCED -35.
   *
   * A floor computed from a balance read outside a lock is not a floor: two
   * settles landing together would both read 17 and both charge 17. So the
   * lock is taken FIRST, the balance is read INSIDE the same transaction, and
   * the insert follows — in that order, on one connection.
   */
  it('locks the wallet, then reads the balance, then writes — in one transaction', async () => {
    setWorld({
      walletEnabled: true,
      subscriptionStatus: 'active',
      balance: 17,
      runCostUsd: 0.209,
    });

    await debitRun('7', 'run-5');

    const statements = mockQuery.mock.calls.map(([sql]) => String(sql));
    const lock = statements.findIndex((s) => s.includes('FOR UPDATE'));
    const read = statements.findIndex((s) => s.includes('SUM(amount) AS balance'));
    const write = statements.findIndex((s) => s.includes('INSERT INTO token_transactions'));

    expect(lock).toBeGreaterThanOrEqual(0);
    expect(lock).toBeLessThan(read);
    expect(read).toBeLessThan(write);
    expect(withTransaction).toHaveBeenCalledTimes(1);
  });

  /** The prices are read before the lock, so nothing waits on a price lookup. */
  it('holds the lock for the write alone, not for the price reads', async () => {
    setWorld({
      walletEnabled: true,
      subscriptionStatus: 'active',
      balance: 17,
      runCostUsd: 0.209,
    });

    await debitRun('7', 'run-6');

    const statements = mockQuery.mock.calls.map(([sql]) => String(sql));
    const lastPrice = statements.map((s) => s.includes('FROM provider_prices')).lastIndexOf(true);
    expect(lastPrice).toBeLessThan(statements.findIndex((s) => s.includes('FOR UPDATE')));
  });
});

describe('expireStaleGrants', () => {
  it("burns the unused part of last month's grant", async () => {
    const { inserts } = setWorld({
      walletEnabled: true,
      subscriptionStatus: 'active',
      balance: 700,
      runCostUsd: 0,
      staleGrants: [{ period_key: 'm:2026-06', amount: 1000 }],
      monthDebits: 400,
    });

    await expireStaleGrants('7');

    // grant 1000 − spent 400 = 600 leftover → burned
    expect(inserts()[0]).toEqual(['7', -600, 'grant_expiry', 'exp:2026-06']);
  });

  it('writes a zero marker when the grant was fully spent', async () => {
    const { inserts } = setWorld({
      walletEnabled: true,
      subscriptionStatus: 'active',
      balance: 500,
      runCostUsd: 0,
      staleGrants: [{ period_key: 'm:2026-06', amount: 1000 }],
      monthDebits: 1200,
    });

    await expireStaleGrants('7');

    expect(inserts()[0]).toEqual(['7', 0, 'grant_expiry', 'exp:2026-06']);
  });

  it('never burns more than the current balance (top-ups survive)', async () => {
    const { inserts } = setWorld({
      walletEnabled: true,
      subscriptionStatus: 'active',
      balance: 300,
      runCostUsd: 0,
      staleGrants: [{ period_key: 'm:2026-06', amount: 1000 }],
      monthDebits: 0,
    });

    await expireStaleGrants('7');

    expect(inserts()[0]).toEqual(['7', -300, 'grant_expiry', 'exp:2026-06']);
  });

  it('does nothing when every past grant is already settled', async () => {
    const { inserts } = setWorld({
      walletEnabled: true,
      subscriptionStatus: 'active',
      balance: 500,
      runCostUsd: 0,
      staleGrants: [],
    });

    await expireStaleGrants('7');

    expect(inserts()).toHaveLength(0);
  });
});

describe('creditTopup', () => {
  it('credits and reports true on the first insert', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 } as never);

    expect(await creditTopup('7', 500, 'txn_123')).toBe(true);
    expect(mockQuery.mock.calls[0][1]).toEqual(['7', 500, 'topup', 'txn_123']);
  });

  it('is idempotent: a webhook retry credits nothing', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 } as never);

    expect(await creditTopup('7', 500, 'txn_123')).toBe(false);
  });

  it('rejects non-positive amounts without touching the DB', async () => {
    expect(await creditTopup('7', 0, 'txn_123')).toBe(false);
    expect(mockQuery).not.toHaveBeenCalled();
  });
});

describe('listTopupPackages', () => {
  it('maps active packages', async () => {
    mockQuery.mockResolvedValueOnce(
      rows([
        { id: 1, paddle_price_id: 'pri_x', tokens: 500, label: '500 ტოკენი', price_usd: '10.99' },
      ]) as never,
    );

    expect(await listTopupPackages()).toEqual([
      { id: 1, paddlePriceId: 'pri_x', tokens: 500, label: '500 ტოკენი', priceUsd: 10.99 },
    ]);
  });
});

describe('getWalletSummary', () => {
  it('returns balance and month movements', async () => {
    setWorld({ walletEnabled: true, subscriptionStatus: 'active', balance: 740, runCostUsd: 0 });

    const summary = await getWalletSummary('7');

    // Ticket 12 Task 34: the summary also says which window the allowance
    // counts in and when it resets (the mock world carries no resets_at, so
    // the date is the empty string here).
    expect(summary).toEqual({
      enabled: true,
      balance: 740,
      grantedThisPeriod: 1000,
      spentThisPeriod: 260,
      window: 'calendar_month',
      resetsAt: '',
    });
  });
});

// Ticket 10 Task 25 (c), D124: one variable moves the grant, its expiry and
// the summary from the calendar month to the calendar week. Everything above
// ran with the variable unset, which is the month — nothing changed there.
describe('BUDGET_WINDOW=week', () => {
  beforeEach(() => {
    process.env.BUDGET_WINDOW = 'week';
    clearPriceCache();
  });
  afterEach(() => {
    delete process.env.BUDGET_WINDOW;
  });

  it('reads the weekly grant and stamps the row with the ISO week key', async () => {
    const { inserts } = setWorld({
      walletEnabled: true,
      subscriptionStatus: 'active',
      balance: 0,
      runCostUsd: 0,
    });

    await ensurePeriodGrant('7');

    const priceKeys = mockQuery.mock.calls
      .filter(([sql]) => String(sql).includes('FROM provider_prices'))
      .map(([, params]) => (params as string[])[0]);
    expect(priceKeys).toEqual(['tokens.weekly_grant.pro', 'tokens.weekly_grant']);
    // Neither weekly key is priced yet, so nothing is granted — the founder
    // sets the number before the switch is thrown.
    expect(inserts()).toHaveLength(0);
  });

  it('grants the weekly amount once it is priced, under a w: key', async () => {
    PRICES['tokens.weekly_grant'] = 250;
    const { inserts } = setWorld({
      walletEnabled: true,
      subscriptionStatus: 'active',
      balance: 0,
      runCostUsd: 0,
    });

    await ensurePeriodGrant('7');

    delete PRICES['tokens.weekly_grant'];
    expect(inserts()[0]).toEqual(['7', 250, 'monthly_grant']);
    const insertSql = String(
      mockQuery.mock.calls.find(([sql]) =>
        String(sql).includes('INSERT INTO token_transactions'),
      )?.[0],
    );
    expect(insertSql).toContain(`'w:' || to_char(NOW(), 'IYYY-"W"IW')`);
  });

  it("expires only w: grants, against the week's key, and reads the week's spend", async () => {
    const { inserts } = setWorld({
      walletEnabled: true,
      subscriptionStatus: 'active',
      balance: 700,
      runCostUsd: 0,
      staleGrants: [{ period_key: 'w:2026-W35', amount: 300 }],
      monthDebits: 100,
    });

    await expireStaleGrants('7');

    const [staleSql, staleParams] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(staleSql).toContain("period_key LIKE $3 || '%'");
    expect(staleParams[2]).toBe('w:');
    const spendSql = String(
      mockQuery.mock.calls.find(([sql]) => String(sql).includes('to_date('))?.[0],
    );
    expect(spendSql).toContain(`to_date($2, 'IYYY-"W"IW')`);
    expect(spendSql).toContain("INTERVAL '1 week'");
    expect(inserts()[0]).toEqual(['7', -200, 'grant_expiry', 'exp:2026-W35']);
  });

  it('the summary counts the week', async () => {
    setWorld({ walletEnabled: false, subscriptionStatus: 'active', balance: 1, runCostUsd: 0 });

    await getWalletSummary('7');

    const summarySql = String(
      mockQuery.mock.calls.find(([sql]) => String(sql).includes('AS granted'))?.[0],
    );
    expect(summarySql).toContain("date_trunc('week', NOW())");
    expect(summarySql).not.toContain("date_trunc('month'");
  });
});

describe('the default window is the month (nothing changed for anyone today)', () => {
  it('grants under m: and expires m: grants only', async () => {
    delete process.env.BUDGET_WINDOW;
    setWorld({
      walletEnabled: true,
      subscriptionStatus: 'active',
      balance: 0,
      runCostUsd: 0,
      staleGrants: [],
    });

    await ensurePeriodGrant('7');
    await expireStaleGrants('7');

    const insertSql = String(
      mockQuery.mock.calls.find(([sql]) =>
        String(sql).includes('INSERT INTO token_transactions'),
      )?.[0],
    );
    expect(insertSql).toContain(`'m:' || to_char(NOW(), 'YYYY-MM')`);
    const [, staleParams] = mockQuery.mock.calls.find(([sql]) =>
      String(sql).includes('NOT EXISTS'),
    ) as [string, unknown[]];
    expect(staleParams[2]).toBe('m:');
  });
});
