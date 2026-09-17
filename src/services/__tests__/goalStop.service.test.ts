jest.mock('../taskStore.service', () => ({
  updateTask: jest.fn(),
  getOpenTaskByThread: jest.fn(),
  __esModule: true,
}));
jest.mock('../taskAsks.service', () => ({ cancelAsksForTask: jest.fn(), __esModule: true }));
jest.mock('../threadStatus.service', () => ({ setThreadStatus: jest.fn(), __esModule: true }));
jest.mock('../sse.service', () => ({ emitChoicesCleared: jest.fn(), __esModule: true }));
jest.mock('../threads.service', () => ({
  getThread: jest.fn(),
  saveThreadMessage: jest.fn(),
  __esModule: true,
}));

import { updateTask, getOpenTaskByThread, Task } from '../taskStore.service';
import { cancelAsksForTask } from '../taskAsks.service';
import { setThreadStatus } from '../threadStatus.service';
import { getThread, saveThreadMessage, Thread } from '../threads.service';
import { emitChoicesCleared } from '../sse.service';
import { NOTHING_TO_STOP, stopGoal, stopGoalOnThread, stoppedLine } from '../goalStop.service';

const mockUpdate = updateTask as jest.MockedFunction<typeof updateTask>;
const mockCancel = cancelAsksForTask as jest.MockedFunction<typeof cancelAsksForTask>;
const mockThread = setThreadStatus as jest.MockedFunction<typeof setThreadStatus>;
const mockGetThread = getThread as jest.MockedFunction<typeof getThread>;
const mockOpenTask = getOpenTaskByThread as jest.MockedFunction<typeof getOpenTaskByThread>;
const mockSay = saveThreadMessage as jest.MockedFunction<typeof saveThreadMessage>;
const mockClear = emitChoicesCleared as jest.MockedFunction<typeof emitChoicesCleared>;

function task(over: Partial<Task> = {}): Task {
  return {
    id: 2872,
    status: 'open',
    thread_id: 14719,
    title: 'კარგი ვეტერინარი თბილისში',
    ...over,
  } as Task;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockCancel.mockResolvedValue(0);
  mockSay.mockResolvedValue(undefined as never);
});

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

    expect(mockUpdate).toHaveBeenCalledWith('501', 2872, 'closed', 'stopped_by_user', 'stopped');
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

/**
 * Row 113 second pass — the thread-keyed path both routes now share.
 *
 * The three answers are kept apart deliberately: „not your thread" is a 404,
 * „your thread, nothing running" is a 200 the screen can explain, and a stop is
 * a stop. Collapsing the first two into one 404 is how the header button's
 * failure stayed invisible in the first place.
 */
describe('stopGoalOnThread', () => {
  it('refuses a thread that is not the caller’s, without ever reading a goal', async () => {
    mockGetThread.mockResolvedValue(null);

    expect(await stopGoalOnThread('501', 16240)).toBeNull();
    // The point of the order: the goal lookup is keyed on the thread id alone,
    // so reaching it at all would already have crossed an account boundary.
    expect(mockOpenTask).not.toHaveBeenCalled();
  });

  it('answers nothing-to-stop on the owner’s own thread with no open goal', async () => {
    mockGetThread.mockResolvedValue({ id: 16240 } as Thread);
    mockOpenTask.mockResolvedValue(null);

    expect(await stopGoalOnThread('501', 16240)).toEqual(NOTHING_TO_STOP);
    expect(mockCancel).not.toHaveBeenCalled();
  });

  it('stops the goal the thread holds, asks and all', async () => {
    mockGetThread.mockResolvedValue({ id: 14719 } as Thread);
    mockOpenTask.mockResolvedValue(task());

    expect(await stopGoalOnThread('501', 14719)).toEqual({ stopped: true, goal_id: 2872 });
    expect(mockUpdate).toHaveBeenCalledWith('501', 2872, 'closed', 'stopped_by_user', 'stopped');
    expect(mockCancel).toHaveBeenCalledWith(2872);
  });
});

/**
 * Row 113 third pass — the button's stop says what it stopped.
 *
 * The tester's read of 41df5de on goal 4456 / thread 16602: stage stopped,
 * status closed, the button gone from the header, and not one line in the
 * thread. A stop nobody can see in the conversation is indistinguishable from a
 * button that did nothing.
 */
describe('stoppedLine', () => {
  it('names the goal', () => {
    expect(stoppedLine('კარგი ვეტერინარი თბილისში', 0)).toContain('კარგი ვეტერინარი თბილისში');
  });

  it('says nothing about asks when there were none', () => {
    expect(stoppedLine('X', 0)).not.toMatch(/კითხვა/);
  });

  it('counts the people who were told, because the owner cannot see them', () => {
    expect(stoppedLine('X', 1)).toContain('ერთი გაგზავნილი კითხვა');
    expect(stoppedLine('X', 3)).toContain('3 გაგზავნილი კითხვა');
  });
});

describe('the stop line reaches the thread', () => {
  it('is written once, naming the goal and the asks it cancelled', async () => {
    mockCancel.mockResolvedValue(2);

    await stopGoal('501', task());

    expect(mockSay).toHaveBeenCalledTimes(1);
    const [threadId, userId, role, text] = mockSay.mock.calls[0];
    expect(threadId).toBe(14719);
    expect(userId).toBe(501);
    expect(role).toBe('assistant');
    expect(String(text)).toContain('კარგი ვეტერინარი თბილისში');
    expect(String(text)).toContain('2 გაგზავნილი კითხვა');
  });

  it('says NOTHING the second time the button is pressed', async () => {
    // The tester presses it twice on purpose. Two identical „I stopped it"
    // lines would be row 157 in miniature.
    await stopGoal('501', task({ status: 'closed' }));

    expect(mockSay).not.toHaveBeenCalled();
  });

  it('has nowhere to write it when the goal has no thread', async () => {
    await stopGoal('501', task({ thread_id: null }));

    expect(mockSay).not.toHaveBeenCalled();
  });
});

/**
 * Row 113 — the buttons a stopped goal left on the screen.
 *
 * Read on thread 16798: the stop line was written and the plan's two buttons
 * stayed under it until the page was reloaded. A tap would have approved a plan
 * for a goal that was already closed.
 */
describe('a stop clears the buttons on the live screen', () => {
  it('tells the client to drop them', async () => {
    await stopGoal('501', task());

    expect(mockClear).toHaveBeenCalledWith('501', 14719);
  });

  it('clears them on the SECOND press too, when nothing else is written', async () => {
    // The second press writes no line — but if the first press's event was
    // missed, this is the owner's only other chance to be rid of them.
    await stopGoal('501', task({ status: 'closed' }));

    expect(mockSay).not.toHaveBeenCalled();
    expect(mockClear).toHaveBeenCalledWith('501', 14719);
  });

  it('has no screen to clear when the goal has no thread', async () => {
    await stopGoal('501', task({ thread_id: null }));

    expect(mockClear).not.toHaveBeenCalled();
  });
});
