jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));

import { query } from '../../db/postgres/client';
import { referralTree, MAX_NODES } from '../referralTree.service';

const mockQuery = query as jest.MockedFunction<typeof query>;

/**
 * ROW 264 — „the admin does not show who invited whom."
 *
 * ⚠️ THE POPULATION IS THE POINT, not the tree. Read from the live base while
 * building this:
 *
 *   805  accounts carry an inviter
 *     8  of them have ever opened Netai
 *     6  of them are fictional test seats
 *
 * „805 people were invited" is TRUE and would have told the founder something
 * false — almost all of them are legacy Ally rows imported before Netai
 * existed. `ro.sh` refuses to let a query say „users" without saying which of
 * the three it means, and it was right to: the number he needs is the eight.
 */
interface Row {
  user_id: number;
  name: string | null;
  joined: string | null;
  inviter: number | null;
  is_seat: boolean;
  /**
   * ⚠️ TWO FIELDS NOW, AND ROW 264 IS WHY. „Opened Netai" meant a thread here
   * and a thread-or-search-or-subscription on `/admin/users`, so Sofo — who
   * registered through the founder's invite that morning — was a `netai_user`
   * on one screen and an `ally_account` on the other. The label is not
   * cosmetic: an `ally_account` is somebody the product is told to PITCH to.
   *
   * JOINED is „they arrived" and carries the population; USED is „they opened
   * a conversation" and carries the growth number. The fixture states both
   * because the product now distinguishes them.
   */
  joined_netai: boolean;
  opened_netai: boolean;
}

const person = (user_id: number, inviter: number | null, extra: Partial<Row> = {}): Row => ({
  user_id,
  name: `P${user_id}`,
  joined: '2026-09-01',
  inviter,
  is_seat: false,
  joined_netai: false,
  opened_netai: false,
  ...extra,
});

const given = (rows: Row[]): void => {
  mockQuery.mockResolvedValue({ rows, rowCount: rows.length } as never);
};

beforeEach(() => jest.clearAllMocks());

describe('the tree says which population each person is', () => {
  it('separates a Netai user, a legacy Ally account and a test seat', async () => {
    given([
      person(1, null),
      person(2, 1, { joined_netai: true, opened_netai: true }),
      person(3, 1),
      person(4, 1, { is_seat: true, joined_netai: true, opened_netai: true }),
    ]);

    const tree = await referralTree(1, 2);
    const kinds = tree.roots[0].invited.map((n) => n.population);

    expect(kinds).toEqual(['netai_user', 'ally_account', 'test_seat']);
  });

  /** A seat that has opened Netai is still a seat, never a member. */
  it('never counts a test seat as a person who turned up', async () => {
    given([person(1, null), person(2, 1, { is_seat: true, opened_netai: true })]);

    const tree = await referralTree(1, 2);

    expect(tree.roots[0].invited_total).toBe(1);
    expect(tree.roots[0].invited_who_opened_netai).toBe(0);
    expect(tree.counted.of_them_test_seats).toBe(1);
  });

  it('reports the whole base split three ways, not one total', async () => {
    given([
      person(1, null),
      person(2, 1, { opened_netai: true }),
      person(3, 1),
      person(4, 1, { is_seat: true }),
    ]);

    const tree = await referralTree(1, 1);

    expect(tree.counted).toEqual({
      invited_rows_in_all: 3,
      of_them_opened_netai: 1,
      of_them_test_seats: 1,
    });
  });
});

describe('the counts mean what they say', () => {
  /**
   * „How many did I bring" counts everybody below, at every depth — not the
   * ones that happen to be rendered. A number that changed with the depth
   * parameter would be a number nobody could quote.
   */
  it('counts every level below, even when only one is shown', async () => {
    given([person(1, null), person(2, 1), person(3, 2), person(4, 3)]);

    const shallow = await referralTree(1, 1);

    expect(shallow.roots[0].invited).toHaveLength(1);
    expect(shallow.roots[0].invited_total).toBe(3);
  });

  it('shows more when asked for more depth', async () => {
    given([person(1, null), person(2, 1), person(3, 2)]);

    const deep = await referralTree(1, 3);

    expect(deep.roots[0].invited[0].invited).toHaveLength(1);
    expect(deep.roots[0].invited[0].invited[0].user_id).toBe(3);
  });
});

describe('it cannot run away', () => {
  /**
   * Nothing in the schema forbids a cycle in `inviterReferralUserId`. A walk
   * that trusted the data not to loop would hang the admin page, and „it has
   * never happened" is not a constraint.
   */
  it('survives an invitation cycle', async () => {
    given([person(1, 2), person(2, 1)]);

    const tree = await referralTree(1, MAX_NODES);

    expect(tree.roots[0].user_id).toBe(1);
  });

  it('says when it stopped early instead of implying it saw everything', async () => {
    const many = [person(1, null), ...Array.from({ length: 500 }, (_, i) => person(i + 2, 1))];
    given(many);

    const tree = await referralTree(1, 2);

    expect(tree.truncated).toBe(true);
    expect(tree.roots[0].invited.length).toBeLessThanOrEqual(MAX_NODES);
    // …and the total still tells the truth about what is down there.
    expect(tree.roots[0].invited_total).toBe(500);
  });
});

describe('what it must never hand back', () => {
  it('has no phone number anywhere in the shape', async () => {
    given([person(1, null), person(2, 1, { opened_netai: true })]);

    const tree = await referralTree(1, 2);

    expect(JSON.stringify(tree)).not.toMatch(/\+?\d{9,}/);
    expect(Object.keys(tree.roots[0])).not.toContain('phone');
  });

  it('names people by name', async () => {
    given([person(1, null), person(2, 1)]);

    const tree = await referralTree(1, 2);

    expect(tree.roots[0].invited[0].name).toBe('P2');
  });
});

/**
 * ⚠️ THE CASE THE TESTER FOUND, AS A TEST: somebody who registered through a
 * Netai invite this morning and has not opened a conversation yet.
 *
 * Sofo (172497). She is a MEMBER, not a target — and the connector's own
 * instructions turn that label into behaviour: an `ally_account` „has never
 * opened Netai — it is a target, not a member". Calling her an ally_account
 * was about to have the product pitch Netai to somebody who had just joined.
 */
describe('somebody who joined today but has not written anything yet', () => {
  it('is a member, not a target', async () => {
    given([person(1, null), person(2, 1, { joined_netai: true, opened_netai: false })]);

    const tree = await referralTree(1, 2);

    expect(tree.roots[0].invited[0].population).toBe('netai_user');
  });

  /** And somebody who genuinely never arrived is still a target. */
  it('and somebody who never arrived is still an ally_account', async () => {
    given([person(1, null), person(2, 1, { joined_netai: false, opened_netai: false })]);

    const tree = await referralTree(1, 2);

    expect(tree.roots[0].invited[0].population).toBe('ally_account');
  });
});
