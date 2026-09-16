jest.mock('../../db/postgres/client', () => ({ query: jest.fn(), __esModule: true }));

import { query } from '../../db/postgres/client';
import {
  queueResult,
  queueFollowUp,
  getPendingUpdates,
  countHeldUpdates,
  listSeenUpdates,
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

  // Ticket 20 row 124. Thread 15676: one line — „ვინ არის ახლა თბილისის მერი?"
  // — answered at 11:59:11, then seven cards by 11:59:15, one per waiting goal.
  // All seven were goal_question. The overall cap of ten was doing its job and
  // was simply far too loose for a class that asks the owner to do work.
  describe('row 124 — a blocking question is capped on its own', () => {
    it('releases at most one blocking question per read, whatever the overall cap is', async () => {
      mockQuery.mockResolvedValue(result([]) as never);

      await getPendingUpdates(USER);

      const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
      // The two caps are separate numbers, and the question cap is the tight one.
      expect(params[1]).toBe(10);
      expect(params[4]).toBe(1);
      expect(sql).toContain('rank_in_class <= $5');
      expect(Number(params[4])).toBeLessThan(Number(params[1]));
    });

    it('ranks the two classes apart, so news is not crowded out by questions either', async () => {
      mockQuery.mockResolvedValue(result([]) as never);

      await getPendingUpdates(USER);

      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('PARTITION BY (p.kind = ANY($3::text[]))');
      // Read live on 16 September: one account had 6 items due, 5 of them news.
      // A cap that counted both classes together would have eaten four of them.
      expect(sql).toContain('WHERE NOT sticky OR rank_in_class <= $5');
    });

    it('the ones it skips are NOT spent — only the chosen rows are marked', async () => {
      // This is the whole reason the cap lives in the release query rather than
      // at delivery time. By the time rows reach the chat they are already
      // marked seen or re-armed; dropping one there loses it for a day or for
      // good. Here a skipped row keeps status 'held' and its past release_at,
      // so the very next read takes it.
      mockQuery.mockResolvedValue(result([]) as never);

      await getPendingUpdates(USER);

      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('WHERE pu.id IN (SELECT id FROM chosen)');
      expect(sql).not.toMatch(/UPDATE pending_updates pu[\s\S]*WHERE pu\.user_id = \$1\s*$/);
    });

    it('still takes the oldest first, so nothing waits behind a newer item forever', async () => {
      mockQuery.mockResolvedValue(result([]) as never);

      await getPendingUpdates(USER);

      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('ORDER BY p.release_at ASC, p.id ASC');
      expect(sql).toContain('ORDER BY release_at ASC, id ASC');
    });

    it('a single due question still comes through — the cap is one, not zero', async () => {
      mockQuery.mockResolvedValue(
        result([{ id: 12, task_id: 9, kind: 'goal_question', payload: { q: 'x' } }]) as never,
      );

      const updates = await getPendingUpdates(USER);

      expect(updates).toHaveLength(1);
      expect(updates[0].kind).toBe('goal_question');
    });
  });

  it('countHeldUpdates excludes closed-goal updates and returns the number waiting', async () => {
    mockQuery.mockResolvedValue(result([{ count: '4' }]) as never);

    expect(await countHeldUpdates(USER)).toBe(4);
    expect(mockQuery.mock.calls[0][0] as string).toContain("t.status <> 'closed'");
  });
});

// Ticket 12 Task 32: the rows already shown, on request — a read, not a release.
describe('listSeenUpdates', () => {
  it('reads seen rows of open goals newest first and changes nothing', async () => {
    mockQuery.mockResolvedValueOnce(
      result([{ id: 9, task_id: 1156, kind: 'goal_question', payload: { q: 'x' } }]),
    );

    const out = await listSeenUpdates(USER);

    expect(out).toEqual([{ id: 9, task_id: 1156, kind: 'goal_question', payload: { q: 'x' } }]);
    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql.trimStart().startsWith('SELECT')).toBe(true);
    expect(sql).toContain("p.status = 'seen'");
    // Ticket 13 Task 32: a shown row on a closed goal still counts — no goal filter.
    expect(sql).not.toContain("t.status <> 'closed'");
    expect(params).toEqual([USER, 50]);
  });

  it('clamps the limit to the ceiling', async () => {
    mockQuery.mockResolvedValueOnce(result([]));

    await listSeenUpdates(USER, 500);

    expect((mockQuery.mock.calls[0][1] as unknown[])[1]).toBe(50);
  });
});
