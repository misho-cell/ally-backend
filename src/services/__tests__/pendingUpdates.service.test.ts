jest.mock('../../db/postgres/client', () => ({ query: jest.fn(), __esModule: true }));

import { query } from '../../db/postgres/client';
import { queueResult, getPendingUpdates, countHeldUpdates } from '../pendingUpdates.service';

const mockQuery = query as jest.MockedFunction<typeof query>;

function result(rows: unknown[]): { rows: unknown[]; rowCount: number } {
  return { rows, rowCount: rows.length };
}

const USER = '501';

beforeEach(() => jest.clearAllMocks());

describe('pendingUpdates.service', () => {
  it('queueResult inserts with a drip-staggered release_at', async () => {
    mockQuery.mockResolvedValue(result([{ id: 11 }]) as never);

    const out = await queueResult(USER, 7, 'found', { summary: 'Nino, a lawyer' });

    expect(out).toEqual({ id: 11 });
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql as string).toContain('INSERT INTO pending_updates');
    // Release time is derived from how many are already held (the drip schedule).
    expect(sql as string).toContain("INTERVAL '1 day'");
    expect(params as unknown[]).toEqual([
      USER,
      7,
      'found',
      JSON.stringify({ summary: 'Nino, a lawyer' }),
      3,
    ]);
  });

  it('getPendingUpdates returns due items and flips them to seen', async () => {
    mockQuery.mockResolvedValue(
      result([{ id: 11, task_id: 7, kind: 'found', payload: { summary: 'Nino' } }]) as never,
    );

    const updates = await getPendingUpdates(USER);

    expect(updates).toHaveLength(1);
    expect(updates[0].kind).toBe('found');
    const sql = mockQuery.mock.calls[0][0] as string;
    expect(sql).toContain("SET status = 'seen'");
    expect(sql).toContain('release_at <= NOW()');
    // A closed goal's queued results must never release.
    expect(sql).toContain("t.status <> 'closed'");
  });

  it('countHeldUpdates excludes closed-goal updates and returns the number waiting', async () => {
    mockQuery.mockResolvedValue(result([{ count: '4' }]) as never);

    expect(await countHeldUpdates(USER)).toBe(4);
    expect(mockQuery.mock.calls[0][0] as string).toContain("t.status <> 'closed'");
  });
});
