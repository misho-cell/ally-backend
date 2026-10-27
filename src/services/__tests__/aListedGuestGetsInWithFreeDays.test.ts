jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));
jest.mock('../inviteCohorts.service', () => ({ __esModule: true, grantCohortTrial: jest.fn() }));
jest.mock('../inviteReward.service', () => ({
  __esModule: true,
  inviteFreeDays: jest.fn(),
  inviteFreeDaysCohort: (days: number) => ({ code: 'INVITED', trial_days: days }),
}));
jest.mock('../inviteGate.service', () => ({ __esModule: true, subscribedInviter: jest.fn() }));

import { query } from '../../db/postgres/client';
import { grantCohortTrial } from '../inviteCohorts.service';
import { inviteFreeDays } from '../inviteReward.service';
import { subscribedInviter } from '../inviteGate.service';
import {
  addGuests,
  guestCohort,
  guestState,
  GuestState,
  setGuestDays,
  startGuestDays,
} from '../guestList.service';
import { claimInviteDays, InviteDaysOutcome } from '../inviteDaysClaim.service';

const mockQuery = query as jest.MockedFunction<typeof query>;
const mockGrant = grantCohortTrial as jest.MockedFunction<typeof grantCohortTrial>;
const PHONE = '+995500000077';
const DAY = 86_400_000;

const listed = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 7,
  phone_digits: '995500000077',
  group_name: 'Axel',
  free_days: 20,
  inviter_user_id: 171,
  user_id: null,
  first_signin_at: null,
  ...over,
});

beforeEach(() => {
  mockQuery.mockReset();
  mockGrant.mockReset();
  (inviteFreeDays as jest.Mock).mockReset();
  (subscribedInviter as jest.Mock).mockReset();
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
});

/** #6172 (launch 21 Oct): the guest list. */
describe('a number on the guest list', () => {
  it('waits, then counts its days from the first sign-in, then ends', () => {
    const now = new Date('2026-10-21T10:00:00Z');
    expect(guestState({ first_signin_at: null, free_days: 20 }, now)).toEqual({
      state: GuestState.Waiting,
      daysLeft: null,
    });
    const started = new Date(now.getTime() - 5 * DAY);
    expect(guestState({ first_signin_at: started, free_days: 20 }, now)).toEqual({
      state: GuestState.Active,
      daysLeft: 15,
    });
    const long = new Date(now.getTime() - 25 * DAY);
    expect(guestState({ first_signin_at: long, free_days: 20 }, now).state).toBe(GuestState.Ended);
  });

  it('is granted as the group’s own cohort, pro', () => {
    expect(guestCohort({ group_name: 'Axel', free_days: 20 })).toMatchObject({
      code: 'GUEST:Axel',
      trial_days: 20,
      tier: 'pro',
    });
  });

  it('gets its days at the first sign-in, with the group’s inviter, once', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [listed()] } as never)
      .mockResolvedValueOnce({ rowCount: 1, rows: [] } as never)
      .mockResolvedValueOnce({ rows: [{ paying: false }] } as never);
    expect(await startGuestDays(189001, PHONE)).toBe(true);
    expect(mockGrant).toHaveBeenCalledWith(
      189001,
      PHONE,
      expect.objectContaining({ code: 'GUEST:Axel' }),
    );
    expect(mockQuery.mock.calls[2][1]).toEqual([189001, 171]);

    mockQuery.mockReset();
    mockGrant.mockReset();
    mockQuery.mockResolvedValueOnce({ rows: [listed({ first_signin_at: new Date() })] } as never);
    expect(await startGuestDays(189001, PHONE)).toBe(false);
    expect(mockGrant).not.toHaveBeenCalled();
  });

  it('leaves an account that already pays as it is, and an unlisted number alone', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [listed()] } as never)
      .mockResolvedValueOnce({ rowCount: 1, rows: [] } as never)
      .mockResolvedValueOnce({ rows: [{ paying: true }] } as never);
    expect(await startGuestDays(189001, PHONE)).toBe(false);
    mockQuery.mockResolvedValueOnce({ rows: [] } as never);
    expect(await startGuestDays(189002, '+995500000078')).toBe(false);
    expect(mockGrant).not.toHaveBeenCalled();
  });

  it('adds a pasted list once each, and counts what was not a number', async () => {
    mockQuery.mockResolvedValueOnce({ rowCount: 2, rows: [] } as never);
    const outcome = await addGuests({
      group: 'Axel',
      days: 20,
      inviterUserId: 171,
      phones: [PHONE, '995500000077', '599 00 00 79', 'not a number'],
      addedBy: '167250',
    });
    expect(outcome).toEqual({ added: 2, invalid: 1 });
    expect(mockQuery.mock.calls[0][1]?.[0]).toEqual(['995500000077', '995599000079']);
  });

  it('changes the days for a group and moves the open trials with it', async () => {
    mockQuery
      .mockResolvedValueOnce({ rowCount: 3, rows: [] } as never)
      .mockResolvedValueOnce({ rowCount: 2, rows: [] } as never);
    expect(await setGuestDays({ group: 'Axel' }, 30)).toBe(3);
    expect(String(mockQuery.mock.calls[1][0])).toContain('trial_ends_at = g.first_signin_at');
    expect(mockQuery.mock.calls[1][1]).toEqual(['Axel', 'GUEST:']);
  });
});

