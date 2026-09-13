jest.mock('../../db/postgres/client', () => ({
  query: jest.fn(),
  backgroundQuery: jest.fn(),
  __esModule: true,
}));

import { backgroundQuery, query } from '../../db/postgres/client';
import { basePool, walkBaseOnce } from '../basePool.service';

const mockBg = backgroundQuery as jest.MockedFunction<typeof backgroundQuery>;
const mockQuery = query as jest.MockedFunction<typeof query>;

function rows(data: unknown[]): { rows: unknown[]; rowCount: number } {
  return { rows: data, rowCount: data.length };
}

function account(id: number, ownContacts: number, over: Record<string, unknown> = {}) {
  return {
    id,
    phone: `+99550000${String(id).padStart(4, '0')}`,
    own_contacts: String(ownContacts),
    registered_at: '2024-01-01',
    opened: false,
    label: `User ${id}`,
    ...over,
  };
}

/** Route the walk's three statements: read cursor, read batch, write. */
function routeWalk(batch: unknown[], cursor = 0): void {
  mockBg.mockImplementation((sql: string) => {
    if (sql.includes('SELECT last_user_id')) {
      return Promise.resolve(rows([{ last_user_id: cursor }]) as never);
    }
    if (sql.includes('WITH batch AS')) return Promise.resolve(rows(batch) as never);
    return Promise.resolve(rows([]) as never);
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  delete process.env.BASE_POOL_MIN_CONTACTS;
});

/**
 * Ticket 19. The entry rule was "two Netai users have this number saved" —
 * our own phonebooks looking at themselves. These 62,000 accounts are ours
 * already; a person enters on what is true about THEM.
 */
describe('walking the base', () => {
  it('keeps an account on its own signals, with nobody carrying it', async () => {
    routeWalk([account(10, 900)]);

    const out = await walkBaseOnce();

    expect(out.examined).toBe(1);
    expect(out.written).toBe(1);
    // Nothing in the walk asks who holds this number — that is the whole point.
    const batchSql = mockBg.mock.calls.find(([sql]) =>
      (sql as string).includes('WITH batch AS'),
    )?.[0] as string;
    expect(batchSql).not.toContain('UserAlias a2');
    expect(batchSql).not.toContain('contactId" = ANY');
  });

  it("holds the founder's 200-contact floor (D214)", async () => {
    routeWalk([account(11, 199), account(12, 200)]);

    const out = await walkBaseOnce();

    expect(out.examined).toBe(2);
    expect(out.written).toBe(1);
  });

  it('skips an account with no phone rather than writing a row it cannot reach', async () => {
    routeWalk([account(13, 900, { phone: null })]);

    expect((await walkBaseOnce()).written).toBe(0);
  });

  it('resumes where it stopped, and wraps when the base ends', async () => {
    routeWalk([account(20, 900), account(21, 900)], 19);
    const out = await walkBaseOnce();
    expect(out.cursor).toBe(21);

    routeWalk([], 21);
    const end = await walkBaseOnce();
    expect(end.wrapped).toBe(true);
    expect(end.cursor).toBe(0);
  });

  it('never touches the pool a live search is waiting on', async () => {
    routeWalk([account(30, 900)]);

    await walkBaseOnce();

    // The 30 July outage was a heavy job saturating the shared pool.
    expect(mockQuery).not.toHaveBeenCalled();
    expect(mockBg).toHaveBeenCalled();
  });
});

describe('reading what the night measured', () => {
  it('returns the biggest phonebooks and never the ones that opened Netai', async () => {
    mockQuery.mockResolvedValue(rows([{ phone: '+995500000001', label: 'Nino' }]) as never);

    const out = await basePool();

    expect(out).toEqual([{ phone: '+995500000001', label: 'Nino' }]);
    const sql = mockQuery.mock.calls[0][0] as string;
    expect(sql).toContain('opened_netai = FALSE');
    expect(sql).toContain('ORDER BY c.own_contacts DESC');
  });

  it('leaves an empty label empty rather than guessing one', async () => {
    mockQuery.mockResolvedValue(rows([{ phone: '+995500000002', label: null }]) as never);

    expect((await basePool())[0].label).toBe('');
  });
});
