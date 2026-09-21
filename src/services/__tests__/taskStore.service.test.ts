jest.mock('../../db/postgres/client', () => ({ query: jest.fn(), __esModule: true }));
jest.mock('../stoppedRuns', () => ({ __esModule: true, markThreadStopped: jest.fn() }));

import { query } from '../../db/postgres/client';
import { markThreadStopped } from '../stoppedRuns';
import {
  createTask,
  getMyTasks,
  updateTask,
  grantTaskPermission,
  threadAwaitsOwner,
  ensureNextWake,
  getGoalsSilentForDays,
  markMethodChangeWoken,
} from '../taskStore.service';

const mockQuery = query as jest.MockedFunction<typeof query>;
const mockStopped = markThreadStopped as jest.MockedFunction<typeof markThreadStopped>;

function result(rows: unknown[], rowCount = rows.length): { rows: unknown[]; rowCount: number } {
  return { rows, rowCount };
}

const USER = '501';

beforeEach(() => jest.clearAllMocks());

describe('taskStore.service', () => {
  it('createTask inserts and returns the new id', async () => {
    mockQuery.mockResolvedValue(result([{ id: 7 }]) as never);

    const out = await createTask(USER, 'find a lawyer', 'for my startup', 'solve');

    expect(out).toEqual({ id: 7 });
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql as string).toContain('INSERT INTO tasks');
    // thread binding null (no thread given) + default ask_first autonomy.
    expect(params as unknown[]).toEqual([
      USER,
      'find a lawyer',
      'for my startup',
      'solve',
      null,
      'ask_first',
    ]);
  });

  it('getMyTasks scopes to the user and passes the optional status filter', async () => {
    mockQuery.mockResolvedValue(result([]) as never);

    await getMyTasks(USER, 'open');

    const params = mockQuery.mock.calls[0][1] as unknown[];
    expect(params[0]).toBe(USER);
    expect(params[1]).toBe('open');
  });

  it('getMyTasks passes null status when none given', async () => {
    mockQuery.mockResolvedValue(result([]) as never);

    await getMyTasks(USER);

    expect((mockQuery.mock.calls[0][1] as unknown[])[1]).toBeNull();
  });

  it("updateTask reports false when no row matched (not the user's task)", async () => {
    mockQuery.mockResolvedValue(result([], 0) as never);

    const ok = await updateTask(USER, 999, 'closed', 'done');

    expect(ok).toBe(false);
  });

  it('updateTask reports true when a row was updated', async () => {
    mockQuery.mockResolvedValue(result([], 1) as never);

    expect(await updateTask(USER, 7, 'paused')).toBe(true);
  });

  /**
   * Row 207 — „you cannot tell, looking at your own list, which goals were
   * really solved."
   *
   * Measured 21 September, whole base: 188 closed goals record NOTHING,
   * 79 read „stopped", 2 read „finished". The column that answers „how many of
   * my goals actually worked" was two-thirds silence, and it was still filling
   * up with silence — 35 of 48 closes on 18 September carried no value.
   *
   * Three callers pass one. The two that do not are both the generic
   * `update_task`, where the owner asked to close and claimed no completion.
   * That IS „stopped", so the write says so rather than storing nothing.
   */
  it('a close that names nothing is stored as stopped, never as silence', async () => {
    mockQuery.mockResolvedValue(result([], 1) as never);

    await updateTask(USER, 7, 'closed', 'user asked');

    const [sql] = mockQuery.mock.calls[0];
    expect(sql).toContain("COALESCE($5::text, 'stopped')");
  });

  it('still records a completion as a completion', async () => {
    mockQuery.mockResolvedValue(result([], 1) as never);

    await updateTask(USER, 7, 'closed', 'solved it', 'finished');

    expect((mockQuery.mock.calls[0][1] as unknown[])[4]).toBe('finished');
  });

  /**
   * And a pause or a reopen must not acquire one. `closed_as` is only written
   * when the status IS 'closed'; the CASE around it is what keeps a reopened
   * goal from carrying a closing verdict it no longer has.
   */
  it('leaves closed_as alone when the goal is not being closed', async () => {
    mockQuery.mockResolvedValue(result([], 1) as never);

    await updateTask(USER, 7, 'paused');

    expect(mockQuery.mock.calls[0][0]).toContain("WHEN $3 = 'closed'");
    expect(mockQuery.mock.calls[0][0]).toContain('ELSE closed_as END');
  });

  it('grantTaskPermission scopes to the owner and reports success', async () => {
    mockQuery.mockResolvedValue(result([], 1) as never);

    const ok = await grantTaskPermission(USER, 7);

    expect(ok).toBe(true);
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql as string).toContain('permission_granted = true');
    expect(params as unknown[]).toEqual([7, USER]);
  });
});

