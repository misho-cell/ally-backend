/**
 * ROW 101, THE SEPTEMBER HALF — THREE YESES IN THIRTY-SEVEN SECONDS AND TWO
 * WAVES OF MESSAGES TO REAL PEOPLE.
 *
 * Lika's own goal 4627, 17 September, read out of `run_prompt_stamps` rather
 * than out of the report:
 *
 *   14:22:01  the owner: „კი"              → run bafee5f0 → approve_task_plan
 *   14:22:31  the owner: „დამტკიცებულია"   → run ca1add6b → approve_task_plan
 *   14:22:38  the owner: „ok"              → run e796b808 → approve_task_plan
 *   14:23:12  [event] the plan is approved — day one → run 425a82db
 *
 *   14:23:30-31   e796b808   ask_contact ×3   ← the first wave
 *   14:23:49-53   425a82db   ask_contact ×5   ← the second, 19 seconds later
 *
 * Three real people got two different messages each, in her name, with
 * different wording. The day-one wake started at 14:23:12 while the owner's
 * third run was STILL WORKING — its own asks are eighteen seconds later.
 *
 * WHY THIS FILE EXISTS ALONGSIDE THE GUARDS' OWN TESTS. Row 209's three guards
 * each fail a test when removed — I sabotaged all three before writing a line
 * of this and all three held. What none of them holds is the SHAPE: a wake
 * arriving on top of a run that is still going. Each door was tested; the
 * corridor was not, and the corridor is what 4627 walked down. Five days
 * without a recurrence is a good sign and is not evidence, and „the guards
 * exist" is not the claim row 101 has to close.
 *
 * AND LOOKING FOR THE CORRIDOR FOUND A FOURTH DOOR WITH NOTHING ON IT.
 * `runningTasks.has(taskId)` — the same goal woken twice at once, which is
 * nearer to 101 than any of the three — could be deleted with the whole suite
 * still green. It is the first test below.
 *
 * THE DOORS ARE TESTED SEPARATELY ON PURPOSE. `thread.status === 'working'` is
 * a column written with `void`, so it can lag; `threadHolder` is the lock
 * itself and cannot; `runningTasks` is neither, and answers before either is
 * consulted. Any one of them alone would have stopped 4627's second wave,
 * which is exactly why a test that lets them cover for each other would stay
 * green with one of them gone.
 */
jest.mock('../../db/postgres/client', () => ({
  __esModule: true,
  // `ownerSpokeRecently` reads this. It is a THIRD door and it has its own
  // file (wakeQuiet.test.ts); left open here so the two this file is about
  // are the only things that can answer „busy".
  query: jest.fn().mockResolvedValue({ rows: [{ recent: false }], rowCount: 1 }),
}));
jest.mock('../chat.service', () => ({ __esModule: true, processChat: jest.fn() }));
jest.mock('../taskStore.service', () => ({
  __esModule: true,
  getTaskById: jest.fn(),
  ensureNextWake: jest.fn().mockResolvedValue(true),
}));
jest.mock('../threads.service', () => ({
  __esModule: true,
  getThread: jest.fn(),
  saveThreadMessage: jest.fn().mockResolvedValue(undefined),
  threadLanguage: jest.fn().mockResolvedValue('ka'),
  lastAssistantMessageIs: jest.fn().mockResolvedValue(false),
}));
jest.mock('../askBudget.service', () => ({
  __esModule: true,
  describeAskBudget: jest.fn().mockResolvedValue(null),
}));
jest.mock('../runFailure.service', () => ({ __esModule: true, markRunFailed: jest.fn() }));
jest.mock('../sse.service', () => ({
  __esModule: true,
  emitRunComplete: jest.fn(),
  emitRunError: jest.fn(),
}));
jest.mock('../threadStatus.service', () => ({ __esModule: true, setThreadStatus: jest.fn() }));
jest.mock('../tokenWallet.service', () => ({
  __esModule: true,
  checkRunAllowance: jest.fn().mockResolvedValue({ allowed: true }),
}));
jest.mock('../inFlightRuns', () => ({
  __esModule: true,
  isDraining: jest.fn().mockReturnValue(false),
  beginRun: jest.fn(),
  endRun: jest.fn(),
}));
jest.mock('../threadRunQueue', () => ({
  __esModule: true,
  enterThread: jest.fn().mockResolvedValue(undefined),
  leaveThread: jest.fn(),
  threadHolder: jest.fn().mockReturnValue(undefined),
}));

import { getTaskById } from '../taskStore.service';
import { getThread } from '../threads.service';
import { processChat } from '../chat.service';
import { enterThread, threadHolder } from '../threadRunQueue';
import { beginRun } from '../inFlightRuns';
import { wakeTask } from '../taskEngine.service';

const mockTask = getTaskById as jest.MockedFunction<typeof getTaskById>;
const mockThread = getThread as jest.MockedFunction<typeof getThread>;
const mockChat = processChat as jest.MockedFunction<typeof processChat>;
const mockHolder = threadHolder as jest.MockedFunction<typeof threadHolder>;
const mockEnter = enterThread as jest.MockedFunction<typeof enterThread>;
const mockBeginRun = beginRun as jest.MockedFunction<typeof beginRun>;

/** Lika's goal and her thread, by their real numbers. */
const GOAL_4627 = 4627;
const HER_THREAD = 16_100;
const DAY_ONE = { ka: 'მოვლენა', en: 'event', ru: 'событие', es: 'evento' };

