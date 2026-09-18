jest.mock('../../db/postgres/client', () => ({ query: jest.fn(), __esModule: true }));

import { query } from '../../db/postgres/client';
import { getThreadsForUser, getThread } from '../threads.service';

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
    /**
     * By id, never by the predicate — the 51st goal is in neither list.
     *
     * Asserted on the WHERE CLAUSE specifically, and that precision is not
     * pedantry. The open-goal test also appears in the SELECT now, inside the
     * CASE that stops a live goal reading „finished", where it filters nothing
     * — and a substring check over the whole statement could no longer tell
     * the two apart. What must never come back is the FILTER.
     */
    // Anchored on „WHERE t.user_id", not on the first „WHERE" in the text:
    // the CASE above it carries an EXISTS with a WHERE of its own, and slicing
    // from that one reads the SELECT list and calls it the filter.
    const whereClause = pageSql.slice(
      pageSql.indexOf('WHERE t.user_id'),
      pageSql.indexOf('ORDER BY'),
    );
    expect(whereClause).not.toContain("k.status = 'open'");
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

/**
 * A thread whose goal is open must never be SHOWN as finished.
 *
 * The seat's read of 3fdcfe9: goal 3763 — the founder's real volleyball goal,
 * status open, stage running, next wake 18 September — sat under „finished" in
 * his sidebar, and its chat header said the same. The goal was fine; the
 * screen was reading the thread's own row, which is written at the end of a
 * run.
 *
 * The writer was fixed the same night, and that is forward-only: 3763's last
 * run ended before the fix and it will not run again until its wake. So both
 * READERS derive it instead, which needs no write across live data and fixes
 * every existing thread at once.
 *
 * These assertions are about the SQL because that is where the rule lives.
 * Two readers that drift apart is the shape of this exact bug — one screen
 * corrected and the other not — and it is what the test is for.
 */
describe('neither reader shows a live goal as finished', () => {
  const REFUSES_FINISHED = /CASE\s+WHEN t\.status IN \('done', 'failed'\)/;

  it('the sidebar derives the status rather than trusting the row', async () => {
    firstPage([], [CONVERSATION], []);

    await getThreadsForUser('501');

    const pageSql = String(mockQuery.mock.calls[1][0]);
    expect(pageSql).toMatch(REFUSES_FINISHED);
    // And the caption goes with it: „შეფერხდა — სცადე თავიდან" under a
    // running goal would be the same lie in smaller type.
    expect(pageSql).toMatch(/THEN NULL\s+ELSE t\.status_line/);
  });

  it('the promoted-goals query uses the very same rule', async () => {
    firstPage([8614], [CONVERSATION], [GOAL_THREAD]);

    await getThreadsForUser('501');

    expect(String(mockQuery.mock.calls[2][0])).toMatch(REFUSES_FINISHED);
  });

  it('the chat header does too — it is the other screen that was wrong', async () => {
    mockQuery.mockResolvedValue(rows([{ id: 15874 }]) as never);

    await getThread(15874, '501');

    expect(String(mockQuery.mock.calls[0][0])).toMatch(REFUSES_FINISHED);
  });
});

/**
 * The mirror, and it is the bigger half — the seat's #4424.
 *
 * His sidebar at 00:43 against the admin, side by side. Under „ongoing", five
 * rows: 3433 open and correct, then 5051, 4822 and 4819 all CLOSED and stopped
 * by their owner, plus 16840 which never had a goal at all. The header above
 * the list said „working on your 2 goals", which was right. The list showed
 * five.
 */
describe('a thread whose goal is closed is finished', () => {
  const READS_FINISHED = /WHEN t\.status IN \('waiting', 'needs_you', 'failed'\)/;

  it('is derived in the sidebar', async () => {
    firstPage([], [CONVERSATION], []);

    await getThreadsForUser('501');

    expect(String(mockQuery.mock.calls[1][0])).toMatch(READS_FINISHED);
  });

  it('is derived in the chat header too', async () => {
    mockQuery.mockResolvedValue(rows([{ id: 16897 }]) as never);

    await getThread(16897, '501');

    expect(String(mockQuery.mock.calls[0][0])).toMatch(READS_FINISHED);
  });

  it('leaves a RUNNING thread alone, whatever its old goal did', async () => {
    // A run in flight is a run. Calling it finished would put the spinner back
    // in the state row 113 spent a day on, so 'working' is not in the list.
    firstPage([], [CONVERSATION], []);

    await getThreadsForUser('501');

    const sql = String(mockQuery.mock.calls[1][0]);
    const mirror = sql.slice(sql.indexOf("WHEN t.status IN ('waiting'"));
    expect(mirror.slice(0, mirror.indexOf('THEN'))).not.toContain("'working'");
  });

  it('requires a goal to have existed — a failure with none is still a failure', async () => {
    // 16840 is theirs: no goal ever, and a genuine run failure the owner may
    // want to retry. Hiding it would hide real breakage.
    firstPage([], [CONVERSATION], []);

    await getThreadsForUser('501');

    expect(String(mockQuery.mock.calls[1][0])).toContain(
      'EXISTS (SELECT 1 FROM tasks k WHERE k.thread_id = t.id)',
    );
  });
});
