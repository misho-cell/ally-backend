/**
 * Board #386, threads 28018 and 27886 (2 October): a scheduled check found
 * nothing new, set the next check and wrote no sentence. The owner was shown
 * „the reply did not come together, try again" and the conversation was
 * marked failed. A system run that did its work through tools and has nothing
 * to say now ends quietly.
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
  wakeIsNews: jest.requireActual('../threadStatus.service').wakeIsNews,
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
import { sendPushNotification } from '../notification.service';
import { markRunFailed } from '../runFailure.service';
import { emitRunError } from '../sse.service';
import { getTaskById, Task } from '../taskStore.service';
import { runStatus, setThreadStatus } from '../threadStatus.service';
import { getThread, Thread } from '../threads.service';
import { checkRunAllowance } from '../tokenWallet.service';
import { wakeTask } from '../taskEngine.service';
import { clearThreadQueue } from '../threadRunQueue';

const THREAD_ID = 28018;
const TASK_ID = 4258;

beforeEach(() => {
  jest.clearAllMocks();
  clearThreadQueue();
  (getTaskById as jest.Mock).mockResolvedValue({
    id: TASK_ID,
    user_id: '165699',
    status: 'open',
    thread_id: THREAD_ID,
  } as Task);
  (getThread as jest.Mock).mockResolvedValue({ id: THREAD_ID, status: 'waiting' } as Thread);
  (checkRunAllowance as jest.Mock).mockResolvedValue({ allowed: true });
  (query as jest.Mock).mockResolvedValue({ rows: [{ recent: false }], rowCount: 1 });
});

afterEach(() => clearThreadQueue());

describe('a wake that did its work and said nothing', () => {
  it('is not a failure, keeps the goal status, and rings no phone', async () => {
    (processChat as jest.Mock).mockResolvedValue({ reply: '', language: 'ka', quiet: true });

    await wakeTask(TASK_ID, 'ნაბიჯი');

    expect(emitRunError).not.toHaveBeenCalled();
    expect(markRunFailed).not.toHaveBeenCalled();
    expect(setThreadStatus).toHaveBeenCalledWith('165699', THREAD_ID, 'waiting', {
      isTask: true,
    });
    expect(sendPushNotification).not.toHaveBeenCalled();
  });

  it('still rings the phone when the wake had news to say', async () => {
    // #1255: news is a question, a finished goal or an answer — here, done.
    (runStatus as jest.Mock).mockReturnValueOnce('done');
    (processChat as jest.Mock).mockResolvedValue({ reply: 'ნინომ უპასუხა', language: 'ka' });

    await wakeTask(TASK_ID, 'ნაბიჯი');

    expect(sendPushNotification).toHaveBeenCalledTimes(1);
  });
});