describe('createTask retitles a thread left on a closed goal name (ticket 9 task 31.8)', () => {
  it('replaces the title only when it is a closed goal of this thread', async () => {
    mockQuery.mockResolvedValue({ rows: [{ id: 77 }], rowCount: 1 } as never);

    await createTask('501', 'ძაღლის ტრენერის პოვნა', null, 'search', 9010);

    const retitle = mockQuery.mock.calls.find(([sql]) =>
      String(sql).includes('UPDATE threads'),
    ) as [string, unknown[]];
    expect(retitle[0]).toContain("old.status <> 'open'");
    expect(retitle[0]).toContain('old.title = t.title');
    expect(retitle[1]).toEqual([9010, 'ძაღლის ტრენერის პოვნა']);
  });

  it('does not touch any thread when the goal is not bound to one', async () => {
    mockQuery.mockResolvedValue({ rows: [{ id: 78 }], rowCount: 1 } as never);

    await createTask('501', 'a goal with no thread', null, 'search');

    expect(mockQuery.mock.calls.some(([sql]) => String(sql).includes('UPDATE threads'))).toBe(
      false,
    );
  });

  it('caps the new title the same way the rename route does', async () => {
    mockQuery.mockResolvedValue({ rows: [{ id: 79 }], rowCount: 1 } as never);

    await createTask('501', 'x'.repeat(200), null, 'search', 9010);

    const retitle = mockQuery.mock.calls.find(([sql]) =>
      String(sql).includes('UPDATE threads'),
    ) as [string, unknown[]];
    expect((retitle[1][1] as string).length).toBe(80);
  });
});

describe('a thread carries its goal from the moment the goal exists (ticket 9 task 20 e)', () => {
  it('flips is_task on the goal thread at creation, not at finish_task', async () => {
    mockQuery.mockResolvedValue({ rows: [{ id: 80 }], rowCount: 1 } as never);

    await createTask('501', 'ძაღლის ტრენერის პოვნა', null, 'search', 9010);

    const flag = mockQuery.mock.calls.find(([sql]) =>
      String(sql).includes('SET is_task = TRUE'),
    ) as [string, unknown[]];
    expect(flag[0]).toContain('is_task = FALSE');
    expect(flag[1]).toEqual([9010]);
  });

  it('does not touch any thread for a goal with no thread', async () => {
    mockQuery.mockResolvedValue({ rows: [{ id: 81 }], rowCount: 1 } as never);

    await createTask('501', 'a goal with no thread', null, 'search');

    expect(mockQuery.mock.calls.some(([sql]) => String(sql).includes('SET is_task = TRUE'))).toBe(
      false,
    );
  });
});

describe('threadAwaitsOwner — a badge asks the thread, not the run (ticket 9 task 20 b)', () => {
  it('is true while an open goal on the thread holds a question', async () => {
    mockQuery.mockResolvedValue(result([{ id: 1519 }]) as never);

    expect(await threadAwaitsOwner(9406)).toBe(true);
    const [sql, params] = mockQuery.mock.calls[0];
    // The engine's fallback flag carries the wait with NO question text, and a
    // goal waiting on an unnamed question is still waiting — so the timestamp
    // is the test, not the text.
    expect(sql as string).toContain('pending_question_at IS NOT NULL');
    expect(sql as string).toContain(`status = 'open'`);
    expect(params as unknown[]).toEqual([9406]);
  });

  it('ignores a question left on a goal that is no longer open', async () => {
    mockQuery.mockResolvedValue(result([]) as never);

    expect(await threadAwaitsOwner(9010)).toBe(false);
  });
});

