jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));
jest.mock('../../api/routes/threads.routes', () => ({
  __esModule: true,
  runOwnerMessage: jest.fn(),
}));
jest.mock('../threads.service', () => ({ __esModule: true, getThread: jest.fn() }));
jest.mock('../threadStatus.service', () => ({
  __esModule: true,
  setThreadStatus: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../threadRunQueue', () => ({
  __esModule: true,
  enterThread: jest.fn().mockResolvedValue('free'),
}));

import { query } from '../../db/postgres/client';
import { runOwnerMessage } from '../../api/routes/threads.routes';
import { getThread } from '../threads.service';
import { setThreadStatus } from '../threadStatus.service';
import { enterThread } from '../threadRunQueue';
import { RUN_STRINGS } from '../runLanguage';
import { scrubMechanicalForStorage } from '../privacyScrub';
import {
  CutOffMessage,
  RESUMED_RUN_PREFIX,
  findCutOffMessages,
  resumeCutOffRuns,
  resumeOne,
  storedNoticeTexts,
} from '../cutOffRunResume.service';

const mockQuery = query as jest.MockedFunction<typeof query>;
const mockRun = runOwnerMessage as jest.MockedFunction<typeof runOwnerMessage>;
const mockGetThread = getThread as jest.MockedFunction<typeof getThread>;
const mockStatus = setThreadStatus as jest.MockedFunction<typeof setThreadStatus>;
const mockEnter = enterThread as jest.MockedFunction<typeof enterThread>;

const SINCE = new Date('2026-10-02T06:45:00Z');
const CUT: CutOffMessage = {
  noticeId: 'd9755c7e-5708-48d9-aa43-47b590e863ac',
  threadId: 29076,
  userId: 165699,
  message: 'მჭირდება ადვოკატი სამემკვიდრეო დავაზე',
};
const THREAD = { id: 29076, type: 'regular', title: 'ადვოკატი' } as unknown as NonNullable<
  Awaited<ReturnType<typeof getThread>>
>;

function rows(list: readonly unknown[], rowCount: number = list.length): never {
  return { rows: list, rowCount } as never;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetThread.mockResolvedValue(THREAD);
  mockEnter.mockResolvedValue('free');
});

/**
 * Tester 1013, 2 October: an answer my deploy cut off ended in „send it again".
 * The owner's message was already stored, so the new container sends it again
 * itself.
 */
describe('finding a cut-off message', () => {
  it('looks for the notice in every language, raw and as storage scrubs it', () => {
    const texts = storedNoticeTexts();
    for (const strings of Object.values(RUN_STRINGS)) {
      expect(texts).toContain(strings.restartedMidRun);
      expect(texts).toContain(scrubMechanicalForStorage(strings.restartedMidRun));
    }
  });

  it('asks only for notices that are still the last word, after a recent user message', async () => {
    mockQuery.mockResolvedValueOnce(
      rows([{ notice_id: CUT.noticeId, thread_id: 29076, user_id: 165699, message: CUT.message }]),
    );

    const found = await findCutOffMessages(SINCE);

    expect(found).toEqual([CUT]);
    const [sql, params, timeout] = mockQuery.mock.calls[0];
    expect(sql).toContain("n.kind = 'error'");
    expect(sql).toContain("u.role = 'user'");
    // The newest-row rule is by time: conversation ids are UUIDs, not a sequence.
    expect(sql).toContain('x.created_at > n.created_at');
    expect(sql).not.toMatch(/\.id [<>]/);
    expect(params?.[1]).toBe(SINCE);
    // One retry, never a loop: a restarted run's own notice is left alone.
    expect(params?.[2]).toBe(`${RESUMED_RUN_PREFIX}%`);
    expect(typeof timeout).toBe('number');
  });
});

describe('restarting one', () => {
  it('takes the notice back and runs the stored message through the route path', async () => {
    mockQuery.mockResolvedValueOnce(rows([], 1));

    expect(await resumeOne(CUT)).toBe(true);

    expect(mockQuery.mock.calls[0][0]).toContain('DELETE FROM conversations');
    expect(mockQuery.mock.calls[0][1]).toEqual([CUT.noticeId]);
    expect(mockStatus).toHaveBeenCalledWith('165699', 29076, 'working', {
      statusLine: RUN_STRINGS.ka.statusLines.working,
    });
    const run = mockRun.mock.calls[0][0];
    expect(run.message).toBe(CUT.message);
    expect(run.runId.startsWith(RESUMED_RUN_PREFIX)).toBe(true);
    // Row 212: the message is already in the thread; it must not be written twice.
    expect(run.storedOnArrival).toBe(true);
    expect(mockEnter).toHaveBeenCalledWith(
      29076,
      run.runId,
      expect.any(Number),
      expect.any(Number),
    );
  });

  it('starts nothing when the owner typed in between and the notice is no longer last', async () => {
    mockQuery.mockResolvedValueOnce(rows([], 0));

    expect(await resumeOne(CUT)).toBe(false);

    expect(mockRun).not.toHaveBeenCalled();
    expect(mockStatus).not.toHaveBeenCalled();
  });

  it('starts nothing for a thread that no longer exists', async () => {
    mockGetThread.mockResolvedValueOnce(null);

    expect(await resumeOne(CUT)).toBe(false);

    expect(mockQuery).not.toHaveBeenCalled();
    expect(mockRun).not.toHaveBeenCalled();
  });
});

describe('one sweep', () => {
  it('counts the runs it started', async () => {
    mockQuery
      .mockResolvedValueOnce(
        rows([
          { notice_id: CUT.noticeId, thread_id: 29076, user_id: 165699, message: CUT.message },
        ]),
      )
      .mockResolvedValueOnce(rows([], 1));

    expect(await resumeCutOffRuns(SINCE)).toBe(1);
  });

  it('never throws when the lookup fails, and says so in the log', async () => {
    const logged = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockQuery.mockRejectedValueOnce(new Error('timeout'));

    expect(await resumeCutOffRuns(SINCE)).toBe(0);

    expect(logged).toHaveBeenCalledWith('[run-resume] sweep failed:', 'timeout');
    logged.mockRestore();
  });

  it('a failed restart does not stop the next one', async () => {
    const logged = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const second: CutOffMessage = { ...CUT, noticeId: 'b2', threadId: 30078 };
    mockQuery
      .mockResolvedValueOnce(
        rows([
          { notice_id: CUT.noticeId, thread_id: 29076, user_id: 165699, message: CUT.message },
          { notice_id: 'b2', thread_id: 30078, user_id: 165699, message: CUT.message },
        ]),
      )
      .mockRejectedValueOnce(new Error('lock'))
      .mockResolvedValueOnce(rows([], 1));

    expect(await resumeCutOffRuns(SINCE)).toBe(1);

    expect(mockRun.mock.calls[0][0].threadId).toBe(second.threadId);
    logged.mockRestore();
  });
});
