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
jest.mock('../taskStore.service', () => ({ __esModule: true, getTaskById: jest.fn() }));
jest.mock('../threads.service', () => ({
  __esModule: true,
  getThread: jest.fn(),
  saveThreadMessage: jest.fn(),
}));
jest.mock('../threadStatus.service', () => ({ __esModule: true, setThreadStatus: jest.fn() }));
jest.mock('../tokenWallet.service', () => ({ __esModule: true, checkRunAllowance: jest.fn() }));

import { query } from '../../db/postgres/client';
import { getTaskById, Task } from '../taskStore.service';
import { getThread, saveThreadMessage, Thread } from '../threads.service';
import { checkRunAllowance } from '../tokenWallet.service';
import { wakeTask } from '../taskEngine.service';

const mockQuery = query as jest.MockedFunction<typeof query>;
const mockTask = getTaskById as jest.MockedFunction<typeof getTaskById>;
const mockThread = getThread as jest.MockedFunction<typeof getThread>;
const mockSave = saveThreadMessage as jest.MockedFunction<typeof saveThreadMessage>;
const mockAllowance = checkRunAllowance as jest.MockedFunction<typeof checkRunAllowance>;

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
});

describe('wakeTask says WHY it did not wake', () => {
  it('stops for good on an empty wallet, and says the line once', async () => {
    mockThread.mockResolvedValue(thread());
    mockAllowance.mockResolvedValue({ allowed: false } as never);

    expect(await wakeTask(4258, 'ნაბიჯი')).toBe('stopped');
    expect(mockSave).toHaveBeenCalledTimes(1);
    expect(String(mockSave.mock.calls[0][3])).toContain(TOKENS_OUT);
  });

  it('does NOT say it again when the thread already carries that status line', async () => {
    // The second goal on the same thread, the hourly sweep, the minute ticker:
    // 'stopped' holds the retry loop, and this holds everyone else.
    mockThread.mockResolvedValue(thread({ status: 'needs_you', status_line: TOKENS_OUT }));
    mockAllowance.mockResolvedValue({ allowed: false } as never);

    expect(await wakeTask(4258, 'ნაბიჯი')).toBe('stopped');
    expect(mockSave).not.toHaveBeenCalled();
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
