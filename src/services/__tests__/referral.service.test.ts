const clientQuery = jest.fn();

jest.mock('../../db/postgres/client', () => ({
  query: jest.fn(),
  withTransaction: jest.fn(async (cb: (client: unknown) => Promise<unknown>) =>
    cb({ query: clientQuery }),
  ),
  __esModule: true,
}));

import { query } from '../../db/postgres/client';
import { clearPriceCache } from '../costLedger.service';
import {
  distributeReferralEarnings,
  getReferralSummary,
  spendReferralOnSubscription,
  spendReferralOnTokens,
  truncateUsd,
} from '../referral.service';

const mockQuery = query as jest.MockedFunction<typeof query>;

function rows(data: unknown[]): { rows: unknown[]; rowCount: number } {
  return { rows: data, rowCount: data.length };
}

interface ReferralWorld {
  // invitee id -> inviter row; chain walk follows these links upward.
  inviters?: Record<string, { inviter_id: number; deleted: Date | null }>;
  alreadyDistributed?: boolean;
  balance?: number;
  package?: { tokens: number; price_usd: string | null } | null;
}

const PRICES: Record<string, number> = {
  'referral.percent': 5,
  'referral.levels': 6,
  'referral.min_withdrawal_usd': 10,
  'subscription.price.pro': 19.99,
  'subscription.price.enterprise': 79,
};

function routeSql(world: ReferralWorld, sql: string, params?: unknown[]): unknown {
  if (sql.includes('FROM provider_prices')) {
    const key = (params as string[])[0];
    return rows([{ value: String(PRICES[key] ?? 0) }]);
  }
  if (sql.includes('FOR UPDATE')) return rows([{ id: params?.[0] }]);
  if (sql.includes('WHERE source_user_id')) {
    return rows(world.alreadyDistributed ? [{ present: 1 }] : []);
  }
  if (sql.includes('JOIN "User" inviter')) {
    const link = world.inviters?.[String(params?.[0])];
    return rows(link ? [link] : []);
  }
  if (sql.includes('INSERT INTO')) return rows([]);
  if (sql.includes('UPDATE "User"')) return rows([]);
  if (sql.includes('FROM topup_packages')) return rows(world.package ? [world.package] : []);
  if (sql.includes('SUM(amount_usd) AS balance FROM referral_transactions')) {
    return rows([{ balance: String(world.balance ?? 0) }]);
  }
  throw new Error(`Unexpected query: ${sql}`);
}

function setWorld(world: ReferralWorld): { inserts: () => { sql: string; params: unknown[] }[] } {
  const inserts: { sql: string; params: unknown[] }[] = [];
  const impl = (sql: string, params?: unknown[]): Promise<unknown> => {
    if (sql.includes('INSERT INTO')) inserts.push({ sql, params: params ?? [] });
    return Promise.resolve(routeSql(world, sql, params));
  };
  mockQuery.mockImplementation(impl as never);
  clientQuery.mockImplementation(impl as never);
  return { inserts: () => inserts };
}

beforeEach(() => {
  jest.clearAllMocks();
  clearPriceCache();
});

describe('truncateUsd', () => {
  it('truncates instead of rounding', () => {
    expect(truncateUsd(0.166583)).toBe(0.16);
    expect(truncateUsd(0.169999)).toBe(0.16);
    expect(truncateUsd(0.65833)).toBe(0.65);
  });
});

describe('distributeReferralEarnings', () => {
  // chain: 10 <- 20 <- 30 <- 40 <- 50 <- 60 <- 70 (subscriber is 10)
  const FULL_CHAIN: ReferralWorld['inviters'] = {
    '10': { inviter_id: 20, deleted: null },
    '20': { inviter_id: 30, deleted: null },
    '30': { inviter_id: 40, deleted: null },
    '40': { inviter_id: 50, deleted: null },
    '50': { inviter_id: 60, deleted: null },
    '60': { inviter_id: 70, deleted: null },
    '70': { inviter_id: 80, deleted: null },
  };

  it('pays 6 equal truncated shares up a full chain ($19.99 → $0.16 each)', async () => {
    const { inserts } = setWorld({ inviters: FULL_CHAIN });

    const paid = await distributeReferralEarnings('10', 19.99, 'txn_1');

    expect(paid).toBe(6);
    const earnRows = inserts();
    expect(earnRows).toHaveLength(6);
    expect(earnRows.map((i) => i.params[0])).toEqual(['20', '30', '40', '50', '60', '70']);
    for (const [index, row] of earnRows.entries()) {
      expect(row.params[1]).toBe(0.16); // truncated share
      expect(row.params[3]).toBe(index + 1); // level
      expect(row.params[4]).toBe('10'); // source subscriber
      expect(row.params[5]).toBe('txn_1');
    }
  });

  it('pays only existing levels on a short chain (2 of 6)', async () => {
    const { inserts } = setWorld({
      inviters: {
        '10': { inviter_id: 20, deleted: null },
        '20': { inviter_id: 30, deleted: null },
      },
    });

    expect(await distributeReferralEarnings('10', 19.99, 'txn_1')).toBe(2);
    expect(inserts()).toHaveLength(2);
  });

  it('skips a deleted inviter but keeps paying levels above them', async () => {
    const { inserts } = setWorld({
      inviters: {
        '10': { inviter_id: 20, deleted: new Date('2026-01-01') },
        '20': { inviter_id: 30, deleted: null },
      },
    });

    expect(await distributeReferralEarnings('10', 19.99, 'txn_1')).toBe(1);
    expect(inserts()[0].params[0]).toBe('30');
    expect(inserts()[0].params[3]).toBe(2); // keeps its true level
  });

  it('stops on an inviter cycle', async () => {
    const { inserts } = setWorld({
      inviters: {
        '10': { inviter_id: 20, deleted: null },
        '20': { inviter_id: 10, deleted: null },
      },
    });

    expect(await distributeReferralEarnings('10', 19.99, 'txn_1')).toBe(1);
    expect(inserts()).toHaveLength(1);
  });

  it('runs once per subscriber — renewals pay nothing', async () => {
    const { inserts } = setWorld({ inviters: FULL_CHAIN, alreadyDistributed: true });

    expect(await distributeReferralEarnings('10', 19.99, 'txn_2')).toBe(0);
    expect(inserts()).toHaveLength(0);
  });

  it('ignores zero-amount (trial) transactions without touching the DB', async () => {
    setWorld({ inviters: FULL_CHAIN });

    expect(await distributeReferralEarnings('10', 0, 'txn_1')).toBe(0);
    expect(clientQuery).not.toHaveBeenCalled();
  });
});

