jest.mock('../../db/postgres/client', () => ({ query: jest.fn(), __esModule: true }));

import { query } from '../../db/postgres/client';
import {
  addRosterMember,
  filterRoster,
  isOnRoster,
  removeRosterMember,
  rosterMembers,
  sharedRoster,
} from '../roster.service';
import { searchRoster } from '../tools/searchRoster';

const mockQuery = query as jest.MockedFunction<typeof query>;

function rows(data: unknown[]): { rows: unknown[]; rowCount: number } {
  return { rows: data, rowCount: data.length };
}

const ROSTER = [
  {
    phone: '+995599000001',
    group: 'Axel',
    user_id: 501,
    name: 'Tornike Abuladze',
    on_netai: true,
    account_name: 'Tornike Abuladze',
    all_aliases: ['Tornike Abuladze'],
  },
  {
    phone: '+995599000002',
    group: 'Axel',
    user_id: 618,
    name: 'Jaba Kikvidze',
    on_netai: false,
    account_name: null,
    all_aliases: ['Jaba Kikvidze'],
  },
  {
    phone: '+995599000003',
    group: 'Axel',
    user_id: 160584,
    name: 'Lika Ose',
    on_netai: true,
    account_name: 'Lika Ose',
    // Row 10: the same person, saved by different people under names that do
    // not share a single word. This is the real shape of the Axel roster.
    all_aliases: ['Lika Ose', 'ლიკა ოსეფაშვილი', 'Lika Osepashvili. Axel'],
  },
  {
    phone: '+995599000004',
    group: 'Axel',
    user_id: null,
    name: null,
    on_netai: null,
    account_name: null,
    all_aliases: null,
  },
];

beforeEach(() => {
  jest.clearAllMocks();
  mockQuery.mockResolvedValue(rows(ROSTER) as never);
});

describe('the roster', () => {
  it('reads the public member_of facts and the account behind each phone', async () => {
    const members = await rosterMembers('axel');
    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("f.field_type = 'member_of' AND f.is_public");
    expect(params[0]).toBe('%axel%');
    expect(members.map((m) => m.on_netai)).toEqual([true, false, true, false]);
  });

  it('knows who is on it and what two people share', async () => {
    expect(await isOnRoster('501', 'Axel')).toBe(true);
    expect(await isOnRoster('777', 'Axel')).toBe(false);
    expect(await sharedRoster('501', '160584')).toBe('Axel');
    expect(await sharedRoster('501', '777')).toBeNull();
  });

  /**
   * Ticket 17 Task 88's leftover. Account 686's own `name` is the unfilled
   * registration form — „First Last" — and an account's name outranks the
   * label, so that one Axel row still read „First Last" on 12 September while
   * the network saves the number as „Hayk Asriyants".
   */
  it('steps past an unfilled registration form, in the account name and in the label', async () => {
    await rosterMembers('axel');
    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    const placeholders = params[3] as string[];

    expect(placeholders).toContain('first last');
    // Both readings consult the same list: the account's own name...
    expect(sql).toContain('LOWER(TRIM(u.name)) = ANY($4::text[])');
    // ...and the label that stands in for it.
    expect(sql).toContain('LOWER(TRIM(a.alias)) <> ALL($4::text[])');
  });

  it('filters by every word of a name', async () => {
    const members = await rosterMembers('axel');
    expect(filterRoster(members, 'lika').map((m) => m.user_id)).toEqual([160584]);
    expect(filterRoster(members, 'lika abuladze')).toEqual([]);
    expect(filterRoster(members, '')).toHaveLength(4);
  });

  /**
   * Ticket 20 row 10 — a member the roster cannot NAME cannot be reached, and
   * reaching a fellow member is the only reason this roster exists.
   *
   * The seat's audit of the founder's own 108 Axel members, 18 September.
   * Eight of them are in the roster under something nobody would type:
   *
   *   Guka Khimshiashvili    saved as „Guka Khimsho"
   *   Kakhaber Tchipashvili  saved as „Kakha Chipashvili"
   *   Nikoloz Shekiladze     Georgian script only
   *   Elene Tskhadadze       „Elene Tsxadadze. Axel"
   *
   * The display name is whichever label won a contest between them. Until now
   * it was also the only thing a search could match, so the other names — the
   * ones somebody would actually search for — were invisible.
   */
  it('finds a member under a name that did NOT win the display', async () => {
    const members = await rosterMembers('axel');

    // Displayed as „Lika Ose", searched for as her full name in Georgian.
    expect(filterRoster(members, 'ოსეფაშვილი').map((m) => m.user_id)).toEqual([160584]);
    // And by the transliterated surname nobody displays.
    expect(filterRoster(members, 'osepashvili').map((m) => m.user_id)).toEqual([160584]);
    // The display name still works, obviously.
    expect(filterRoster(members, 'lika ose').map((m) => m.user_id)).toEqual([160584]);
  });

  it('requires every word to be in ONE name, not spread across several', async () => {
    const members = await rosterMembers('axel');

    // „Ose" is in one of her names and „Abuladze" in somebody else's. Matching
    // across the whole set would introduce people by combining two labels that
    // were never one person's name.
    expect(filterRoster(members, 'ose abuladze')).toEqual([]);
    // Within one label it still matches on both words.
    expect(filterRoster(members, 'lika osepashvili').map((m) => m.user_id)).toEqual([160584]);
  });

  it('does not fall over on a member with no name at all', async () => {
    const members = await rosterMembers('axel');
    expect(() => filterRoster(members, 'anything')).not.toThrow();
    expect(filterRoster(members, 'anything')).toEqual([]);
  });
});

