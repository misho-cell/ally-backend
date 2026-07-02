jest.mock('../../db/postgres/client', () => ({ query: jest.fn(), __esModule: true }));

import { query } from '../../db/postgres/client';
import { clearPriceCache } from '../costLedger.service';
import {
  checkRunAllowance,
  debitRun,
  ensurePeriodGrant,
  getWalletSummary,
} from '../tokenWallet.service';

const mockQuery = query as jest.MockedFunction<typeof query>;

function rows(data: unknown[]): { rows: unknown[]; rowCount: number } {
  return { rows: data, rowCount: data.length };
}

interface WalletWorld {
  walletEnabled: boolean;
  subscriptionStatus: string | null;
  balance: number;
  runCostUsd: number;
}

const PRICES: Record<string, number> = {
  'tokens.usd_per_token': 0.01,
  'tokens.monthly_grant': 1000,
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
          : rows([{ subscription_status: world.subscriptionStatus }])) as never,
      );
    if (sql.includes('INSERT INTO token_transactions')) {
      inserts.push(params ?? []);
      return Promise.resolve(rows([]) as never);
    }
    if (sql.includes('SUM(cost_usd) AS total FROM usage_events'))
      return Promise.resolve(rows([{ total: String(world.runCostUsd) }]) as never);
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

    const tokens = await debitRun('7', 'run-1');

    // 0.253 × 1.10 = 0.2783 → / 0.01 = 27.83 → ceil = 28
    expect(tokens).toBe(28);
    expect(inserts()[0]).toEqual(['7', -28, 'chat_debit', 'run-1']);
  });

  it('debits nothing when the wallet is off or the run cost is zero', async () => {
    setWorld({ walletEnabled: false, subscriptionStatus: 'active', balance: 100, runCostUsd: 5 });
    expect(await debitRun('7', 'run-1')).toBe(0);

    const { inserts } = setWorld({
      walletEnabled: true,
      subscriptionStatus: 'active',
      balance: 100,
      runCostUsd: 0,
    });
    expect(await debitRun('7', 'run-1')).toBe(0);
    expect(inserts()).toHaveLength(0);
  });
});

describe('getWalletSummary', () => {
  it('returns balance and month movements', async () => {
    setWorld({ walletEnabled: true, subscriptionStatus: 'active', balance: 740, runCostUsd: 0 });

    const summary = await getWalletSummary('7');

    expect(summary).toEqual({
      enabled: true,
      balance: 740,
      grantedThisPeriod: 1000,
      spentThisPeriod: 260,
    });
  });
});
