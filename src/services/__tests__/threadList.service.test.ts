jest.mock('../../db/postgres/client', () => ({ query: jest.fn(), __esModule: true }));

import { query } from '../../db/postgres/client';
import { getThreadsForUser } from '../threads.service';

const mockQuery = query as jest.MockedFunction<typeof query>;

function rows(data: unknown[]): { rows: unknown[]; rowCount: number } {
  return { rows: data, rowCount: data.length };
}

const CONVERSATION = { id: 12000, title: 'ჩვეულებრივი საუბარი' };
const GOAL_THREAD = { id: 8614, title: 'ვეძებ ინვესტორს' };

/**
 * Three queries make a first page: the promoted goal ids, the conversations
 * page, then the goal rows themselves. A cursor page makes the first two.
 */
function firstPage(promotedIds: number[], page: unknown[], goals: unknown[]): void {
  mockQuery
    .mockResolvedValueOnce(rows(promotedIds.map((id) => ({ id: String(id) }))) as never)
    .mockResolvedValueOnce(rows(page) as never)
    .mockResolvedValueOnce(rows(goals) as never);
}

// resetAllMocks, not clearAllMocks: clear leaves the mockResolvedValueOnce
// queue in place, so a test that runs two queries instead of three hands its
// leftover value to the next test's first query.
beforeEach(() => jest.resetAllMocks());

describe('the sidebar puts open goals first (ticket 9 task 20 c)', () => {
  it('returns every open goal above the conversations page', async () => {
    firstPage([8614], [CONVERSATION], [GOAL_THREAD]);

    const out = await getThreadsForUser('501', { limit: 30 });

    expect(out.map((t) => t.id)).toEqual([8614, 12000]);
  });

  it('never lets a promoted goal into the conversations page — no row twice', async () => {
    firstPage([8614], [CONVERSATION], [GOAL_THREAD]);

    await getThreadsForUser('501', { limit: 30 });

    const [pageSql, pageParams] = mockQuery.mock.calls[1] as [string, unknown[]];
    expect(pageSql).toContain('NOT (t.id = ANY($5::bigint[]))');
    expect(pageParams[4]).toEqual([8614]);
  });

  it('asks for the goals regardless of age — no cursor, no date bound on them', async () => {
    firstPage([8614], [], [GOAL_THREAD]);

    await getThreadsForUser('501', { limit: 30 });

    const [goalSql, goalParams] = mockQuery.mock.calls[2] as [string, unknown[]];
    expect(goalSql).not.toContain('timestamptz');
    expect(goalParams).toEqual([[8614]]);
  });

  it('a cursor page carries no goal rows — the promoted ones were on page one', async () => {
    mockQuery
      .mockResolvedValueOnce(rows([{ id: '8614' }]) as never)
      .mockResolvedValueOnce(rows([CONVERSATION]) as never);

    const out = await getThreadsForUser('501', {
      limit: 30,
      beforeUpdatedAt: '2026-09-01T00:00:00.000Z',
      beforeId: 12345,
    });

    expect(out.map((t) => t.id)).toEqual([12000]);
    // Never a third query: page two must not re-fetch (and re-send) the goals.
    expect(mockQuery).toHaveBeenCalledTimes(2);
  });

  // The hole this shape closes: excluding "has an open goal" as a PREDICATE hid
  // the 51st goal on every page at once — page one had already cut the list at
  // the cap, and every later page filtered goals out again.
  it('excludes the promoted ids, so a goal past the cap still reaches a later page', async () => {
    const capped = Array.from({ length: 50 }, (_, i) => 9000 + i);
    firstPage(capped, [CONVERSATION], []);

    await getThreadsForUser('501', { limit: 30 });

    const [pageSql, pageParams] = mockQuery.mock.calls[1] as [string, unknown[]];
    // By id, never by the predicate — the 51st goal is in neither list.
    expect(pageSql).not.toContain("k.status = 'open'");
    expect(pageParams[4]).toEqual(capped);
    expect((pageParams[4] as number[]).includes(9050)).toBe(false);
  });

  it('promotes at most the ceiling, newest first', async () => {
    firstPage([], [], []);

    await getThreadsForUser('501', { limit: 30 });

    const [idSql, idParams] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(idSql).toContain("k.status = 'open'");
    expect(idSql).toContain('ORDER BY t.updated_at DESC, t.id DESC');
    expect(idParams).toEqual(['501', 50]);
  });

  it('skips the goal-rows query entirely when the user has no open goal', async () => {
    firstPage([], [CONVERSATION], []);

    const out = await getThreadsForUser('501', { limit: 30 });

    expect(out.map((t) => t.id)).toEqual([12000]);
    expect(mockQuery).toHaveBeenCalledTimes(2);
  });

  it('caps the page size at the server ceiling, whatever the client asks', async () => {
    mockQuery.mockResolvedValue(rows([]) as never);

    await getThreadsForUser('501', { limit: 5000 });

    expect((mockQuery.mock.calls[1][1] as unknown[])[3]).toBe(200);
  });
});