describe('search_roster — the one search past the phonebook', () => {
  /**
   * THE ORDER CHANGED ON 20 SEPTEMBER AND THE CHANGE IS THE POINT, so this
   * asserts by identity instead of by position.
   *
   * The seat's 365: on the live Axel roster the fifty-row cap had dropped two
   * Netai users, found only because they tried a name filter. A Netai user is
   * the only person on a roster who can be reached through their own
   * assistant, so they are now returned FIRST and the cap falls on people it
   * can afford to drop. This test used to read `results[0]` and `results[1]`,
   * which is how it came to assert the old order as though it were a rule.
   */
  it('a member sees fellow members, each with the route that fits their state', async () => {
    const out = await searchRoster('501', 'Axel');
    expect(out.found).toBe(true);
    if (out.found) {
      // Never themselves, and everybody else is here whatever the order.
      expect(out.results.map((r) => r.name).sort()).toEqual(
        ['Jaba Kikvidze', 'Lika Ose', null].sort(),
      );
      const jaba = out.results.find((r) => r.name === 'Jaba Kikvidze');
      expect(jaba?.account_state).toBe('ally_account');
      expect(jaba?.route).toBe('invite_contact');
      const lika = out.results.find((r) => r.name === 'Lika Ose');
      expect(lika?.is_member).toBe(true);
      expect(lika?.route).toBe('ask_contact');
    }
  });

  it('puts the reachable people first, because the cap falls on the tail', async () => {
    const out = await searchRoster('501', 'Axel');
    expect(out.found).toBe(true);
    if (out.found) {
      expect(out.results[0]?.is_member).toBe(true);
    }
  });

  it('a non-member is told the door is closed, and gets no list', async () => {
    const out = await searchRoster('777', 'Axel');
    expect(out).toMatchObject({ found: false, reason: 'not_on_roster' });
  });

  it('an empty group name is refused before any read', async () => {
    const out = await searchRoster('501', '  ');
    expect(out).toMatchObject({ found: false, reason: 'no_group' });
    expect(mockQuery).not.toHaveBeenCalled();
  });
});

// Ticket 12 Task 10: one person on or off the roster, by phone, in the shape
// of the 84 rows already there.
describe('addRosterMember / removeRosterMember', () => {
  it('writes a public, matchable member_of row once, and reports the repeat as unchanged', async () => {
    mockQuery
      .mockResolvedValueOnce(rows([]) as never)
      .mockResolvedValueOnce(rows([{ id: 7001 }]) as never);

    const first = await addRosterMember('Axel', '+995 599 93 41 75', '501');

    expect(first).toEqual({ changed: true, phone: '+995599934175', group: 'Axel', fact_id: 7001 });
    const [sql, params] = mockQuery.mock.calls[1] as [string, unknown[]];
    expect(sql).toContain('INSERT INTO contact_facts');
    expect(sql).toContain('true, true');
    expect(params).toEqual(['+995599934175', '501', 'Axel', 'sweep', 'stated', 'member_of']);

    mockQuery.mockReset();
    mockQuery.mockResolvedValueOnce(rows([{ id: 7001 }]) as never);
    expect(await addRosterMember('Axel', '+995599934175', '501')).toEqual({
      changed: false,
      phone: '+995599934175',
      group: 'Axel',
      fact_id: 7001,
    });
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  it('refuses an empty group or an unusable phone without touching the DB', async () => {
    mockQuery.mockReset();
    expect((await addRosterMember('  ', '+995599934175', '501')).changed).toBe(false);
    expect((await addRosterMember('Axel', 'abc', '501')).changed).toBe(false);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('removal is a soft retract and says when there was nothing to remove', async () => {
    mockQuery.mockReset();
    mockQuery.mockResolvedValueOnce(rows([{ id: 7001 }]) as never);
    expect(await removeRosterMember('Axel', '+995599934175')).toEqual({
      changed: true,
      phone: '+995599934175',
      group: 'Axel',
      fact_id: 7001,
    });
    expect(mockQuery.mock.calls[0][0] as string).toContain('retracted_at = NOW()');

    mockQuery.mockResolvedValueOnce(rows([]) as never);
    expect((await removeRosterMember('Axel', '+995599000099')).changed).toBe(false);
  });
});

// Ticket 13 B3 (4): a FORMER member is flagged, never a member for reach.
describe('addRosterMember — former member', () => {
  it('writes an affiliation fact, not member_of', async () => {
    mockQuery.mockReset();
    mockQuery
      .mockResolvedValueOnce(rows([]) as never)
      .mockResolvedValueOnce(rows([{ id: 7002 }]) as never);

    const out = await addRosterMember('Axel', '+995599000155', '167250', { former: true });

    expect(out.changed).toBe(true);
    const [lookupSql, lookupParams] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(lookupSql).toContain('field_type = $3');
    expect(lookupParams).toEqual(['+995599000155', 'Axel (former member)', 'affiliation']);
    const [, insertParams] = mockQuery.mock.calls[1] as [string, unknown[]];
    expect(insertParams).toEqual([
      '+995599000155',
      '167250',
      'Axel (former member)',
      'sweep',
      'stated',
      'affiliation',
    ]);
  });
});
