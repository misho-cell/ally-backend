const mockQuery = jest.fn();
jest.mock('../../db/postgres/client', () => ({
  __esModule: true,
  query: jest.fn(),
  withTransaction: (work: (client: { query: jest.Mock }) => Promise<unknown>) =>
    work({ query: mockQuery }),
}));

import { topUpReferralReward } from '../referralTopUp.service';

/** #5420 (Misho's word, §142): Lika's 0.16 brought up to D692's 1.00, once. */
describe('a reward topped up by hand', () => {
  const request = { userId: '11', sourceUserId: '22', toUsd: 1, boardRow: '5420' };
  const kept = (total: string | null, level: number | null) => ({ rows: [{ total, level }] });

  beforeEach(() => mockQuery.mockReset());

  it('adds only the difference, as a reward from the same payer and level', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce(kept('0.16', 1))
      .mockResolvedValueOnce({ rowCount: 1 });
    await expect(topUpReferralReward(request)).resolves.toEqual({
      status: 'topped_up',
      beforeUsd: 0.16,
      addedUsd: 0.84,
    });
    const [sql, params] = mockQuery.mock.calls[2] as [string, unknown[]];
    expect(sql).toContain('INSERT INTO referral_transactions');
    expect(params).toEqual(['11', 0.84, 'earn', 1, '22', 'topup_5420_22']);
  });

  it('writes nothing when the target is met', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce(kept('1.00', 1));
    await expect(topUpReferralReward(request)).resolves.toEqual({
      status: 'already_met',
      beforeUsd: 1,
    });
    expect(mockQuery).toHaveBeenCalledTimes(2);
  });

  it('writes nothing a second time', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce(kept('0.16', 1))
      .mockResolvedValueOnce({ rowCount: 0 });
    await expect(topUpReferralReward(request)).resolves.toMatchObject({ status: 'already_met' });
  });

  it('never makes a reward where there was none', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce(kept(null, null));
    await expect(topUpReferralReward(request)).resolves.toEqual({ status: 'no_reward_to_top_up' });
    expect(mockQuery).toHaveBeenCalledTimes(2);
  });
});
