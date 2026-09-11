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
  it('returns an error, not a link, when app_flags.invite_link_ready is off — live-caught: the tool shipped enabled before /join existed, and disabling it via enabled_tools turned out to be a no-op', async () => {
    mockQuery.mockResolvedValue(rows([{ enabled: false }]) as never);

    const out = await getInviteLink('7');

    expect(out.link).toBeUndefined();
    expect(out.error).toBeDefined();
    expect(mockGetCode).not.toHaveBeenCalled();
  });

  it('also returns an error when the flag row does not exist at all (fail closed)', async () => {
    mockQuery.mockResolvedValue(rows([]) as never);

    const out = await getInviteLink('7');

    expect(out.link).toBeUndefined();
    expect(out.error).toBeDefined();
  });

  it("returns the join link with the user's own code, and records an 'issued' event (task 6 item 3: a tool call is not a share), once the flag is on", async () => {
    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes('FROM app_flags'))
        return Promise.resolve(rows([{ enabled: true }]) as never);
      return Promise.resolve(rows([]) as never);
    });
    mockGetCode.mockResolvedValue('ABCD1234');

    const out = await getInviteLink('7');

    expect(out).toEqual({ link: 'https://www.netai.guru/join?ref=ABCD1234', code: 'ABCD1234' });
    const insert = mockQuery.mock.calls.find(([sql]) => (sql as string).includes("'issued'"));
    expect(insert?.[1]).toEqual(['7']);
    // 'sent' is reserved for the real share action (recordLinkShared).
    const sent = mockQuery.mock.calls.find(([sql]) => (sql as string).includes("'sent'"));
    expect(sent).toBeUndefined();
  });
});

describe('recordLinkOpened', () => {
  it("records an 'opened' event for the code's owner and returns true", async () => {
    mockFindByCode.mockResolvedValue({ userId: 9, subscribed: true });

    const out = await recordLinkOpened('ABCD1234');

    expect(out).toBe(true);
    const insert = mockQuery.mock.calls.find(([sql]) => (sql as string).includes("'opened'"));
    expect(insert?.[1]).toEqual([9]);
  });

  it('writes nothing and returns false for a code that resolves to no one — live-caught: an invented code used to get back {recorded:true}', async () => {
    mockFindByCode.mockResolvedValue(null);

    const out = await recordLinkOpened('DOESNOTEXIST');

    expect(out).toBe(false);
    expect(mockQuery).not.toHaveBeenCalled();
  });
});

describe('getReferralFunnel', () => {
  it('combines link events and the already-existing registration attribution', async () => {
    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes('FROM referral_link_events'))
        return Promise.resolve(
          rows([
            { event: 'issued', count: '9' },
            { event: 'sent', count: '5' },
            { event: 'opened', count: '2' },
          ]) as never,
        );
      if (sql.includes('inviterReferralUserId'))
        return Promise.resolve(rows([{ count: '1' }]) as never);
      return Promise.resolve(rows([]) as never);
    });

    const out = await getReferralFunnel('7');

    // Ticket 12 Task 66: the tool call is 'link_shown', never an invitation.
    expect(out.link_shown).toBe(9);
    expect(out.sent).toBe(5);
    expect(out.opened).toBe(2);
    expect(out.registered).toBe(1);
    // Live-caught: {"sent":2,"opened":2,"registered":797} read as one
    // funnel, when "registered" is all-time and the other two only exist
    // since this feature shipped — the note must say so, not imply parity.
    expect(out.note).toContain('all-time');
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

describe('getReferralFunnel — Ticket 16 Task 89: only comparable steps may be drawn', () => {
  it('separates the three event counts from the all-time registration count', async () => {
    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes('GROUP BY event')) {
        return Promise.resolve(
          rows([
            { event: 'issued', count: '11' },
            { event: 'sent', count: '3' },
            { event: 'opened', count: '26' },
          ]) as never,
        );
      }
      if (sql.includes('MIN(created_at)')) {
        return Promise.resolve(rows([{ started_at: '2026-09-08T00:00:00.000Z' }]) as never);
      }
      if (sql.includes('"createdAt" >=')) return Promise.resolve(rows([{ count: '2' }]) as never);
      return Promise.resolve(rows([{ count: '799' }]) as never);
    });

    const funnel = await getReferralFunnel();

    expect(funnel.comparable_steps).toEqual([
      { step: 'link_shown', count: 11 },
      { step: 'sent', count: 3 },
      { step: 'opened', count: 26 },
    ]);
    // The number the screen printed as 7,264% of link_shown is not a step.
    expect(funnel.comparable_steps.some((s) => s.step === ('registered' as never))).toBe(false);
    expect(funnel.registered).toBe(799);
    expect(funnel.registered_since_tracking).toBe(2);
  });
});
