jest.mock('../../db/postgres/client', () => ({ query: jest.fn(), __esModule: true }));
jest.mock('../taskStore.service', () => ({
  __esModule: true,
  getTaskById: jest.fn(),
  goalHasActedOutward: jest.fn(),
  // Everything else taskEngine imports from the store, unused here.
  getDueTasks: jest.fn(),
  getStaleOpenTasks: jest.fn(),
  getGoalsUnansweredForADay: jest.fn(),
  markQuestionDefaulted: jest.fn(),
  getSilentGoals: jest.fn(),
  markSilentDayWoken: jest.fn(),
  getGoalsSilentForDays: jest.fn(),
  markMethodChangeWoken: jest.fn(),
  ensureNextWake: jest.fn().mockResolvedValue(undefined),
  touchTaskActivity: jest.fn(),
  clearTaskWake: jest.fn(),
}));

import { readFileSync } from 'fs';
import { join } from 'path';
import { getTaskById, goalHasActedOutward } from '../taskStore.service';
import { nothingToPlanYet } from '../taskEngine.service';

const mockTask = getTaskById as jest.MockedFunction<typeof getTaskById>;
const mockActed = goalHasActedOutward as jest.MockedFunction<typeof goalHasActedOutward>;

/**
 * The seat's 391, section 4 — „a plan asking approval for a route already
 * taken and already answered, nine seconds after the answer arrived."
 *
 * They saw it once and would not call it a fault on one. It is not one. The
 * three timestamps on goal 7063 name the mechanism exactly:
 *
 *   12:16:57.950  goal created            -> startPlanProposal queued, +4s
 *   12:17:22.997  request_introduction     the thread is busy doing the work
 *   12:18:15.473  the mediator accepts
 *   12:18:23.942  the queued proposal finally lands. planStillMissing: true.
 *   12:18:25.343  propose_task_plan „solved when: Netai Test 2 responds"
 *   12:19:04.356  the introduction's OWN wake arrives, 41 seconds too late
 *
 * Of 214 proposals in the six days `tool_call_log` covers, five came after the
 * goal had already acted. Three of the five are 47, 55 and 64 seconds apart —
 * goals 6172, 6898 and 7063, one on each of the 19th, 20th and 21st. The other
 * two are a day and eight days apart and cannot be this timer; they are the
 * model proposing on its own, which this predicate does not gate.
 */
const OPEN_GOAL_WITHOUT_A_PLAN = {
  id: 7063,
  user_id: '171870',
  status: 'open',
  plan: null,
  plan_proposed: null,
} as unknown as Awaited<ReturnType<typeof getTaskById>>;

describe('a plan is not proposed for work already done', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockTask.mockResolvedValue(OPEN_GOAL_WITHOUT_A_PLAN);
    mockActed.mockResolvedValue(false);
  });

  it('proposes on a goal that has not reached anybody yet', async () => {
    await expect(nothingToPlanYet(7063)).resolves.toBe(true);
  });

  it('does NOT propose once an ask or an introduction has gone out', async () => {
    mockActed.mockResolvedValue(true);
    await expect(nothingToPlanYet(7063)).resolves.toBe(false);
  });

  /** The two conditions that were already there, and must stay. */
  it('leaves a goal that meanwhile got a plan alone', async () => {
    mockTask.mockResolvedValue({
      ...OPEN_GOAL_WITHOUT_A_PLAN,
      plan: 'v1',
    } as unknown as Awaited<ReturnType<typeof getTaskById>>);
    await expect(nothingToPlanYet(7063)).resolves.toBe(false);
  });

  it('leaves a goal that meanwhile closed alone', async () => {
    mockTask.mockResolvedValue({
      ...OPEN_GOAL_WITHOUT_A_PLAN,
      status: 'closed',
    } as unknown as Awaited<ReturnType<typeof getTaskById>>);
    await expect(nothingToPlanYet(7063)).resolves.toBe(false);
  });

  it('leaves a goal that no longer exists alone', async () => {
    mockTask.mockResolvedValue(null);
    await expect(nothingToPlanYet(7063)).resolves.toBe(false);
    // And does not go on to ask the database a second question about it.
    expect(mockActed).not.toHaveBeenCalled();
  });
});

/**
 * The predicate only matters if the timer actually uses it. Comments stripped
 * first — an earlier version of this trick passed against my own documentation
 * of a fix rather than against the fix.
 */
describe('the timer uses it', () => {
  it('startPlanProposal gates on nothingToPlanYet', () => {
    const source = readFileSync(join(__dirname, '..', 'taskEngine.service.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/[^\n]*/g, '');
    const at = source.indexOf('export function startPlanProposal');
    expect(source.slice(at, at + 400)).toContain('nothingToPlanYet(taskId)');
    // And the old, weaker predicate is gone rather than merely unused.
    expect(source).not.toContain('planStillMissing');
  });
});
