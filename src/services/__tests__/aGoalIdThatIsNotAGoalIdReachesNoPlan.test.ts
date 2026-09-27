jest.mock('../../db/postgres/client', () => ({ query: jest.fn(), __esModule: true }));

import { query } from '../../db/postgres/client';
import { approveTaskPlan, proposeTaskPlan } from '../taskPlans.service';

const mockQuery = query as jest.MockedFunction<typeof query>;

const A_PLAN = {
  solved_when: 'a vet is found',
  routes: [{ name: 'ask two people', status: 'running' }],
};

/**
 * „WHERE EVERY DOOR MEETS" WAS NOT WHERE EVERY DOOR MEETS — 27 September,
 * four hours after I wrote that sentence in `taskStore.service.ts`.
 *
 * This morning's fix put `isARealId` on the four task-id functions in the
 * store, with a comment saying the check belongs there because every door
 * meets there. It does not. `chat.service.ts` also hands
 * `Number(input['task_id'])` to `proposeTaskPlan` and `approveTaskPlan`, which
 * live in another file and never touch the store — and both put it straight
 * into `WHERE id = $1`. `Number(undefined)` is `NaN`, `pg` sends the STRING
 * „NaN", Postgres raises `invalid input syntax for type integer`.
 *
 * Measured, not argued: the integration run against a real Postgres
 * (`aMissingFieldCannotReachTheDatabase.integration.test.ts`, via
 * `scripts/ops/malformed.sh`) raised on both doors before the guard and
 * answers after it.
 *
 * ⚠️ THE APPROVE DOOR IS THE ONE WORTH LOOKING AT TWICE. It checks `confirmed`
 * and it reads the thread to check the yes was about the plan — two careful
 * gates, written against a real incident — and it never checked the id at all.
 * That is the shape of this whole day: the measurement was right and the
 * question was different.
 *
 * AND WHAT HID IT IS ALSO TONIGHT'S DOING. Until this evening a thrown tool
 * ended the run, so this would have been loud. Since the wrapper, the model
 * gets a failure, apologises or retries, and the run completes — the owner
 * sees a plan that silently did not get approved. `threw.sh` is the only thing
 * that asks about it.
 *
 * THIS FILE IS THE MOCKED HALF, and it exists because the integration suite is
 * SKIPPED without PG_INTEGRATION=1. A guard protected only by a suite that
 * does not run in `npm run verify` is a guard that gets deleted by a tidy-up
 * and nobody finds out. What it holds is narrow and exactly right: the query
 * is never issued.
 */
describe('a goal id that is not a goal id reaches no plan', () => {
  beforeEach(() => jest.clearAllMocks());

  it.each([
    ['a missing field', Number(undefined)],
    ['a word', Number('the vet one')],
    ['zero', 0],
    ['a negative', -1],
    ['a fraction', 1.5],
  ])('proposeTaskPlan asks the database nothing for %s', async (_what, id) => {
    const out = await proposeTaskPlan('owner', id, A_PLAN);

    expect(out.ok).toBe(false);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it.each([
    ['a missing field', Number(undefined)],
    ['a word', Number('the vet one')],
    ['zero', 0],
  ])('approveTaskPlan asks the database nothing for %s', async (_what, id) => {
    const out = await approveTaskPlan('owner', id);

    expect(out.ok).toBe(false);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  /**
   * The answers are the ones these functions already gave for a goal they
   * could not find — a new sentence here would be a new thing for the model to
   * be confused by, and the honest fact is the same fact: no such goal.
   */
  it('says what it already said about a goal it cannot find', async () => {
    const proposed = await proposeTaskPlan('owner', Number(undefined), A_PLAN);
    const approved = await approveTaskPlan('owner', Number(undefined));

    expect(proposed.ok === false && proposed.error).toBe('No such open goal of yours.');
    expect(approved.ok === false && approved.error).toBe(
      'No proposed plan is waiting on this goal.',
    );
  });

  /**
   * THE OTHER SIDE, and on these two doors it is the side that matters most: a
   * guard that refused every id would mean no plan could ever be proposed or
   * approved again — row 1, the wall, from the opposite direction, and the
   * easier bug to ship by accident.
   */
  it('lets a real goal id through to the database', async () => {
    mockQuery.mockResolvedValue({
      rows: [{ plan_version: 1, plan_approved_at: null }],
      rowCount: 1,
    } as never);

    const out = await proposeTaskPlan('owner', 4242, A_PLAN);

    expect(mockQuery).toHaveBeenCalled();
    expect(out.ok).toBe(true);
  });
});
