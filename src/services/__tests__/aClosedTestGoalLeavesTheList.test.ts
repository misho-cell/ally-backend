jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));

import { readFileSync } from 'fs';
import { join } from 'path';
import { query } from '../../db/postgres/client';
import { hideGoal, hideGoals, unhideGoal } from '../taskStore.service';

const mockQuery = query as jest.MockedFunction<typeof query>;

function rows(data: unknown[], rowCount = data.length): { rows: unknown[]; rowCount: number } {
  return { rows: data, rowCount };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockQuery.mockResolvedValue(rows([]) as never);
});

/**
 * ROW 258 (D466) — A CLOSED TEST GOAL LEAVES ITS OWNER'S LIST, AND NOTHING
 * ELSE ABOUT IT CHANGES.
 *
 * The founder was choosing between two things. D450 said stop-and-remove,
 * which would have sent „no longer needed" to three real people who had
 * already been asked — the seat's own list named them: goals 5678, 5281 and
 * 5809, one, two and three asks out. He was shown that and the read-only
 * alternative, and he answered: hide.
 *
 * So D450's „remove" is withdrawn and D245 stands — a goal is never deleted,
 * only closed. This is a third thing: not deleted, not closed, not stopped.
 * Just not listed to the one person whose list it clutters.
 */
describe('hiding is a list somebody wrote, not a rule about what looks like a test', () => {
  const store = readFileSync(join(__dirname, '..', 'taskStore.service.ts'), 'utf8');

  /**
   * 261 of account 501's goals are closed and I have read a fraction of them.
   * A rule applied by me to rows nobody has looked at is exactly the shape
   * that produces one hidden goal somebody wanted.
   */
  it('infers nothing — the list is the only source', () => {
    const at = store.indexOf('export async function hideGoals');
    const fn = store.slice(at, at + 2000);

    expect(fn).toContain('INSERT INTO hidden_goals');
    for (const guess of ['LIKE', 'ILIKE', 'title ~', 'createdAt <']) {
      expect(fn).not.toContain(guess);
    }
  });

  it('needs a reason, because a hidden row with no reason is a mistake later', async () => {
    await expect(hideGoal(1, 'admin:1', '  ')).rejects.toThrow(/reason/);
  });
});

/**
 * THE OPEN-GOAL COUNT MUST NOT MOVE — the seat's own done-when, made
 * impossible to fail rather than merely tested.
 */
describe('an open goal cannot be hidden at all', () => {
  it('refuses one, and says which refusal it is', async () => {
    mockQuery.mockResolvedValueOnce(rows([{ id: 7, status: 'open' }]) as never);

    expect(await hideGoal(7, 'admin:1', 'row 258')).toBe('refused_open');
    // And nothing was written.
    expect(
      mockQuery.mock.calls.some(([sql]) => (sql as string).includes('INSERT INTO hidden_goals')),
    ).toBe(false);
  });

  it('tells a missing goal apart from an open one', async () => {
    mockQuery.mockResolvedValueOnce(rows([]) as never);

    expect(await hideGoal(7, 'admin:1', 'row 258')).toBe('no_such_goal');
  });

  it('hides a closed one', async () => {
    mockQuery.mockResolvedValueOnce(rows([{ id: 7, status: 'closed' }]) as never);
    mockQuery.mockResolvedValueOnce(rows([{ task_id: 7 }]) as never);

    expect(await hideGoal(7, 'admin:1', 'row 258')).toBe('hidden');
  });

  /** Hiding twice is not an error; it is the same answer arriving again. */
  it('says so when it was already hidden', async () => {
    mockQuery.mockResolvedValueOnce(rows([{ id: 7, status: 'closed' }]) as never);
    mockQuery.mockResolvedValueOnce(rows([]) as never);

    expect(await hideGoal(7, 'admin:1', 'row 258')).toBe('already_hidden');
  });

  /**
   * TWO QUERIES FOR ANY NUMBER OF IDS, AND THIS TEST EXISTS BECAUSE THE FIRST
   * VERSION DID NOT.
   *
   * It looped, two round trips per goal. Pointed at the real list of 221 it
   * made 442 of them, the gateway cut the connection at 127, and the caller
   * got no answer at all about what had happened. Recoverable only because the
   * insert is ON CONFLICT DO NOTHING and the table could be read afterwards.
   */
  it('asks the database twice however long the list is', async () => {
    mockQuery.mockResolvedValueOnce(
      rows([
        { id: 1, status: 'closed' },
        { id: 2, status: 'closed' },
        { id: 3, status: 'open' },
        // 4 is missing entirely.
      ]) as never,
    );
    mockQuery.mockResolvedValueOnce(rows([{ task_id: 1 }]) as never);

    const out = await hideGoals([1, 2, 3, 4], 'admin:1', 'row 258');

    expect(mockQuery).toHaveBeenCalledTimes(2);
    expect(out.get(1)).toBe('hidden');
    expect(out.get(2)).toBe('already_hidden');
    expect(out.get(3)).toBe('refused_open');
    expect(out.get(4)).toBe('no_such_goal');
  });
});

describe('the list and the count agree', () => {
  const store = readFileSync(join(__dirname, '..', 'taskStore.service.ts'), 'utf8');

  /**
   * A count that includes what the list leaves out is the `due`/`held`
   * disagreement one file over: two numbers about one thing, and the reader
   * believes the one that is wrong.
   */
  it.each([
    ['the listing', 'getMyTasks'],
    ['the count beside it', 'getMyTasksPage'],
  ])('%s skips a hidden goal', (_name, fn) => {
    const at = store.indexOf(`export async function ${fn}`);
    expect(store.slice(at, at + 2200)).toContain(
      'NOT EXISTS (SELECT 1 FROM hidden_goals h WHERE h.task_id = t.id)',
    );
  });

  /**
   * AND NOTHING ELSE SKIPS IT. „It must not change what any other account
   * sees" is the founder's own condition. A hidden goal is still readable by
   * id, still carries its asks, still is whatever it is to a relay or an
   * answer — so `getTaskById` and `getGoalOnThread` must not learn about this
   * table.
   */
  it.each([['getTaskById'], ['getGoalOnThread'], ['getOpenTaskByThread']])(
    '%s does not know the table exists',
    (fn) => {
      const at = store.indexOf(`export async function ${fn}`);
      expect(store.slice(at, at + 600)).not.toContain('hidden_goals');
    },
  );
});

describe('the undo', () => {
  it('is a plain delete — the goal returns to the list unchanged', async () => {
    mockQuery.mockResolvedValue(rows([], 1) as never);

    expect(await unhideGoal(7)).toBe(true);
    const [sql] = mockQuery.mock.calls[0] as [string];
    expect(sql).toContain('DELETE FROM hidden_goals WHERE task_id = $1');
    // Not an update of the goal: the goal itself is never touched by any of this.
    expect(sql).not.toContain('UPDATE tasks');
  });
});
