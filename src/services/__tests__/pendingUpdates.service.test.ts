jest.mock('../../db/postgres/client', () => ({ query: jest.fn(), __esModule: true }));

import { query } from '../../db/postgres/client';
import {
  queueResult,
  queueFollowUp,
  getPendingUpdates,
  countHeldUpdates,
} from '../pendingUpdates.service';

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

  it('queueFollowUp releases on a FIXED future date, not the drip schedule — ticket 6, the search-outcome week-later check-in', async () => {
    mockQuery.mockResolvedValue(result([{ id: 42 }]) as never);

    const out = await queueFollowUp('501', null, 'search_followup', { search_id: 9 }, 7);

    expect(out).toEqual({ id: 42 });
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql as string).toContain('INSERT INTO pending_updates');
    // Fixed delay from a parameter, never the held-count staggering queueResult uses.
    expect(sql as string).not.toContain('COUNT(*)');
    expect(sql as string).toContain("|| ' days')::INTERVAL");
    expect(params as unknown[]).toEqual([
      '501',
      null,
      'search_followup',
      JSON.stringify({ search_id: 9 }),
      7,
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
    // News is spent when read; a sticky kind is re-armed instead.
    expect(sql).toContain("ELSE 'seen'");
    expect(sql).toContain('release_at <= NOW()');
    // A closed goal's queued results must never release.
    expect(sql).toContain("t.status <> 'closed'");
  });

  // Ticket 9 task 20 (a). A goal's blocking question is a STATE, not news:
  // read live on 4 September, eleven open goals carried an unanswered question
  // and nearly all their updates were already 'seen' — goal 1156 blocked since
  // 31 August, its one update marked seen in the minute it was created.
  it('re-arms a goal question instead of spending it, while the goal still waits', async () => {
    mockQuery.mockResolvedValue(
      result([{ id: 12, task_id: 9, kind: 'goal_question', payload: {} }]) as never,
    );

    await getPendingUpdates(USER);

    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("THEN 'held'");
    expect(sql).toContain("NOW() + ($4 || ' hours')::INTERVAL");
    // And only while the goal is actually still blocked on somebody.
    expect(sql).toContain('t.pending_question_at IS NOT NULL');
    expect(params[2]).toEqual(['goal_question']);
    expect(params[3]).toBe(24);
  });

  it('countHeldUpdates excludes closed-goal updates and returns the number waiting', async () => {
    mockQuery.mockResolvedValue(result([{ count: '4' }]) as never);

    expect(await countHeldUpdates(USER)).toBe(4);
    expect(mockQuery.mock.calls[0][0] as string).toContain("t.status <> 'closed'");
  });
});
