/**
 * A RUN BEGUN INSIDE A SHUTDOWN IS A RUN THAT WILL BE KILLED.
 *
 * Sabotage, 22 September: `if (isDraining()) return 'busy'` removed from
 * `wakeTask` — 3,735 tests passed. The guard's own comment explains at length
 * why it exists and nothing held it there.
 *
 * What it is for, in the words already above it: „`isDraining`'s own comment
 * says 'read before starting anything' and the user-facing route has read it
 * since row 205 — this path never did, which is how an engine run gets to
 * start inside a shutdown and vanish with it."
 *
 * 'busy' and NOT 'stopped', deliberately. A retry is exactly the right thing
 * here: the next container will take it. 'stopped' means „nothing a retry
 * could change" and would make the wake give up for good over a deploy that
 * lasts seconds — and `sweepUnwokenAnswers` only marks an answer delivered on
 * 'woken', so nothing is consumed by refusing.
 */
jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));
jest.mock('../chat.service', () => ({ __esModule: true, processChat: jest.fn() }));
jest.mock('../taskStore.service', () => ({
  __esModule: true,
  getTaskById: jest.fn(),
  ensureNextWake: jest.fn().mockResolvedValue(true),
}));
jest.mock('../threads.service', () => ({
  __esModule: true,
  getThread: jest.fn(),
  saveThreadMessage: jest.fn(),
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
jest.mock('../tokenWallet.service', () => ({ __esModule: true, checkRunAllowance: jest.fn() }));
jest.mock('../inFlightRuns', () => ({
  __esModule: true,
  isDraining: jest.fn().mockReturnValue(false),
  beginRun: jest.fn(),
  endRun: jest.fn(),
}));

import { getTaskById } from '../taskStore.service';
import { getThread } from '../threads.service';
import { isDraining, beginRun } from '../inFlightRuns';
import { wakeTask } from '../taskEngine.service';

const mockTask = getTaskById as jest.MockedFunction<typeof getTaskById>;
const mockThread = getThread as jest.MockedFunction<typeof getThread>;
const mockDraining = isDraining as jest.MockedFunction<typeof isDraining>;
const mockBeginRun = beginRun as jest.MockedFunction<typeof beginRun>;

const EVENT = { ka: 'მოვლენა', en: 'event', ru: 'событие', es: 'evento' };

beforeEach(() => {
  jest.clearAllMocks();
  mockDraining.mockReturnValue(false);
  mockTask.mockResolvedValue({
    id: 7,
    user_id: 501,
    status: 'open',
    thread_id: 900,
  } as never);
  mockThread.mockResolvedValue({ id: 900, status: 'idle' } as never);
});

describe('wakeTask refuses to start while the process is going away', () => {
  it('answers busy when the container is draining', async () => {
    mockDraining.mockReturnValue(true);

    await expect(wakeTask(7, EVENT as never)).resolves.toBe('busy');
  });

  /**
   * „Busy" is only half of it. The point is that NOTHING was begun — a run
   * registered here and then killed is the 21 September fault exactly.
   */
  it('starts nothing at all', async () => {
    mockDraining.mockReturnValue(true);

    await wakeTask(7, EVENT as never);

    expect(mockBeginRun).not.toHaveBeenCalled();
    // It refuses before it even reads the goal — there is no point looking.
    expect(mockTask).not.toHaveBeenCalled();
  });

  /**
   * NOT 'stopped'. 'stopped' means „nothing a retry could change", and a
   * deploy is over in seconds — the next container should take this wake.
   * Returning 'stopped' here would make a wake give up for good over a
   * restart, which is the opposite of what the guard is for.
   */
  it('does not say stopped, because a retry is exactly right here', async () => {
    mockDraining.mockReturnValue(true);

    await expect(wakeTask(7, EVENT as never)).resolves.not.toBe('stopped');
  });

  /**
   * The control. Without it „nothing was begun" would pass for a wake that
   * refused for any of the other reasons in this function.
   */
  it('gets past the guard when the container is healthy', async () => {
    mockDraining.mockReturnValue(false);

    await wakeTask(7, EVENT as never);

    expect(mockTask).toHaveBeenCalledWith(7);
  });
});
