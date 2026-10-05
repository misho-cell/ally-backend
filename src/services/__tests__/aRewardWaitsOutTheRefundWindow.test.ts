jest.mock('../../db/postgres/client', () => ({
  __esModule: true,
  query: jest.fn(),
  withTransaction: jest.fn(),
}));
jest.mock('../costLedger.service', () => ({ __esModule: true, getPrice: jest.fn() }));

import { query } from '../../db/postgres/client';
import { getPrice } from '../costLedger.service';
import { getReferralSummary, REWARD_HOLD_DAYS } from '../referral.service';

const mockQuery = query as jest.MockedFunction<typeof query>;
const mockPrice = getPrice as jest.MockedFunction<typeof getPrice>;

beforeEach(() => jest.clearAllMocks());

/**
 * D674 (the founder, 5 Oct): a refund is possible in the first 3 days and takes
 * the reward back (D673); a reward is usable from day 4.
 */
describe('a reward waits out the refund window', () => {
  it('holds rewards for three days', () => {
    expect(REWARD_HOLD_DAYS).toBe(3);
  });

  it('shows what is on hold apart from what can be used, and withdraws only the usable part', async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [{ balance: '12.00', earned: '12.00', on_hold: '4.00' }],
      } as never)
      .mockResolvedValueOnce({ rows: [] } as never);
    mockPrice.mockResolvedValue(10);
    const summary = await getReferralSummary('7');
    expect(summary).toMatchObject({
      balanceUsd: 12,
      availableUsd: 8,
      onHoldUsd: 4,
      holdDays: 3,
      canWithdraw: false,
    });
    expect(String(mockQuery.mock.calls[0][0])).toContain(
      "reason = 'earn' AND created_at > NOW() - make_interval(days => 3)",
    );
  });

  it('lets the whole balance be used once nothing is on hold', async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [{ balance: '12.00', earned: '12.00', on_hold: null }],
      } as never)
      .mockResolvedValueOnce({ rows: [] } as never);
    mockPrice.mockResolvedValue(10);
    await expect(getReferralSummary('7')).resolves.toMatchObject({
      availableUsd: 12,
      canWithdraw: true,
    });
  });
});
