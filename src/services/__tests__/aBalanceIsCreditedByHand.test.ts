const mockQuery = jest.fn();
jest.mock('../../db/postgres/client', () => ({
  __esModule: true,
  query: jest.fn(),
  withTransaction: (work: (client: { query: jest.Mock }) => Promise<unknown>) =>
    work({ query: mockQuery }),
}));

import { CREDIT_REASON, creditReferralBalance } from '../referralCredit.service';

/** #390 (D814, Misho's word, §144): 10 USD the founder can spend today, once. */
describe('a referral balance credited by hand', () => {
  const request = { userId: '501', amountUsd: 10, boardRow: '390' };

  beforeEach(() => mockQuery.mockReset());

  it('writes one row under its own reason, which is never held', async () => {
    mockQuery.mockResolvedValueOnce({ rowCount: 1 }).mockResolvedValueOnce({ rowCount: 1 });
    await expect(creditReferralBalance(request)).resolves.toEqual({
      status: 'credited',
      amountUsd: 10,
    });
    const [sql, params] = mockQuery.mock.calls[1] as [string, unknown[]];
    expect(sql).toContain('INSERT INTO referral_transactions');
    expect(params).toEqual(['501', 10, 'admin_credit', 'credit_390']);
    expect(CREDIT_REASON).not.toBe('earn');
  });

  it('writes nothing a second time', async () => {
    mockQuery.mockResolvedValueOnce({ rowCount: 1 }).mockResolvedValueOnce({ rowCount: 0 });
    await expect(creditReferralBalance(request)).resolves.toEqual({ status: 'already_credited' });
  });

  it('writes nothing for an account that is not there', async () => {
    mockQuery.mockResolvedValueOnce({ rowCount: 0 });
    await expect(creditReferralBalance(request)).resolves.toEqual({ status: 'no_such_account' });
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });
});
