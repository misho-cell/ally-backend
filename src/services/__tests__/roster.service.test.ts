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
  { phone: '+995599000001', group: 'Axel', user_id: 501, name: 'Tornike Abuladze', on_netai: true },
  { phone: '+995599000002', group: 'Axel', user_id: 618, name: 'Jaba Kikvidze', on_netai: false },
  { phone: '+995599000003', group: 'Axel', user_id: 160584, name: 'Lika Ose', on_netai: true },
  { phone: '+995599000004', group: 'Axel', user_id: null, name: null, on_netai: null },
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

  it('filters by every word of a name', () => {
    const members = ROSTER.map((r) => ({ ...r, on_netai: r.on_netai === true }));
    expect(filterRoster(members, 'lika').map((m) => m.user_id)).toEqual([160584]);
    expect(filterRoster(members, 'lika abuladze')).toEqual([]);
    expect(filterRoster(members, '')).toHaveLength(4);
  });
});

describe('search_roster — the one search past the phonebook', () => {
  it('a member sees fellow members, each with the route that fits their state', async () => {
    const out = await searchRoster('501', 'Axel');
    expect(out.found).toBe(true);
    if (out.found) {
      // Never themselves.
      expect(out.results.map((r) => r.name)).toEqual(['Jaba Kikvidze', 'Lika Ose', null]);
      const jaba = out.results[0];
      expect(jaba?.account_state).toBe('ally_account');
      expect(jaba?.route).toBe('invite_contact');
      const lika = out.results[1];
      expect(lika?.is_member).toBe(true);
      expect(lika?.route).toBe('ask_contact');
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
