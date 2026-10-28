jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));
jest.mock('../../api/routes/threads.routes', () => ({
  __esModule: true,
  runOwnerMessage: jest.fn(),
}));
jest.mock('../threadRunQueue', () => ({
  __esModule: true,
  enterThread: jest.fn().mockResolvedValue(undefined),
  threadHolder: jest.fn(),
}));
jest.mock('../threadStatus.service', () => ({
  __esModule: true,
  setThreadStatus: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../threads.service', () => ({ __esModule: true, getThread: jest.fn() }));
jest.mock('../tokenWallet.service', () => ({ __esModule: true, checkRunAllowance: jest.fn() }));

import { readFileSync } from 'fs';
import { join } from 'path';
import { query } from '../../db/postgres/client';
import { runOwnerMessage } from '../../api/routes/threads.routes';
import { threadHolder } from '../threadRunQueue';
import { getThread } from '../threads.service';
import { checkRunAllowance } from '../tokenWallet.service';
import {
  answerUploadAlone,
  answerUploadAloneLater,
  UPLOAD_ALONE_WAIT_MS,
  UPLOAD_RUN_PREFIX,
  UploadRunOutcome,
} from '../uploadAloneRun.service';

/**
 * #8286 / #8284 (Giorgi 3318, thread 70225, 28 Oct): a file sent with no
 * words got only the automatic line. Now Netai answers it, once.
 */
const mockQuery = query as jest.MockedFunction<typeof query>;
const mockHolder = threadHolder as jest.MockedFunction<typeof threadHolder>;
const mockThread = getThread as jest.MockedFunction<typeof getThread>;
const mockAllowance = checkRunAllowance as jest.MockedFunction<typeof checkRunAllowance>;
const mockRun = runOwnerMessage as jest.MockedFunction<typeof runOwnerMessage>;
const words = (found: boolean): never => ({ rows: [{ found }], rowCount: 1 }) as never;
const LINE = '📎 companies.xlsx';
const SINCE = new Date('2026-10-28T10:00:00.000Z');
const THREAD = 70225;

beforeEach(() => {
  jest.clearAllMocks();
  mockHolder.mockReturnValue(undefined);
  mockQuery.mockResolvedValue(words(false));
  mockThread.mockResolvedValue({ type: 'regular' } as never);
  mockAllowance.mockResolvedValue({ allowed: true, balance: 10 } as never);
});

describe('a file with no words (#8286)', () => {
  it('starts a run on the attachment line, in the thread', async () => {
    expect(await answerUploadAlone('3318', THREAD, LINE, SINCE, 'ka')).toBe(
      UploadRunOutcome.Started,
    );
    expect(mockRun).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: '3318',
        threadId: THREAD,
        message: LINE,
        storedOnArrival: true,
        runId: expect.stringMatching(new RegExp(`^${UPLOAD_RUN_PREFIX}`)),
      }),
    );
  });

  it('leaves the file to a run already answering here', async () => {
    mockHolder.mockReturnValue('run-1');
    expect(await answerUploadAlone('3318', THREAD, LINE, SINCE, 'ka')).toBe(
      UploadRunOutcome.RunAlreadyHere,
    );
    expect(mockRun).not.toHaveBeenCalled();
  });

  it('leaves it to the words that followed it, so it is never answered twice', async () => {
    mockQuery.mockResolvedValueOnce(words(true));
    expect(await answerUploadAlone('3318', THREAD, LINE, SINCE, 'ka')).toBe(
      UploadRunOutcome.WordsFollowed,
    );
    expect(mockQuery.mock.calls[0][1]).toEqual([THREAD, SINCE, LINE]);
    expect(mockRun).not.toHaveBeenCalled();
  });

  it('runs only in the owner’s own conversation, and only with a balance', async () => {
    mockThread.mockResolvedValueOnce({ type: 'incoming_ask' } as never);
    expect(await answerUploadAlone('3318', THREAD, LINE, SINCE, 'ka')).toBe(
      UploadRunOutcome.NotOwnThread,
    );
    mockAllowance.mockResolvedValueOnce({ allowed: false, balance: 0 } as never);
    expect(await answerUploadAlone('3318', THREAD, LINE, SINCE, 'ka')).toBe(
      UploadRunOutcome.NoBalance,
    );
    expect(mockRun).not.toHaveBeenCalled();
  });

  it('waits for the words first, then answers', async () => {
    jest.useFakeTimers();
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    answerUploadAloneLater('3318', THREAD, LINE, SINCE, 'ka');
    expect(mockQuery).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(UPLOAD_ALONE_WAIT_MS);
    expect(mockRun).toHaveBeenCalledTimes(1);
    jest.useRealTimers();
  });

  it('is called by the upload route', () => {
    const routes = readFileSync(
      join(__dirname, '..', '..', 'api', 'routes', 'threadFiles.routes.ts'),
      'utf8',
    );
    expect(routes).toContain(
      'answerUploadAloneLater(String(up.owner), up.threadId, attachmentLine, since, up.language);',
    );
  });
});
