/**
 * ROW 157'S OTHER HALF — THE WIRE, NOT THE VERDICT.
 *
 * Ninia's thread 16402, 17 September: fifteen identical sentences eight
 * seconds apart, „დავალებაზე მუშაობა შევაჩერე, ტოკენები ამოიწურა." Fifteen is
 * `WAKE_RETRY_ATTEMPTS` and six seconds is `WAKE_RETRY_DELAY_MS` — the loop
 * did exactly what it was written to do, against a condition no retry could
 * change.
 *
 * `wakeResult.test.ts` holds the half that says WHAT: `wakeTask` answers
 * „stopped" rather than „busy" when nothing a retry could fix is wrong. This
 * file holds the half that says SO WHAT — that the retry loop reads that word
 * and stands down.
 *
 * ⚠️ FOUND BY `sabotage.py` ON 27 SEPTEMBER, in block mode:
 *
 *     if (woken === 'stopped') {   ->   if (false) {
 *
 * and the whole suite stayed green. Both words were tested; nothing held them
 * together. It is the third time this month that shape has appeared here —
 * `recordWake` and `startDayOne` were the first, `if (!thread)` the second —
 * and it is what the sweep's own header promises it will keep finding: THE
 * PIECE IS TESTED FROM EVERY ANGLE AND THE WIRE THAT CALLS IT IS NOT.
 *
 * `startIntroOutcome` is the entry used here because it is the plainest of the
 * four: its gate is „is the goal still open" and its `onWoken` does nothing,
 * so what the test watches is the loop and not a caller's bookkeeping.
 */
jest.mock('../../db/postgres/client', () => ({
  poolPressure: () => ({ total: 0, idle: 0, waiting: 0 }),
  query: jest.fn().mockResolvedValue({ rows: [] }),
  __esModule: true,
}));
jest.mock('../chat.service', () => ({ __esModule: true, processChat: jest.fn() }));
jest.mock('../engineWakes.service', () => ({
  __esModule: true,
  DAY_ONE_WAKE: 'day_one',
  recordWake: jest.fn().mockResolvedValue(undefined),
  finishWake: jest.fn().mockResolvedValue(undefined),
  wakeDoneSince: jest.fn().mockResolvedValue(false),
  claimOverdueWakes: jest.fn().mockResolvedValue([]),
  abandonExhaustedWakes: jest.fn().mockResolvedValue(0),
}));
jest.mock('../taskStore.service', () => ({
  __esModule: true,
  getTaskById: jest.fn(),
  ensureNextWake: jest.fn().mockResolvedValue(true),
}));

import { getTaskById } from '../taskStore.service';
import { startIntroOutcome } from '../taskEngine.service';

const mockTask = getTaskById as jest.MockedFunction<typeof getTaskById>;

/** The engine's own numbers, and the test is only honest if they stay its own. */
const INTRO_OUTCOME_DELAY_MS = 6_000;
const WAKE_RETRY_DELAY_MS = 6_000;

const GOAL = 16_402;
const EVENT = { ka: 'შედეგი', en: 'outcome', ru: 'итог', es: 'resultado' };

/**
 * An OPEN goal whose `thread_id` is null: the gate says „still wanted", and
 * `wakeTask` then answers „stopped". Two different answers from one row, which
 * is the only way to reach the branch under test — a goal the loop is willing
 * to wake and a wake there is no point repeating.
 */
const OPEN_GOAL_WITH_NO_THREAD = {
  id: GOAL,
  user_id: 501,
  status: 'open',
  thread_id: null,
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  mockTask.mockResolvedValue(OPEN_GOAL_WITH_NO_THREAD as never);
});

afterEach(() => jest.useRealTimers());

describe('a wake that said „stopped" is not asked again', () => {
  it('tries once and then stands down, however long the clock runs', async () => {
    startIntroOutcome(GOAL, EVENT as never);

    await jest.advanceTimersByTimeAsync(INTRO_OUTCOME_DELAY_MS);
    const afterTheFirstAttempt = mockTask.mock.calls.length;

    // It did attempt — otherwise „it never retried" would be true of a test
    // that measured nothing, which is this week's whole subject.
    expect(afterTheFirstAttempt).toBeGreaterThan(0);

    // Four retry windows. With the branch removed the loop would have taken
    // all four, and fifteen were what reached Ninia.
    await jest.advanceTimersByTimeAsync(WAKE_RETRY_DELAY_MS * 4);

    expect(mockTask.mock.calls.length).toBe(afterTheFirstAttempt);
  });

  /**
   * And the mirror, so the test above cannot pass by the loop being broken in
   * general: a gate that says „no longer wanted" must also leave the clock
   * quiet, and it must do it WITHOUT having woken anything.
   */
  it('does not wake a goal that closed while the timer ran', async () => {
    mockTask.mockResolvedValue({ ...OPEN_GOAL_WITH_NO_THREAD, status: 'closed' } as never);

    startIntroOutcome(GOAL, EVENT as never);
    await jest.advanceTimersByTimeAsync(INTRO_OUTCOME_DELAY_MS);
    const afterTheGate = mockTask.mock.calls.length;

    await jest.advanceTimersByTimeAsync(WAKE_RETRY_DELAY_MS * 4);

    expect(mockTask.mock.calls.length).toBe(afterTheGate);
  });
});
