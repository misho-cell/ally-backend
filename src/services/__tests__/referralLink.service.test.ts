jest.mock('../../db/postgres/client', () => ({ query: jest.fn(), __esModule: true }));
jest.mock('../referralCode.service', () => ({
  __esModule: true,
  getOrCreateReferralCode: jest.fn(),
  findUserByReferralCode: jest.fn(),
}));

import { query } from '../../db/postgres/client';
import { getOrCreateReferralCode, findUserByReferralCode } from '../referralCode.service';
import { getInviteLink, recordLinkOpened, getReferralFunnel } from '../referralLink.service';

const mockQuery = query as jest.MockedFunction<typeof query>;
const mockGetCode = getOrCreateReferralCode as jest.MockedFunction<typeof getOrCreateReferralCode>;
const mockFindByCode = findUserByReferralCode as jest.MockedFunction<typeof findUserByReferralCode>;

function rows(data: unknown[]): { rows: unknown[]; rowCount: number } {
  return { rows: data, rowCount: data.length };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockQuery.mockResolvedValue(rows([]) as never);
});

describe('getInviteLink (engine T3)', () => {
  it("returns the join link with the user's own code, and records a 'sent' event", async () => {
    mockGetCode.mockResolvedValue('ABCD1234');

    const out = await getInviteLink('7');

    expect(out).toEqual({ link: 'https://www.netai.guru/join?ref=ABCD1234', code: 'ABCD1234' });
    const insert = mockQuery.mock.calls.find(([sql]) => (sql as string).includes("'sent'"));
    expect(insert?.[1]).toEqual(['7']);
  });
});

describe('recordLinkOpened', () => {
  it("records an 'opened' event for the code's owner", async () => {
    mockFindByCode.mockResolvedValue({ userId: 9, subscribed: true });

    await recordLinkOpened('ABCD1234');

    const insert = mockQuery.mock.calls.find(([sql]) => (sql as string).includes("'opened'"));
    expect(insert?.[1]).toEqual([9]);
  });

  it('silently does nothing for a code that resolves to no one', async () => {
    mockFindByCode.mockResolvedValue(null);

    await recordLinkOpened('DOESNOTEXIST');

    expect(mockQuery).not.toHaveBeenCalled();
  });
});

describe('getReferralFunnel', () => {
  it('combines link events and the already-existing registration attribution', async () => {
    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes('FROM referral_link_events'))
        return Promise.resolve(
          rows([
            { event: 'sent', count: '5' },
            { event: 'opened', count: '2' },
          ]) as never,
        );
      if (sql.includes('inviterReferralUserId'))
        return Promise.resolve(rows([{ count: '1' }]) as never);
      return Promise.resolve(rows([]) as never);
    });

    const out = await getReferralFunnel('7');

    expect(out).toEqual({ sent: 5, opened: 2, registered: 1 });
  });

  it('scopes to one user when userId is given, and product-wide otherwise', async () => {
    await getReferralFunnel('7');
    let call = mockQuery.mock.calls.find(([sql]) =>
      (sql as string).includes('referral_link_events'),
    );
    expect(call?.[1]).toEqual(['7']);

    jest.clearAllMocks();
    mockQuery.mockResolvedValue(rows([]) as never);
    await getReferralFunnel();
    call = mockQuery.mock.calls.find(([sql]) => (sql as string).includes('referral_link_events'));
    expect(call?.[1]).toEqual([]);
  });
});
