jest.mock('../../db/postgres/client', () => ({
  poolPressure: () => ({ total: 0, idle: 0, waiting: 0 }),
  query: jest.fn(),
  backgroundQuery: jest.fn(),
  __esModule: true,
}));

import { backgroundQuery, query } from '../../db/postgres/client';
import { basePool, baseWalkStatus, walkBaseOnce } from '../basePool.service';

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
  it('never returns somebody who has opened Netai', async () => {
    mockQuery.mockResolvedValue(rows([{ phone: '+995500000001', label: 'Nino' }]) as never);

    const out = await basePool();

    expect(out).toEqual([{ phone: '+995500000001', label: 'Nino' }]);
    expect(mockQuery.mock.calls[0][0] as string).toContain('opened_netai = FALSE');
  });

  it('leaves an empty label empty rather than guessing one', async () => {
    mockQuery.mockResolvedValue(rows([{ phone: '+995500000002', label: null }]) as never);

    expect((await basePool())[0].label).toBe('');
  });

  it('offers the never-listed first, so the base cannot be one closed door', async () => {
    // Measured 15 Sep: ordering by phonebook size alone returned the same 300
    // people on every build, everybody above 2,453 contacts, while 8,407
    // human-sized candidates could never appear at all. Size is the tie-break
    // now, not the key.
    mockQuery.mockResolvedValue(rows([]) as never);

    await basePool();

    const sql = mockQuery.mock.calls[0][0] as string;
    expect(sql).toContain('target_score_history');
    expect(sql).toContain('ASC NULLS FIRST');
    // Size still decides between two people nobody has looked at.
    expect(sql).toContain('c.own_contacts DESC');
  });

  it('reports the last walk as real ISO 8601, which a phone can read', async () => {
    // Postgres's own text form — a space where the T belongs, six-digit
    // microseconds — is not something Safari parses, so a date that reads
    // correctly on a Mac is „Invalid Date" on an iPhone. The frontend hit this
    // and worked around it; the workaround is on their side, the defect was
    // on mine.
    mockQuery.mockResolvedValue(
      rows([
        {
          candidates: '10033',
          reachable: '10002',
          cursor: 7956,
          last_walk: new Date('2026-09-15T07:21:41.318Z'),
        },
      ]) as never,
    );

    const status = await baseWalkStatus();

    expect(status.last_walk).toBe('2026-09-15T07:21:41.318Z');
    expect(status.candidates).toBe(10033);
  });

  it('says the walk has never run rather than dating it', async () => {
    mockQuery.mockResolvedValue(
      rows([{ candidates: '0', reachable: '0', cursor: 0, last_walk: null }]) as never,
    );

    // Null is its own answer: nobody has walked yet, which is not the same as
    // walking and finding nobody.
    expect((await baseWalkStatus()).last_walk).toBeNull();
  });

  it('asks again, live, whether the person has since arrived', async () => {
    // The stored flag is a photograph taken the last time the walk passed this
    // account, and the walk crosses the base over days. Somebody who opens
    // Netai this morning would stay written down as „never opened" until it
    // comes round again — and in that window the engine would invite a Netai
    // USER to Netai. A member gets activated, never pitched.
    mockQuery.mockResolvedValue(rows([]) as never);

    await basePool();

    const sql = mockQuery.mock.calls[0][0] as string;
    expect(sql).toContain('NOT EXISTS (SELECT 1 FROM threads');
    expect(sql).toContain('NOT EXISTS (SELECT 1 FROM search_activity');
    expect(sql).toContain('subscription_status');
    // The flag is still there as the cheap indexed pre-filter, not as the
    // guarantee.
    expect(sql).toContain('opened_netai = FALSE');
  });
});
