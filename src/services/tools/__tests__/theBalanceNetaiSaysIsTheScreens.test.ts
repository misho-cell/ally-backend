jest.mock('../../tokenWallet.service', () => ({ __esModule: true, getWalletSummary: jest.fn() }));

import { getWalletSummary } from '../../tokenWallet.service';
import { myTokenBalance } from '../tokenBalance';

const mockSummary = getWalletSummary as jest.MockedFunction<typeof getWalletSummary>;

/** Team task #377: Netai states the same balance as the screen. */
describe('the balance Netai is given', () => {
  it('is the screen’s own summary, number for number', async () => {
    mockSummary.mockResolvedValueOnce({
      enabled: true,
      balance: 4380,
      grantedThisPeriod: 5000,
      spentThisPeriod: 620,
      window: 'week',
      resetsAt: '2026-10-05T00:00:00.000Z',
    });

    const answer = await myTokenBalance('165699');

    expect(mockSummary).toHaveBeenCalledWith('165699');
    expect(answer).toMatchObject({
      balance: 4380,
      granted_this_period: 5000,
      spent_this_period: 620,
      resets_at: '2026-10-05T00:00:00.000Z',
    });
  });

  it('says no reset date rather than an invalid one', async () => {
    mockSummary.mockResolvedValueOnce({
      enabled: false,
      balance: 0,
      grantedThisPeriod: 0,
      spentThisPeriod: 0,
      window: 'week',
      resetsAt: '',
    });
    expect((await myTokenBalance('1')).resets_at).toBeNull();
  });
});
