jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));

import { query } from '../../db/postgres/client';
import { getTaskById, setTaskBrief, setTaskWake, grantTaskPermission } from '../taskStore.service';

const mockQuery = query as jest.MockedFunction<typeof query>;

/**
 * A GOAL ID THAT IS NOT A NUMBER ENDED THE PERSON'S RUN.
 *
 * Every task id a model supplies arrives as `Number(input['task_id'])`, and
 * `Number(undefined)` is `NaN`. Measured, not assumed: `pg`'s own
 * `prepareValue(NaN)` returns the STRING „NaN", so Postgres raises
 *
 *     invalid input syntax for type integer: "NaN"
 *
 * — a throw. And nothing catches a tool that throws: `processToolBlocks` runs
 * the turn's calls in a bare `Promise.all` with no `catch` anywhere between it
 * and `executeToolCall`. So a model that forgets `task_id` does not get told to
 * pass one; the whole run dies with a database error and the person sees a
 * failure instead of an answer.
 *
 * `chat.service.ts` guards ONE of its ten task-id doors —
 * `Number.isFinite(taskId) ? await getTaskById(taskId) : null` — which is how
 * this was found: the rule was known at one site and missing at the other nine.
 * Rather than repeat it nine times, it lives where every door meets, and the
 * answers are the ones these functions already give for an id matching nothing.
 *
 * This is the third time today the same thing was true: the correct pattern
 * already in the repo, in one place, and absent everywhere else.
 */
const NOT_AN_ID = [Number(undefined), Number('x'), 0, -1, 1.5, Infinity];

const OWNER = '501';
const A_REAL_ID = 9109;

beforeEach(() => {
  jest.clearAllMocks();
  mockQuery.mockResolvedValue({ rows: [], rowCount: 0 } as never);
});

describe('a goal id that is not a goal id never reaches the database', () => {
  it.each(NOT_AN_ID)('getTaskById answers null — %p', async (id) => {
    expect(await getTaskById(id)).toBeNull();
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it.each(NOT_AN_ID)('setTaskBrief answers false — %p', async (id) => {
    expect(await setTaskBrief(OWNER, id, 'ვეძებ ვეტერინარს')).toBe(false);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it.each(NOT_AN_ID)('setTaskWake answers false — %p', async (id) => {
    expect(await setTaskWake(OWNER, id, 24)).toBe(false);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  /**
   * The consent write, and the one where a throw would be worst: it is called
   * in the same breath as an approval.
   */
  it.each(NOT_AN_ID)('grantTaskPermission answers false — %p', async (id) => {
    expect(await grantTaskPermission(OWNER, id)).toBe(false);
    expect(mockQuery).not.toHaveBeenCalled();
  });
});

/**
 * And a real id still goes through. Without these the block above would pass
 * on four functions that refused everything — the same doors broken from the
 * other side.
 */
describe('a real goal id is not turned away', () => {
  it('getTaskById asks the database', async () => {
    mockQuery.mockResolvedValue({ rows: [{ id: A_REAL_ID }], rowCount: 1 } as never);

    expect(await getTaskById(A_REAL_ID)).not.toBeNull();
    expect(mockQuery.mock.calls[0][1]).toEqual([A_REAL_ID]);
  });

  it('setTaskBrief asks the database', async () => {
    mockQuery.mockResolvedValue({ rows: [], rowCount: 1 } as never);

    expect(await setTaskBrief(OWNER, A_REAL_ID, 'ვეძებ ვეტერინარს')).toBe(true);
  });

  it('setTaskWake asks the database', async () => {
    mockQuery.mockResolvedValue({ rows: [], rowCount: 1 } as never);

    expect(await setTaskWake(OWNER, A_REAL_ID, 24)).toBe(true);
  });

  it('grantTaskPermission asks the database', async () => {
    mockQuery.mockResolvedValue({ rows: [], rowCount: 1 } as never);

    expect(await grantTaskPermission(OWNER, A_REAL_ID)).toBe(true);
  });
});
