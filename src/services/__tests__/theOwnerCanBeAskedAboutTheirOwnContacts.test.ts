jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn(), default: {} }));
jest.mock('../tools/membership', () => ({
  __esModule: true,
  fetchAccountStates: jest.fn(),
  isMemberPhone: (states: Map<string, string>, phone: string) => states.get(phone) === 'netai_user',
  accountStateFor: (states: Map<string, string>, phone: string) => states.get(phone) ?? 'none',
}));

import { query } from '../../db/postgres/client';
import { fetchAccountStates } from '../tools/membership';
import { listMyContacts } from '../tools/listMyContacts';

const mockQuery = query as jest.MockedFunction<typeof query>;
const mockStates = fetchAccountStates as jest.MockedFunction<typeof fetchAccountStates>;

function phonebook(rows: { phone: string; alias: string | null }[], total = rows.length): void {
  mockQuery.mockImplementation((sql: string) =>
    Promise.resolve(
      (String(sql).includes('COUNT(DISTINCT phone)')
        ? { rows: [{ total: String(total) }], rowCount: 1 }
        : { rows, rowCount: rows.length }) as never,
    ),
  );
}

/** The seat's 864 item 7: „ask all six of my contacts" — Netai could not list them. */
describe("the owner's own contacts can be listed", () => {
  beforeEach(() => jest.clearAllMocks());

  it('puts members first, since only a member can be asked', async () => {
    phonebook([
      { phone: '+1', alias: 'Zura' },
      { phone: '+2', alias: 'Ana' },
      { phone: '+3', alias: 'Nino' },
    ]);
    mockStates.mockResolvedValue(
      new Map([
        ['+1', 'netai_user'],
        ['+3', 'ally_account'],
      ]) as never,
    );
    const out = await listMyContacts('172836');
    expect(out.contacts.map((c) => c.name)).toEqual(['Zura', 'Ana', 'Nino']);
    expect(out.contacts[0].is_member).toBe(true);
    expect(out.members_total).toBe(1);
  });

  it('reports the true total beside the page shown', async () => {
    phonebook([{ phone: '+1', alias: 'A' }], 1174);
    mockStates.mockResolvedValue(new Map() as never);
    const out = await listMyContacts('1', { limit: 1 });
    expect(out.total).toBe(1174);
    expect(out.shown).toBe(1);
  });

  it('lists members only when asked, and caps the page at 100', async () => {
    phonebook(Array.from({ length: 150 }, (_, i) => ({ phone: `+${i}`, alias: `P${i}` })));
    mockStates.mockResolvedValue(
      new Map(Array.from({ length: 150 }, (_, i) => [`+${i}`, 'netai_user'])) as never,
    );
    expect((await listMyContacts('1', { limit: 500 })).shown).toBe(100);
    mockStates.mockResolvedValue(new Map([['+5', 'netai_user']]) as never);
    const members = await listMyContacts('1', { membersOnly: true });
    expect(members.contacts.map((c) => c.phone)).toEqual(['+5']);
  });

  it('says an emoji-only label as a label (row 283)', async () => {
    phonebook([{ phone: '+1', alias: '💙' }]);
    mockStates.mockResolvedValue(new Map() as never);
    const out = await listMyContacts('1');
    expect(out.contacts[0]).toMatchObject({ name: null, saved_as: '💙' });
  });

  it('reads only this owner, with parameters, a limit and a timeout', async () => {
    phonebook([]);
    mockStates.mockResolvedValue(new Map() as never);
    await listMyContacts('172836');
    for (const [sql, params, timeout] of mockQuery.mock.calls) {
      expect(String(sql)).toContain('"contactId" = $1');
      expect((params as unknown[])[0]).toBe('172836');
      expect(timeout).toBeGreaterThan(0);
    }
    expect(
      String(mockQuery.mock.calls.find(([q]) => String(q).includes('DISTINCT ON'))?.[0]),
    ).toContain('LIMIT $2');
  });
});