// The standard in code (Ticket 10 Tasks 10 and 24): an open goal is never
// parked, and three silent days change the method.
describe('never parked, and the method changes after three silent days', () => {
  it('ensureNextWake sets the default only where the run left no wake', async () => {
    mockQuery.mockResolvedValue(result([], 1) as never);

    expect(await ensureNextWake(1519, 24)).toBe(true);
    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("status = 'open' AND next_wake_at IS NULL");
    expect(params).toEqual([1519, 24]);

    mockQuery.mockResolvedValue(result([], 0) as never);
    expect(await ensureNextWake(1519, 24)).toBe(false);
  });

  it('getGoalsSilentForDays asks for planned goals with a 3-day-old ask, nothing newer, and no proposal waiting', async () => {
    mockQuery.mockResolvedValue(result([]) as never);

    await getGoalsSilentForDays(72, 5);

    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('t.plan IS NOT NULL AND t.plan_proposed IS NULL');
    expect(sql).toContain("a.status = 'sent'");
    expect(sql).toContain('a.answered_at >=');
    expect(sql).toContain('method_change_woken_at');
    expect(params).toEqual([72, 5]);
  });

  it('markMethodChangeWoken stamps the goal', async () => {
    mockQuery.mockResolvedValue(result([], 1) as never);

    await markMethodChangeWoken(1519);

    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('SET method_change_woken_at = NOW()');
    expect(params).toEqual([1519]);
  });
});

/**
 * Ticket 20 row 113, fifth pass — the TYPED stop must abort the run too.
 *
 * b6cc2b6 made the BUTTON stop the work. The typed line takes another route
 * entirely: the model closes the goal itself, from inside the run, and the run
 * carried on. Read on goal 4555 / thread 16699:
 *
 *   13:48:49  the owner typed stop; 4555 closed at 13:48:55
 *   13:50:02  the same run called create_task and opened goal 4588
 *   13:50:23  and posted 4588's plan
 *
 * Every close in this codebase lands in updateTask, which makes it the one
 * place the two stop paths cannot drift apart.
 */
describe('updateTask marks the thread stopped — but only for a stop', () => {
  it('marks it when the goal was STOPPED', async () => {
    mockQuery.mockResolvedValue(result([{ thread_id: 16699 }]) as never);

    await updateTask(USER, 4555, 'closed', 'the owner said stop', 'stopped');

    expect(mockStopped).toHaveBeenCalledWith(16699);
  });

  it('does NOT mark it when the goal FINISHED', async () => {
    // A finished goal is a run delivering its result. Marking that would throw
    // away the answer the owner has been waiting ninety seconds for.
    mockQuery.mockResolvedValue(result([{ thread_id: 16699 }]) as never);

    await updateTask(USER, 4555, 'closed', 'result delivered', 'finished');

    expect(mockStopped).not.toHaveBeenCalled();
  });

  it('does not mark it on a pause or any other status', async () => {
    mockQuery.mockResolvedValue(result([{ thread_id: 16699 }]) as never);

    await updateTask(USER, 4555, 'paused');

    expect(mockStopped).not.toHaveBeenCalled();
  });

  it('marks nothing when no row was updated — somebody else\u2019s goal', async () => {
    mockQuery.mockResolvedValue(result([], 0) as never);

    expect(await updateTask(USER, 4555, 'closed', 'stop', 'stopped')).toBe(false);
    expect(mockStopped).not.toHaveBeenCalled();
  });
});

/**
 * Ticket 20 row 113, 17 September — a close used to erase the wake.
 *
 * The tester repaired the two goals tonight's P0 closed and found it: „both
 * came back with next_wake_at empty — so a reopened goal sits there for ever
 * unless somebody remembers to set the wake again." They only knew the old
 * times because they had read them an hour earlier.
 *
 * The clearing defended nothing. Ticket 11 Task 7 (e) was a REPORTING
 * complaint, and every reader of the column filters on status = 'open'
 * already, so a wake on a closed goal has never woken anything.
 */
describe('closing a goal keeps its wake', () => {
  it('does not write NULL over next_wake_at', async () => {
    mockQuery.mockResolvedValue(result([{ thread_id: 16842 }]) as never);

    await updateTask(USER, 3433, 'closed', 'stopped', 'stopped');

    const sql = String(mockQuery.mock.calls[0][0]);
    expect(sql).toContain('next_wake_at = next_wake_at');
    expect(sql).not.toMatch(/next_wake_at = CASE[^,]*NULL/);
  });

  it('still clears the question, which a closed goal genuinely has no use for', async () => {
    mockQuery.mockResolvedValue(result([{ thread_id: 16842 }]) as never);

    await updateTask(USER, 3433, 'closed', 'stopped', 'stopped');

    expect(String(mockQuery.mock.calls[0][0])).toContain('pending_question = CASE');
  });
});
