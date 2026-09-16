jest.mock('../taskStore.service', () => ({ updateTask: jest.fn(), __esModule: true }));
jest.mock('../taskAsks.service', () => ({ cancelAsksForTask: jest.fn(), __esModule: true }));
jest.mock('../threadStatus.service', () => ({ setThreadStatus: jest.fn(), __esModule: true }));

import { updateTask, Task } from '../taskStore.service';
import { cancelAsksForTask } from '../taskAsks.service';
import { setThreadStatus } from '../threadStatus.service';
import { NOTHING_TO_STOP, stopGoal } from '../goalStop.service';

const mockUpdate = updateTask as jest.MockedFunction<typeof updateTask>;
const mockCancel = cancelAsksForTask as jest.MockedFunction<typeof cancelAsksForTask>;
const mockThread = setThreadStatus as jest.MockedFunction<typeof setThreadStatus>;

function task(over: Partial<Task> = {}): Task {
  return { id: 2872, status: 'open', thread_id: 14719, ...over } as Task;
}

beforeEach(() => jest.clearAllMocks());

/**
 * Ticket 20 row 113. The header button posted the THREAD id to a route keyed on
 * the GOAL id, 404'd, and the 404 was shown to nobody — so the owner believed a
 * running goal had stopped while it kept working and kept waking.
 *
 * The frontend has no goal id in the chat view, so there are now two routes.
 * These tests exist because two stop paths that drift apart would be a worse
 * bug than the one being fixed: the copy that forgot to cancel the asks would
 * go on writing to real people after the owner had stopped the goal.
 */
describe('stopping a goal, from either route', () => {
  it('closes the goal, cancels the asks, and settles the thread', async () => {
    const out = await stopGoal('501', task());

    expect(mockUpdate).toHaveBeenCalledWith('501', 2872, 'closed', 'stopped_by_user');
    expect(mockCancel).toHaveBeenCalledWith(2872);
    expect(mockThread).toHaveBeenCalledWith('501', 14719, 'done', {
      statusLine: 'შეჩერებულია',
    });
    expect(out).toEqual({ stopped: true, goal_id: 2872 });
  });

  it('CANCELS THE ASKS even when the goal was already closed', async () => {
    // The half that matters: a goal closed by another route may still have
    // questions sitting unanswered on other people's phones.
    await stopGoal('501', task({ status: 'closed' }));

    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockCancel).toHaveBeenCalledWith(2872);
  });

  it('is idempotent — stopping a closed goal still reports stopped', async () => {
    expect(await stopGoal('501', task({ status: 'closed' }))).toEqual({
      stopped: true,
      goal_id: 2872,
    });
  });

  it('survives a goal with no thread of its own', async () => {
    await stopGoal('501', task({ thread_id: null }));
    expect(mockThread).not.toHaveBeenCalled();
    expect(mockCancel).toHaveBeenCalledWith(2872);
  });

  it('the nothing-to-stop answer is distinguishable from a stop', () => {
    expect(NOTHING_TO_STOP.stopped).toBe(false);
    expect(NOTHING_TO_STOP.reason).toBe('no_open_goal');
    expect(NOTHING_TO_STOP.goal_id).toBeNull();
  });
});
