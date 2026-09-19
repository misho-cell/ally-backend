/**
 * Ticket 20 row 157 — the retry loop that said the same thing fifteen times.
 *
 * Ninia's thread 16402, 17 September, read from `conversations`:
 *
 *   10:37:38.440  10:37:46.487  10:37:54.946  10:38:03.016  10:38:11.058
 *   10:38:19.094  10:38:27.127  10:38:35.244  10:38:43.482  10:38:51.599
 *   10:38:59.665  10:39:07.733  10:39:15.807  10:39:23.876  10:39:31.945
 *
 * Fifteen rows, eight seconds apart, all the same sentence: „დავალებაზე
 * მუშაობა შევაჩერე, ტოკენები ამოიწურა." Fifteen is WAKE_RETRY_ATTEMPTS and six
 * seconds is WAKE_RETRY_DELAY_MS — the loop was doing exactly what it was
 * written to do, against a condition no retry could ever change.
 *
 * The fix is that `wakeTask` now says WHY it did not wake. These tests hold the
 * two halves of that: the empty wallet stops the loop, and a busy thread still
 * does not.
 */
jest.mock('../../db/postgres/client', () => ({ query: jest.fn(), __esModule: true }));
jest.mock('../chat.service', () => ({ __esModule: true, processChat: jest.fn() }));
jest.mock('../taskStore.service', () => ({
  __esModule: true,
  getTaskById: jest.fn(),
  // The wake floor, armed before the run since goal 6337 - see wakeTask.
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

import { query } from '../../db/postgres/client';
import { getTaskById, ensureNextWake, Task } from '../taskStore.service';
import { getThread, lastAssistantMessageIs, saveThreadMessage, Thread } from '../threads.service';
import { checkRunAllowance } from '../tokenWallet.service';
import { processChat } from '../chat.service';
import { wakeTask } from '../taskEngine.service';
import { clearThreadQueue, enterThread, leaveThread, threadHolder } from '../threadRunQueue';

const mockQuery = query as jest.MockedFunction<typeof query>;
const mockTask = getTaskById as jest.MockedFunction<typeof getTaskById>;
const mockThread = getThread as jest.MockedFunction<typeof getThread>;
const mockSave = saveThreadMessage as jest.MockedFunction<typeof saveThreadMessage>;
const mockAllowance = checkRunAllowance as jest.MockedFunction<typeof checkRunAllowance>;
const mockLastSaid = lastAssistantMessageIs as jest.MockedFunction<typeof lastAssistantMessageIs>;
const mockEnsureWake = ensureNextWake as jest.MockedFunction<typeof ensureNextWake>;

const TOKENS_OUT = 'ტოკენები ამოიწურა';

function thread(over: Partial<Thread> = {}): Thread {
  return { id: 16402, status: 'waiting', status_line: null, ...over } as Thread;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockTask.mockResolvedValue({
    id: 4258,
    user_id: '165699',
    status: 'open',
    thread_id: 16402,
  } as Task);
  // ownerSpokeRecently reads through the pool directly.
  mockQuery.mockResolvedValue({ rows: [{ recent: false }], rowCount: 1 } as never);
  mockSave.mockResolvedValue(undefined as never);
  mockLastSaid.mockResolvedValue(false);
  clearThreadQueue();
});

afterEach(() => clearThreadQueue());

describe('wakeTask says WHY it did not wake', () => {
  it('stops for good on an empty wallet, and says the line once', async () => {
    mockThread.mockResolvedValue(thread());
    mockAllowance.mockResolvedValue({ allowed: false } as never);

    expect(await wakeTask(4258, 'ნაბიჯი')).toBe('stopped');
    expect(mockSave).toHaveBeenCalledTimes(1);
    expect(String(mockSave.mock.calls[0][3])).toContain(TOKENS_OUT);
  });

  /**
   * The repeat test now asks the question it was always trying to ask.
   *
   * It used to check the thread's STATUS LINE, which records the subject and
   * not the sentence — so a generic „paused, top up" written first would have
   * swallowed the news that came after it, which is the seat's 290 exactly: an
   * introduction succeeded and the owner was told only that he owed money. The
   * gate compares the line itself now, so a different line always gets
   * through and the identical one never does.
   */
  it('does NOT say the same line twice', async () => {
    // The second goal on the same thread, the hourly sweep, the minute ticker:
    // 'stopped' holds the retry loop, and this holds everyone else.
    mockThread.mockResolvedValue(thread({ status: 'needs_you', status_line: TOKENS_OUT }));
    mockAllowance.mockResolvedValue({ allowed: false } as never);
    mockLastSaid.mockResolvedValue(true);

    expect(await wakeTask(4258, 'ნაბიჯი')).toBe('stopped');
    expect(mockSave).not.toHaveBeenCalled();
  });

  /**
   * The seat's 290. Goal 6205: the owner asked for an introduction, two people
   * helped, the target accepted and offered his week — and the wake carrying
   * that news hit an empty wallet and was answered with „work is paused, top
   * up". The only thing the product ever told him about work that succeeded
   * was that he owed money.
   */
  it('names who answered when the refused wake was carrying news', async () => {
    mockThread.mockResolvedValue(thread());
    mockAllowance.mockResolvedValue({ allowed: false } as never);

    expect(await wakeTask(4258, 'ნაბიჯი', { text: 'დიახ, შემიძლია', who: 'Netai Test 3' })).toBe(
      'stopped',
    );
    const said = String(mockSave.mock.calls[0][3]);
    expect(said).toContain('Netai Test 3');
    // And it says the news is HELD, not that nothing happened: the sweep
    // re-offers an answer until a wake takes it, so it really is waiting.
    expect(said).toContain('არაფერი დაკარგულა');
  });

  /**
   * Goal 6337: a day-one wake killed mid-run by a deploy left the goal with
   * next_wake_at NULL, zero asks, and a screen saying two people had been
   * asked. Every rescue path runs AFTER the wake - the ticker's
   * ensureNextWake, startDayOne's own onDone - so a run that dies never
   * reaches its own safety net, and getStaleOpenTasks wants twenty hours of
   * quiet as well, which a goal touched minutes ago does not have.
   */
  it('arms the next wake BEFORE the run, so a run that dies leaves a retry', async () => {
    mockThread.mockResolvedValue(thread());
    mockAllowance.mockResolvedValue({ allowed: true, balance: 100 } as never);
    (processChat as jest.Mock).mockRejectedValue(new Error('killed mid-run'));

    await wakeTask(4258, 'ნაბიჯი').catch(() => undefined);

    expect(mockEnsureWake).toHaveBeenCalledWith(4258, 24);
  });

  it('still says the plain line when the wake carried no news', async () => {
    mockThread.mockResolvedValue(thread());
    mockAllowance.mockResolvedValue({ allowed: false } as never);

    // An ordinary 24-hour wake: there is no answer to hold, so there is
    // nothing to name and the message must not imply there is.
    expect(await wakeTask(4258, 'ნაბიჯი', { text: '', who: null })).toBe('stopped');
    expect(String(mockSave.mock.calls[0][3])).toContain('დავალებაზე მუშაობა შევაჩერე');
  });

  it('still calls a live run on the thread BUSY — that one is worth retrying', async () => {
    mockThread.mockResolvedValue(thread({ status: 'working' }));

    expect(await wakeTask(4258, 'ნაბიჯი')).toBe('busy');
    // The wallet is never even read: the thread is occupied, which is not a
    // question about money.
    expect(mockAllowance).not.toHaveBeenCalled();
    expect(mockSave).not.toHaveBeenCalled();
  });

  it('stops on a goal that is closed or has no thread', async () => {
    mockTask.mockResolvedValue({
      id: 4258,
      user_id: '165699',
      status: 'closed',
      thread_id: 16402,
    } as Task);

    expect(await wakeTask(4258, 'ნაბიჯი')).toBe('stopped');
  });

  it('calls the owner still talking BUSY, not stopped', async () => {
    mockThread.mockResolvedValue(thread());
    mockQuery.mockResolvedValue({ rows: [{ recent: true }], rowCount: 1 } as never);

    expect(await wakeTask(4258, 'ნაბიჯი')).toBe('busy');
    expect(mockSave).not.toHaveBeenCalled();
  });
});

/**
 * Ticket 20 row 209. The status check above reads a column written with `void`
 * — it is a report, and a late one. The lock is the fact, and the wake has to
 * respect it from both sides: refuse while somebody else holds the
 * conversation, and HOLD it itself so the owner's next message waits rather
 * than landing on top, which is thread 15049.
 */
describe('a wake and the conversation lock', () => {
  it('is busy while another run holds the conversation, whatever the status column says', async () => {
    mockThread.mockResolvedValue(thread({ status: 'waiting' }));
    await enterThread(16402, 'someone-elses-run', 60_000, 5);

    expect(await wakeTask(4258, 'ნაბიჯი')).toBe('busy');
    // Busy, and it did not take the lock away from the run that has it.
    expect(threadHolder(16402)).toBe('someone-elses-run');
    expect(mockAllowance).not.toHaveBeenCalled();
  });

  it('gives the conversation back even when it stops on an empty wallet', async () => {
    mockThread.mockResolvedValue(thread());
    mockAllowance.mockResolvedValue({ allowed: false } as never);

    expect(await wakeTask(4258, 'ნაბიჯი')).toBe('stopped');
    // A wake that took the lock and kept it would stall every message the
    // owner typed for the next two minutes, for a run that never happened.
    expect(threadHolder(16402)).toBeUndefined();
  });

  it('holds the conversation while it runs, so the owner queues instead of colliding', async () => {
    mockThread.mockResolvedValue(thread());
    mockAllowance.mockResolvedValue({ allowed: true } as never);
    let heldDuringRun: string | undefined;
    (processChat as jest.Mock).mockImplementation(() => {
      heldDuringRun = threadHolder(16402);
      return Promise.reject(new Error('stop the run here — the lock is what is under test'));
    });

    await wakeTask(4258, 'ნაბიჯი');

    expect(heldDuringRun).toBeDefined();
    expect(threadHolder(16402)).toBeUndefined();
    // And the lock was the wake's own, not a leftover.
    leaveThread(16402, heldDuringRun as string);
  });
});
