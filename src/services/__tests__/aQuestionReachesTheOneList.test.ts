/**
 * THE FALLBACK THAT FILES A QUESTION THE MODEL FORGOT TO REGISTER.
 *
 * In an engine run the reply's audience is the owner, so a question here means
 * „blocked on you". The model is supposed to register it with
 * `ask_owner_decision`; when it just asks in prose instead, the badge on the
 * owner's goal is the only thing that tells them anything is waiting, and
 * nothing else would have filed it.
 *
 * ⚠️ FOUND BY `sabotage.py` ON 27 SEPTEMBER, in block mode:
 *
 *     if (asksOwner && !flagged) {   ->   if (false) {
 *
 * and the whole suite stayed green. A question asked in ordinary prose would
 * have reached the person's screen and nothing else — no badge, no entry on
 * the one list they read to know what is waiting on them — and no test would
 * have said a word.
 *
 * The two halves are held together here: it files when nothing else did, and
 * it does NOT file a second time when the model registered the question
 * itself. Both matter — one list with the item missing and one list with it
 * twice are different failures of the same list.
 */
jest.mock('../../db/postgres/client', () => ({
  poolPressure: () => ({ total: 0, idle: 0, waiting: 0 }),
  query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
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
jest.mock('../taskAsks.service', () => ({
  __esModule: true,
  hasPendingAskForThread: jest.fn().mockResolvedValue(false),
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

import { processChat } from '../chat.service';
import { flagGoalNeedsOwner, goalQuestionFlaggedSince } from '../goalQuestions.service';
import { getTaskById } from '../taskStore.service';
import { getThread } from '../threads.service';
import { startIntroOutcome } from '../taskEngine.service';

const mockChat = processChat as jest.MockedFunction<typeof processChat>;
const mockFlag = flagGoalNeedsOwner as jest.MockedFunction<typeof flagGoalNeedsOwner>;
const mockAlready = goalQuestionFlaggedSince as jest.MockedFunction<
  typeof goalQuestionFlaggedSince
>;
const mockTask = getTaskById as jest.MockedFunction<typeof getTaskById>;
const mockThread = getThread as jest.MockedFunction<typeof getThread>;

/** The engine's own delay for this wake. */
const INTRO_OUTCOME_DELAY_MS = 6_000;

const GOAL = 9_109;
const OWNER = 501;
const THREAD = 22_363;

/** A reply that asks, in prose, and registers nothing. */
const A_QUESTION_IN_PROSE = 'რომელ მათგანს დავუკავშირდე ჯერ?';

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  mockTask.mockResolvedValue({
    id: GOAL,
    user_id: OWNER,
    status: 'open',
    thread_id: THREAD,
  } as never);
  mockThread.mockResolvedValue({ id: THREAD, status: 'idle' } as never);
  mockChat.mockResolvedValue({ reply: A_QUESTION_IN_PROSE } as never);
  mockAlready.mockResolvedValue(false);
});

afterEach(() => jest.useRealTimers());

describe('a question asked in prose still reaches the owner’s list', () => {
  it('files it when nothing else did', async () => {
    startIntroOutcome(GOAL, { ka: 'შედეგი', en: 'outcome' } as never);
    await jest.advanceTimersByTimeAsync(INTRO_OUTCOME_DELAY_MS);

    expect(mockFlag).toHaveBeenCalledWith(String(OWNER), GOAL);
  });

  /**
   * AND NOT TWICE. When the model registered the question itself, `flagged` is
   * already true — the fallback must stand down, or the one list the owner
   * reads carries the same question twice and stops being a list of what is
   * waiting.
   */
  it('stands down when the model registered the question itself', async () => {
    mockAlready.mockResolvedValue(true);

    startIntroOutcome(GOAL, { ka: 'შედეგი', en: 'outcome' } as never);
    await jest.advanceTimersByTimeAsync(INTRO_OUTCOME_DELAY_MS);

    expect(mockFlag).not.toHaveBeenCalled();
  });

  /**
   * And a reply that asks nothing files nothing. Without this the test above
   * would pass on a fallback that flagged every run — which is the same
   * broken list, reached from the other side.
   */
  it('files nothing when the reply does not ask anything', async () => {
    mockChat.mockResolvedValue({ reply: 'დავუკავშირდი ორივეს.' } as never);

    startIntroOutcome(GOAL, { ka: 'შედეგი', en: 'outcome' } as never);
    await jest.advanceTimersByTimeAsync(INTRO_OUTCOME_DELAY_MS);

    expect(mockFlag).not.toHaveBeenCalled();
  });
});
