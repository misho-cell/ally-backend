jest.mock('../../db/postgres/client', () => ({ query: jest.fn(), __esModule: true }));

import { query } from '../../db/postgres/client';
import { filterRoster, isOnRoster, rosterMembers, sharedRoster } from '../roster.service';
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