/** #6341 (launch 21 Oct): „continue free" on the Pro page. */
describe('claiming the invitation’s free days', () => {
  const account = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
    subscription_status: 'inactive',
    trial_ends_at: null,
    current_period_ends_at: null,
    subscription_status_changed_at: null,
    invite_cohort: null,
    inviter: null,
    phone: PHONE,
    trial_used: false,
    ...over,
  });

  it('does nothing for an account that already has access', async () => {
    const ends = new Date(Date.now() + 5 * DAY).toISOString();
    mockQuery.mockResolvedValueOnce({
      rows: [account({ subscription_status: 'trialing', trial_ends_at: ends })],
    } as never);
    expect((await claimInviteDays('189001')).outcome).toBe(InviteDaysOutcome.AlreadyHasAccess);
  });

  it('grants the days on the inviter recorded on the account', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [account({ inviter: 171 })] } as never)
      .mockResolvedValueOnce({ rows: [] } as never)
      .mockResolvedValueOnce({ rowCount: 1, rows: [] } as never)
      .mockResolvedValueOnce({
        rows: [{ trial_ends_at: new Date('2026-11-09T10:00:00Z') }],
      } as never);
    (subscribedInviter as jest.Mock).mockResolvedValue(null);
    (inviteFreeDays as jest.Mock).mockResolvedValue(20);
    const result = await claimInviteDays('189001');
    expect(result).toEqual({
      outcome: InviteDaysOutcome.Granted,
      trialEndsAt: '2026-11-09T10:00:00.000Z',
    });
    expect(mockGrant).toHaveBeenCalledWith(189001, PHONE, { code: 'INVITED', trial_days: 20 });
  });

  /** Tester 77057: an old Ally account the founder invited from inside Netai. */
  it('takes an invitation sent from inside Netai to this number', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [account()] } as never)
      .mockResolvedValueOnce({ rows: [] } as never)
      .mockResolvedValueOnce({ rows: [{ referral_code: 'FOUNDER1' }] } as never)
      .mockResolvedValueOnce({ rowCount: 1, rows: [] } as never)
      .mockResolvedValueOnce({
        rows: [{ trial_ends_at: new Date('2026-11-16T10:00:00Z') }],
      } as never);
    (subscribedInviter as jest.Mock).mockImplementation(async (code?: string) =>
      code === 'FOUNDER1' ? 501 : null,
    );
    (inviteFreeDays as jest.Mock).mockResolvedValue(20);
    const result = await claimInviteDays('93863');
    expect(result.outcome).toBe(InviteDaysOutcome.Granted);
    expect(String(mockQuery.mock.calls[2][0])).toContain('FROM invites i');
    expect(mockQuery.mock.calls[3][1]).toEqual(['93863', 501]);
  });

  it('says why when there is no invitation, or the days were already used', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [account()] } as never)
      .mockResolvedValueOnce({ rows: [] } as never)
      .mockResolvedValueOnce({ rows: [] } as never);
    (subscribedInviter as jest.Mock).mockResolvedValue(null);
    expect((await claimInviteDays('189001')).outcome).toBe(InviteDaysOutcome.NoInvitation);

    mockQuery
      .mockResolvedValueOnce({
        rows: [account({ invite_cohort: 'INVITED', inviter: 171 })],
      } as never)
      .mockResolvedValueOnce({ rows: [] } as never);
    expect((await claimInviteDays('189001')).outcome).toBe(InviteDaysOutcome.AlreadyUsed);
    expect(mockGrant).not.toHaveBeenCalled();
  });
});
