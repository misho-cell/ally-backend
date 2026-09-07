jest.mock('../../db/postgres/client', () => ({ query: jest.fn(), __esModule: true }));

import { query } from '../../db/postgres/client';
import { paymentHistory, recordPayment } from '../payments.service';

const mockQuery = query as jest.MockedFunction<typeof query>;

function rows(data: unknown[], rowCount = data.length): { rows: unknown[]; rowCount: number } {
  return { rows: data, rowCount };
}

beforeEach(() => {
  jest.clearAllMocks();
});

// Ticket 10 Task 28 (b): the payment history the founder reads first-three dates from.
describe('recordPayment', () => {
  it('writes one row per provider transaction, minor units to a two-decimal amount', async () => {
    mockQuery.mockResolvedValue(rows([], 1) as never);

    const written = await recordPayment({
      userId: '42',
      provider: 'stripe',
      externalId: 'in_1',
      kind: 'subscription',
      amountMinor: 1999,
      currency: 'USD',
      paidAt: new Date('2026-09-07T12:00:00Z'),
    });

    expect(written).toBe(true);
    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('ON CONFLICT (provider, external_id) DO NOTHING');
    expect(params).toEqual([
      '42',
      'stripe',
      'in_1',
      'subscription',
      '19.99',
      'usd',
      '2026-09-07T12:00:00.000Z',
    ]);
  });

  it('a retried webhook is not a second payment', async () => {
    mockQuery.mockResolvedValue(rows([], 0) as never);

    expect(
      await recordPayment({
        userId: '42',
        provider: 'paddle',
        externalId: 'txn_1',
        kind: 'topup',
        amountMinor: 1099,
        currency: 'usd',
        paidAt: new Date(),
      }),
    ).toBe(false);
  });

  it('a $0 trial invoice is not a payment and touches nothing', async () => {
    expect(
      await recordPayment({
        userId: '42',
        provider: 'stripe',
        externalId: 'in_trial',
        kind: 'subscription',
        amountMinor: 0,
        currency: 'usd',
        paidAt: new Date(),
      }),
    ).toBe(false);
    expect(mockQuery).not.toHaveBeenCalled();
  });
});

describe('paymentHistory', () => {
  it('gives the first three recorded payments, the total, and what the older ledger infers', async () => {
    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes('ORDER BY paid_at LIMIT'))
        return Promise.resolve(
          rows([
            {
              provider: 'stripe',
              kind: 'subscription',
              amount_usd: '19.99',
              currency: 'usd',
              paid_at: new Date('2026-09-07T12:00:00Z'),
            },
          ]) as never,
        );
      if (sql.includes('COUNT(*) AS n')) return Promise.resolve(rows([{ n: '4' }]) as never);
      if (sql.includes("'wallet_topup'"))
        return Promise.resolve(
          rows([
            { at: new Date('2026-08-01T00:00:00Z'), source: 'wallet_topup' },
            { at: null, source: 'subscription_became_active' },
          ]) as never,
        );
      return Promise.resolve(rows([]) as never);
    });

    const history = await paymentHistory('42');

    expect(history).toEqual({
      first_payments: [
        {
          provider: 'stripe',
          kind: 'subscription',
          amount_usd: 19.99,
          currency: 'usd',
          paid_at: '2026-09-07T12:00:00.000Z',
        },
      ],
      recorded_total: 4,
      inferred: [{ at: '2026-08-01T00:00:00.000Z', source: 'wallet_topup' }],
    });
    // Three, the founder's number, on both reads.
    const limits = mockQuery.mock.calls
      .filter(([sql]) => String(sql).includes('LIMIT $2'))
      .map(([, params]) => (params as unknown[])[1]);
    expect(limits).toEqual([3, 3]);
  });
});
