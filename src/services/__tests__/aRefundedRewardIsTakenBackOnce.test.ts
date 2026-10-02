jest.mock('../../db/postgres/client', () => ({
  __esModule: true,
  query: jest.fn(),
  withTransaction: jest.fn(),
}));
jest.mock('../costLedger.service', () => ({ __esModule: true, getPrice: jest.fn() }));

import { query } from '../../db/postgres/client';
import { clawbackReferralEarnings } from '../referral.service';

const mockQuery = query as jest.MockedFunction<typeof query>;

/** #233 — the reward earned from a refunded payment comes back, once per share. */
describe('taking back a refunded payment’s reward', () => {
  it('writes one negative line per share earned from that payment, idempotently', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 2 } as never);

    expect(await clawbackReferralEarnings('txn_7')).toBe(2);
    const [sql, params] = mockQuery.mock.calls[0];
    expect(String(sql)).toContain('-amount_usd');
    expect(String(sql)).toContain('ON CONFLICT (user_id, external_id)');
    expect(params).toEqual(['txn_7', 'clawback', 'clawback_', 'earn']);
  });

  it('takes nothing back from a payment that earned nothing', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 } as never);
    expect(await clawbackReferralEarnings('in_none')).toBe(0);
  });
});
