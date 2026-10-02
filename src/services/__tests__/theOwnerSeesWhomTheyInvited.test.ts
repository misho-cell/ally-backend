jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));

import { query } from '../../db/postgres/client';
import { InviteState, inviteStateOf, listInvitedPeople } from '../invitedPeople.service';

const mockQuery = query as jest.MockedFunction<typeof query>;

/** Board #503 (Ninia): the profile lists whom the owner invited, with a state each. */
describe('the people an owner invited', () => {
  it('lists those who registered through the owner, newest first, with a state', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          name: 'ნინო',
          created_at: new Date('2026-10-02T10:00:00Z'),
          subscription_status: 'active',
        },
        { name: null, created_at: new Date('2026-10-01T10:00:00Z'), subscription_status: null },
      ],
    } as never);

    expect(await listInvitedPeople('501')).toEqual([
      { name: 'ნინო', joined_at: '2026-10-02T10:00:00.000Z', state: InviteState.Paid },
      { name: null, joined_at: '2026-10-01T10:00:00.000Z', state: InviteState.Registered },
    ]);
    const [sql, params] = mockQuery.mock.calls[0];
    expect(String(sql)).toContain('"inviterReferralUserId" = $1 AND "deletedAt" IS NULL');
    expect(String(sql)).toContain('LIMIT');
    expect(params).toEqual(['501']);
  });

  it('names each state plainly', () => {
    expect(inviteStateOf('trialing')).toBe(InviteState.Trial);
    expect(inviteStateOf('past_due')).toBe(InviteState.Paid);
    expect(inviteStateOf('inactive')).toBe(InviteState.Registered);
  });
});
