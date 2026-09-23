jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));

import { query } from '../../db/postgres/client';
import { canBeAsked } from '../taskAsks.service';

const mockQuery = query as jest.MockedFunction<typeof query>;

/**
 * FOUND BY THE SABOTAGE SWEEP, 23 September: `if (!row) return 'not_member'`
 * removed, whole suite green.
 *
 * `canBeAsked` answers one question — may a message reach this phone at all —
 * and its three verdicts decide what the owner is told about a person before
 * they approve a plan naming them. Nothing exercised two of the three.
 *
 * Removing that line does not silently pass, either: `row.userId` would throw
 * on the next line. So the sweep's real finding is not „the guard is missing"
 * but „NOTHING CALLS THIS FUNCTION WITH A STRANGER'S NUMBER", which is the
 * commonest input it has — most people in a plan are not members.
 *
 * WHAT THE THREE MEAN, because they are not interchangeable and the plan
 * renderer says different things for each:
 *
 *   not_member    no account at all. Nothing we send can arrive.
 *   never_opened  an account exists and the person has never opened Netai —
 *                 the account was made FOR them, by an import or an invite.
 *   ok            a Netai user, or a subscriber.
 *
 * „No account" and „an account nobody has ever opened" being the same answer
 * is the bug this file exists to prevent: the second is somebody the owner may
 * reasonably invite, the first is a number we know nothing about.
 */
beforeEach(() => jest.clearAllMocks());

/** The membership lookup, then (only if that found somebody) the opened check. */
const lookups = (member: object | null, opened?: boolean): void => {
  mockQuery.mockResolvedValueOnce({
    rows: member ? [member] : [],
    rowCount: member ? 1 : 0,
  } as never);
  if (opened !== undefined) {
    mockQuery.mockResolvedValueOnce({ rows: [{ opened }], rowCount: 1 } as never);
  }
};

describe('who can be asked at all', () => {
  it('says not_member when no account carries the number', async () => {
    lookups(null);

    expect(await canBeAsked('+995500000001')).toBe('not_member');
  });

  /**
   * AND IT DOES NOT GO ON TO ASK WHETHER THEY HAVE OPENED IT. There is nobody
   * to ask about; a second query here would be reading a null id.
   */
  it('asks nothing further about somebody who does not exist', async () => {
    lookups(null);

    await canBeAsked('+995500000001');

    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  /**
   * THE DISTINCTION THAT MATTERS. An account exists — made by an import or an
   * invitation — and the person has never once opened Netai. Telling the owner
   * this is „not a member" would hide somebody they could reasonably invite.
   */
  it('says never_opened for an account nobody has ever used', async () => {
    lookups({ userId: 42, subscriptionStatus: null }, false);

    expect(await canBeAsked('+995500000002')).toBe('never_opened');
  });

  it('says ok once they have opened it', async () => {
    lookups({ userId: 42, subscriptionStatus: null }, true);

    expect(await canBeAsked('+995500000003')).toBe('ok');
  });

  /**
   * A SUBSCRIBER IS REACHABLE WITHOUT THE SECOND QUERY. Paying for it is
   * stronger evidence of having opened it than a thread row, and the lookup is
   * on the hot path of every plan that names people.
   */
  it('takes a subscription as proof and does not look further', async () => {
    lookups({ userId: 42, subscriptionStatus: 'active' });

    expect(await canBeAsked('+995500000004')).toBe('ok');
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  /**
   * FORMAT-INDEPENDENT, and this is the same rule the blocked-contact guard
   * follows: „+995 599 12 34 56" and „995599123456" are one person, and a
   * reachability answer that depends on the spelling is not an answer. The
   * query strips non-digits on BOTH sides.
   */
  it('compares the number without trusting its spelling', async () => {
    lookups({ userId: 42, subscriptionStatus: 'active' });

    await canBeAsked('+995 599 12 34 56');

    const [sql] = mockQuery.mock.calls[0];
    expect(String(sql)).toContain("regexp_replace(up.phone, '\\D', '', 'g')");
    expect(String(sql)).toContain("regexp_replace($1, '\\D', '', 'g')");
  });

  /**
   * A DELETED ACCOUNT IS NOT A MEMBER. Somebody who has left must not be
   * offered as askable because their row is still on disk.
   */
  it('does not count an account that has been deleted', async () => {
    lookups({ userId: 42, subscriptionStatus: 'active' });

    await canBeAsked('+995500000005');

    expect(String(mockQuery.mock.calls[0][0])).toContain('u."deletedAt" IS NULL');
  });
});
