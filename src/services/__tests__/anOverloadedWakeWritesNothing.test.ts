/**
 * 4 October 10:03Z, thread 14919 (a real owner): a scheduled wake hit
 * overloaded_error and „the task step did not finish, I'll try again later"
 * was written into her conversation — 51 such rows in seven days. A failed
 * system run is read in the log; the owner's conversation and the goal's
 * status stay as they were, and the minute ticker retries.
 */
jest.mock('../../db/postgres/client', () => ({ query: jest.fn(), __esModule: true }));
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
jest.mock('../threadStatus.service', () => ({
  __esModule: true,
  setThreadStatus: jest.fn(),
  endsWithQuestion: jest.fn().mockReturnValue(false),
  runStatus: jest.fn().mockReturnValue('waiting'),
}));
jest.mock('../goalQuestions.service', () => ({
  __esModule: true,
  flagGoalNeedsOwner: jest.fn(),
  goalQuestionFlaggedSince: jest.fn().mockResolvedValue(false),
}));
jest.mock('../taskAsks.service', () => ({
  __esModule: true,
  hasPendingAskForThread: jest.fn().mockResolvedValue(false),
}));
jest.mock('../notification.service', () => ({
  __esModule: true,
  sendPushNotification: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../tokenWallet.service', () => ({ __esModule: true, checkRunAllowance: jest.fn() }));

import { query } from '../../db/postgres/client';
import { processChat } from '../chat.service';
import { markRunFailed } from '../runFailure.service';
import { emitRunError } from '../sse.service';
import { getTaskById, Task } from '../taskStore.service';
import { setThreadStatus } from '../threadStatus.service';
import { getThread, saveThreadMessage, Thread } from '../threads.service';
import { checkRunAllowance } from '../tokenWallet.service';
import { wakeTask } from '../taskEngine.service';
import { clearThreadQueue } from '../threadRunQueue';

const THREAD_ID = 14919;
const TASK_ID = 3005;

beforeEach(() => {
  jest.clearAllMocks();
  clearThreadQueue();
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  (getTaskById as jest.Mock).mockResolvedValue({
    id: TASK_ID,
    user_id: '116793',
    status: 'open',
    thread_id: THREAD_ID,
  } as Task);
  (getThread as jest.Mock).mockResolvedValue({
    id: THREAD_ID,
    status: 'waiting',
    status_line: 'ველოდები',
  } as Thread);
  (checkRunAllowance as jest.Mock).mockResolvedValue({ allowed: true });
  (query as jest.Mock).mockResolvedValue({ rows: [{ recent: false }], rowCount: 1 });
});

afterEach(() => {
  clearThreadQueue();
  jest.restoreAllMocks();
});

describe('a wake whose model call fails', () => {
  it('writes nothing to the owner, marks nothing failed, and gives the badge back', async () => {
    (processChat as jest.Mock).mockRejectedValue(new Error('overloaded_error'));

    const result = await wakeTask(TASK_ID, 'ნაბიჯი');

    expect(result).toBe('stopped');
    expect(saveThreadMessage).not.toHaveBeenCalled();
    expect(emitRunError).not.toHaveBeenCalled();
    expect(markRunFailed).not.toHaveBeenCalled();
    expect(setThreadStatus).toHaveBeenLastCalledWith('116793', THREAD_ID, 'waiting', {
      statusLine: 'ველოდები',
    });
  });
});