beforeEach(() => {
  jest.clearAllMocks();
  mockTask.mockResolvedValue({
    id: GOAL_4627,
    user_id: 501,
    status: 'open',
    thread_id: HER_THREAD,
  } as never);
  mockThread.mockResolvedValue({ id: HER_THREAD, status: 'idle' } as never);
  mockHolder.mockReturnValue(undefined);
});

describe('day one does not start on top of the approval that summoned it', () => {
  /**
   * DOOR ZERO — THE SAME GOAL, TWICE AT ONCE, AND NOTHING HELD IT UNTIL NOW.
   *
   * `if (runningTasks.has(taskId)) return 'busy'` is the first line of
   * `wakeTask` and it is the one aimed most exactly at row 101: not „a wake on
   * top of a chat run" but „a wake on top of THE SAME GOAL'S wake". Removing
   * it passed the whole suite on 23 September.
   *
   * It was invisible to the sabotage sweep as well, twice over — the harm
   * filter had no word in it that this line contains, and it is written with a
   * trailing comment two lines below that the single-line pattern could not
   * match either. Both are fixed in `scripts/ops/sabotage.py`, and this test
   * is what the fixed sweep found within a minute.
   *
   * `wakeTask` is re-entrant by nature: a ticker, an answer arriving and a
   * day-one event can all reach for one goal in the same second, and each of
   * them writes to the people the plan names.
   */
  it('refuses a second wake of the same goal while the first is running', async () => {
    let secondVerdict: string | undefined;
    // BOUNDED ON PURPOSE. Re-entering from INSIDE the first wake is the only
    // honest way to test this — the set is module-private and holds the id
    // only while a wake is actually in flight, which is precisely the window
    // 4627 fell through. But with the guard removed the re-entry recurses, so
    // without this counter the failure is a stack overflow rather than a
    // readable one, and a test whose failure cannot be read is half a test.
    let reentries = 0;
    mockChat.mockImplementation(async () => {
      if (reentries === 0) {
        reentries += 1;
        secondVerdict = await wakeTask(GOAL_4627, DAY_ONE as never);
      }
      return { reply: 'on it' } as never;
    });

    await wakeTask(GOAL_4627, DAY_ONE as never);

    expect(secondVerdict).toBe('busy');
    expect(mockChat).toHaveBeenCalledTimes(1);
  });

  /**
   * DOOR ONE: the status column. This is what 4627 actually looked like — the
   * owner's third run was mid-flight, so the thread read `working`, and the
   * day-one event arrived anyway.
   */
  it('refuses while the owner’s own run still owns the thread', async () => {
    mockThread.mockResolvedValue({ id: HER_THREAD, status: 'working' } as never);

    await expect(wakeTask(GOAL_4627, DAY_ONE as never)).resolves.toBe('busy');
  });

  /**
   * DOOR TWO: the lock. `thread.status` is written with `void` and can lag a
   * live run by whatever the write costs; the queue cannot lag, because
   * holding it is what running means.
   */
  it('refuses when the lock is held even though the column says idle', async () => {
    mockThread.mockResolvedValue({ id: HER_THREAD, status: 'idle' } as never);
    mockHolder.mockReturnValue('e796b808');

    await expect(wakeTask(GOAL_4627, DAY_ONE as never)).resolves.toBe('busy');
  });

  /**
   * AND REFUSING MEANS NOTHING WAS STARTED. „Busy" that has already begun a
   * run is the 21 September fault in a different coat: 4627's harm was not the
   * wake's verdict, it was the eight messages that went out underneath it.
   */
  it.each([
    ['the column says working', { status: 'working' }, undefined],
    ['the lock is held', { status: 'idle' }, 'e796b808'],
  ])('writes to nobody when %s', async (_name, thread, holder) => {
    mockThread.mockResolvedValue({ id: HER_THREAD, ...thread } as never);
    mockHolder.mockReturnValue(holder as never);

    await wakeTask(GOAL_4627, DAY_ONE as never);

    expect(mockChat).not.toHaveBeenCalled();
    expect(mockEnter).not.toHaveBeenCalled();
    expect(mockBeginRun).not.toHaveBeenCalled();
  });

  /**
   * „BUSY", NOT „STOPPED", AND THE DIFFERENCE IS THE WHOLE POINT OF THE ROW.
   *
   * Day one is the work the owner said yes to. Refusing it for good because
   * the conversation was momentarily busy would turn a duplicate-message bug
   * into a silence bug, which is the trade this project has made by accident
   * before. 'busy' is retried; 'stopped' is not.
   */
  it('leaves day one to come back rather than cancelling it', async () => {
    mockThread.mockResolvedValue({ id: HER_THREAD, status: 'working' } as never);

    await expect(wakeTask(GOAL_4627, DAY_ONE as never)).resolves.not.toBe('stopped');
  });

  /**
   * THE CONTROL, AND IT IS THE HALF THAT COULD GO WRONG QUIETLY.
   *
   * A guard that refuses everything also produces „one wave", and it produces
   * it by never sending the first. So a free thread must get PAST both doors.
   *
   * What is asserted is `enterThread`, not the verdict: taking the lock is the
   * line immediately after the second door, so reaching it is exactly „both
   * doors passed" and nothing more. The rest of the wake — the model call, the
   * reply, the failure branches — belongs to other files, and asserting a
   * verdict here would only be asserting how completely this file mocks them.
   */
  it('lets day one through once the thread is free', async () => {
    mockChat.mockResolvedValue({ reply: 'on it' } as never);

    await wakeTask(GOAL_4627, DAY_ONE as never);

    expect(mockEnter).toHaveBeenCalledWith(
      HER_THREAD,
      expect.any(String),
      expect.any(Number),
      expect.any(Number),
    );
  });
});
