jest.mock('../../db/postgres/client', () => ({ query: jest.fn(), __esModule: true }));

import { query } from '../../db/postgres/client';
import { getThreadsForUser } from '../threads.service';

const mockQuery = query as jest.MockedFunction<typeof query>;

function rows(data: unknown[]): { rows: unknown[]; rowCount: number } {
  return { rows: data, rowCount: data.length };
}

const CONVERSATION = { id: 12000, title: 'ჩვეულებრივი საუბარი' };
const GOAL_THREAD = { id: 8614, title: 'ვეძებ ინვესტორს' };

beforeEach(() => jest.clearAllMocks());

describe('the sidebar puts open goals first (ticket 9 task 20 c)', () => {
  it('returns every open goal above the conversations page', async () => {
    mockQuery
      .mockResolvedValueOnce(rows([CONVERSATION]) as never)
      .mockResolvedValueOnce(rows([GOAL_THREAD]) as never);

    const out = await getThreadsForUser('501', { limit: 30 });

    expect(out.map((t) => t.id)).toEqual([8614, 12000]);
  });

  it('never lets a goal thread into the conversations page — no row twice', async () => {
    mockQuery
      .mockResolvedValueOnce(rows([CONVERSATION]) as never)
      .mockResolvedValueOnce(rows([GOAL_THREAD]) as never);

    await getThreadsForUser('501', { limit: 30 });

    const [pageSql] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(pageSql).toContain('NOT EXISTS');
    expect(pageSql).toContain(`k.status = 'open'`);
  });

  it('asks for the goals regardless of age — no cursor, no date bound on them', async () => {
    mockQuery
      .mockResolvedValueOnce(rows([]) as never)
      .mockResolvedValueOnce(rows([GOAL_THREAD]) as never);

    await getThreadsForUser('501', { limit: 30 });

    const [goalSql, goalParams] = mockQuery.mock.calls[1] as [string, unknown[]];
    expect(goalSql).not.toContain('timestamptz');
    expect(goalParams).toEqual(['501', 50]);
  });

  it('a cursor page carries conversations only — the goals were all on page one', async () => {
    mockQuery.mockResolvedValueOnce(rows([CONVERSATION]) as never);

    const out = await getThreadsForUser('501', {
      limit: 30,
      beforeUpdatedAt: '2026-09-01T00:00:00.000Z',
      beforeId: 12345,
    });

    expect(out.map((t) => t.id)).toEqual([12000]);
    // One query, not two: page two must not re-fetch (and re-send) the goals.
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  it('caps the page size at the server ceiling, whatever the client asks', async () => {
    mockQuery.mockResolvedValue(rows([]) as never);

    await getThreadsForUser('501', { limit: 5000 });

    expect((mockQuery.mock.calls[0][1] as unknown[])[3]).toBe(200);
  });
});