describe('spendReferralOnTokens', () => {
  const PACKAGE = { tokens: 500, price_usd: '10.99' };

  it('debits the balance and credits tokens atomically', async () => {
    const { inserts } = setWorld({ balance: 12.5, package: PACKAGE });

    const outcome = await spendReferralOnTokens('7', 1);

    expect(outcome).toEqual({ ok: true, tokens: 500 });
    const [spend, credit] = inserts();
    expect(spend.sql).toContain('referral_transactions');
    expect(spend.params[1]).toBe(-10.99);
    expect(credit.sql).toContain('token_transactions');
    expect(credit.params[1]).toBe(500);
    expect(credit.params[2]).toBe('referral_topup');
    // both legs share the same external id for traceability
    expect(spend.params[3]).toBe(credit.params[3]);
  });

  it('rejects insufficient balance and unknown packages', async () => {
    const { inserts } = setWorld({ balance: 5, package: PACKAGE });
    expect(await spendReferralOnTokens('7', 1)).toEqual({
      ok: false,
      reason: 'insufficient_balance',
    });
    expect(inserts()).toHaveLength(0);

    setWorld({ balance: 100, package: null });
    expect(await spendReferralOnTokens('7', 99)).toEqual({ ok: false, reason: 'unknown_package' });
  });
});

describe('spendReferralOnSubscription', () => {
  it('debits the price and activates one month', async () => {
    const { inserts } = setWorld({ balance: 25 });

    const outcome = await spendReferralOnSubscription('7', 'pro');

    expect(outcome).toEqual({ ok: true });
    expect(inserts()[0].params[1]).toBe(-19.99);
    const update = clientQuery.mock.calls.find(([sql]) => String(sql).includes('UPDATE "User"'));
    expect(update).toBeDefined();
    expect(String(update?.[0])).toContain("subscription_status    = 'active'");
    expect(update?.[1]).toEqual(['7', 'pro']);
  });

  it('rejects insufficient balance and unknown tiers', async () => {
    setWorld({ balance: 5 });
    expect(await spendReferralOnSubscription('7', 'pro')).toEqual({
      ok: false,
      reason: 'insufficient_balance',
    });
    expect(await spendReferralOnSubscription('7', 'platinum')).toEqual({
      ok: false,
      reason: 'unknown_tier',
    });
  });
});

describe('getReferralSummary', () => {
  it('maps balance, totals and withdrawal eligibility', async () => {
    mockQuery.mockImplementation(((sql: string, params?: unknown[]) => {
      if (String(sql).includes('FROM provider_prices')) {
        return Promise.resolve(rows([{ value: '10' }]));
      }
      if (String(sql).includes('FILTER (WHERE amount_usd > 0)')) {
        return Promise.resolve(rows([{ balance: '11.20', earned: '22.19' }]));
      }
      if (String(sql).includes('ORDER BY created_at DESC')) {
        return Promise.resolve(
          rows([
            {
              amount_usd: '0.16',
              reason: 'earn',
              level: 1,
              created_at: new Date('2026-07-01T10:00:00Z'),
            },
          ]),
        );
      }
      throw new Error(`Unexpected query: ${sql}`);
    }) as never);

    const summary = await getReferralSummary('7');

    expect(summary.balanceUsd).toBe(11.2);
    expect(summary.totalEarnedUsd).toBe(22.19);
    expect(summary.canWithdraw).toBe(true);
    expect(summary.history[0]).toEqual({
      amountUsd: 0.16,
      reason: 'earn',
      level: 1,
      createdAt: '2026-07-01T10:00:00.000Z',
    });
  });
});
