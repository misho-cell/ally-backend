/**
 * ROW 267'S WIRE — the gate exists, the plan is what has to obey it.
 *
 * Thread 24391, by the clock:
 *
 *   10:26:23  „I'm moving to Argentina next year for business. Who could help?"
 *   10:26:46  we ask what kind of business, and what would help most
 *   10:26:55  a goal is saved and the plan wake fires — NINE SECONDS LATER
 *   10:27:19  „Plan v1 (awaiting your approval)", two buttons, asking again
 *
 * The person is asked something and, before they can type a word, handed a
 * plan built without their answer.
 *
 * `itAsksAndThenWaits.test.ts` holds the predicate — four tests on what
 * `ownerWasAskedAndHasNotAnswered` reads, and three on the postponement, the
 * latter by reading this file's source text. ⚠️ THAT IS WHY NOTHING NOTICED
 * when `sabotage.py` turned the wire off on 27 September:
 *
 *     if (await ownerWasAskedAndHasNotAnswered(taskId)) {   ->   if (false) {
 *
 * Every string those tests look for is still in the file with the branch dead,
 * so seven green tests said nothing about whether the plan actually waits. A
 * source-text assertion holds the shape of the code; only a run holds what it
 * does.
 *
 * What is asserted here is the one thing that reached a real person: with a
 * question of ours still unanswered, NOTHING IS WOKEN — `processChat` is never
 * reached, so no plan is drawn and no buttons are shown.
 */
jest.mock('../../db/postgres/client', () => ({
  poolPressure: () => ({ total: 0, idle: 0, waiting: 0 }),
  query: jest.fn(),
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
  goalHasActedOutward: jest.fn().mockResolvedValue(false),
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
// `endsWithQuestion` and `runStatus` are read on the run's way out; a mock
// that leaves them undefined turns the control test's green into a swallowed
// TypeError, which would prove nothing.
jest.mock('../threadStatus.service', () => ({
  __esModule: true,
  setThreadStatus: jest.fn(),
  endsWithQuestion: (text: string) => text.trim().endsWith('?'),
  runStatus: () => 'needs_you',
}));
jest.mock('../goalQuestions.service', () => ({
  __esModule: true,
  flagGoalNeedsOwner: jest.fn().mockResolvedValue(undefined),
  goalQuestionFlaggedSince: jest.fn().mockResolvedValue(false),
}));
jest.mock('../notification.service', () => ({
  __esModule: true,
  sendPushNotification: jest.fn().mockResolvedValue(undefined),
}));
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

import { query } from '../../db/postgres/client';
import { processChat } from '../chat.service';
import { getTaskById } from '../taskStore.service';
import { getThread } from '../threads.service';
import { startPlanProposal } from '../taskEngine.service';

const mockQuery = query as jest.MockedFunction<typeof query>;
const mockTask = getTaskById as jest.MockedFunction<typeof getTaskById>;
const mockThread = getThread as jest.MockedFunction<typeof getThread>;
const mockChat = processChat as jest.MockedFunction<typeof processChat>;

/** The engine's own delay for the first pass. */
const PLAN_PROPOSAL_DELAY_MS = 4_000;

const GOAL = 24_391;
const HER_THREAD = 24_391;

/**
 * A goal ready to be planned and nothing in its way: open, no plan, no
 * proposal. The title and brief are left empty on purpose — the
 * one-person-instruction check (D316) reads them and answers before it asks
 * the database, so the only question left on this path is the owner's.
 */
const READY_TO_PLAN = {
  id: GOAL,
  user_id: 501,
  status: 'open',
  thread_id: HER_THREAD,
  plan: null,
  plan_proposed: null,
  title: '',
  brief: '',
};

/** The one row this path reads: „the last thing said was a question of ours". */
const ownerOwesAnAnswer = (waiting: boolean): void => {
  mockQuery.mockResolvedValue({ rows: [{ waiting }], rowCount: 1 } as never);
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  mockTask.mockResolvedValue(READY_TO_PLAN as never);
  mockThread.mockResolvedValue({ id: HER_THREAD, status: 'idle' } as never);
  mockChat.mockResolvedValue({ reply: 'plan v1' } as never);
});

afterEach(() => jest.useRealTimers());

describe('the plan does not start on top of an unanswered question', () => {
  it('wakes nothing while the owner still owes us an answer', async () => {
    ownerOwesAnAnswer(true);

    startPlanProposal(GOAL);
    await jest.advanceTimersByTimeAsync(PLAN_PROPOSAL_DELAY_MS);

    expect(mockChat).not.toHaveBeenCalled();
  });

  /**
   * AND THE CONTROL, because „nothing happened" is the easiest test in the
   * world to pass by accident — a typo in the mocks would satisfy the one
   * above while the gate did nothing at all. With the same goal and the same
   * clock, the only thing changed being the owner's silence, the plan runs.
   */
  it('runs as soon as no question of ours is outstanding', async () => {
    ownerOwesAnAnswer(false);

    startPlanProposal(GOAL);
    await jest.advanceTimersByTimeAsync(PLAN_PROPOSAL_DELAY_MS);

    expect(mockChat).toHaveBeenCalledTimes(1);
  });
});
