jest.mock('../../db/postgres/client', () => ({ query: jest.fn(), __esModule: true }));
jest.mock('../notification.service', () => ({
  __esModule: true,
  sendPushNotification: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../productEvents.service', () => ({
  __esModule: true,
  recordProductEvent: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../threadStatus.service', () => ({
  __esModule: true,
  setThreadStatus: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../threads.service', () => ({
  __esModule: true,
  getThreadsByIntroRequestId: jest.fn().mockResolvedValue([]),
  saveThreadMessage: jest.fn().mockResolvedValue(undefined),
  userLanguage: jest.fn().mockResolvedValue('ka'),
}));
jest.mock('../debrief.service', () => ({ __esModule: true, armIntroDebrief: jest.fn() }));
jest.mock('../taskEngine.service', () => ({ __esModule: true, startIntroOutcome: jest.fn() }));

import { readFileSync } from 'fs';
import { join } from 'path';
import { query } from '../../db/postgres/client';
import { getThreadsByIntroRequestId } from '../threads.service';
import { cancelGoallessIntroductionsFromThread } from '../introduction.service';

const mockQuery = query as jest.MockedFunction<typeof query>;
const mockThreads = getThreadsByIntroRequestId as jest.MockedFunction<
  typeof getThreadsByIntroRequestId
>;

beforeEach(() => {
  jest.clearAllMocks();
});

/**
 * 2873 (the tester's 45643): an introduction asked for in a conversation with
 * no goal could not be taken back. „Stop" now withdraws the owner's pending
 * goal-less requests from that conversation, both sides told.
 */
describe('withdrawing goal-less introductions from a conversation', () => {
  it('cancels only the owner’s pending goal-less requests from this conversation', async () => {
    mockQuery.mockResolvedValue({
      rows: [{ id: 901, mediator_user_id: 7, target_name: 'გია' }],
      rowCount: 1,
    } as never);

    await expect(cancelGoallessIntroductionsFromThread(44221, '501')).resolves.toBe(1);

    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('origin_thread_id = $1 AND requester_user_id = $2::int');
    expect(sql).toContain('requester_task_id IS NULL');
    expect(sql).toContain("status = 'pending'");
    expect(params).toEqual([44221, '501']);
    expect(mockThreads).toHaveBeenCalledWith(901);
  });

  it('withdraws nothing when the read fails, and says so in the log', async () => {
    mockQuery.mockRejectedValue(new Error('timeout'));
    const warn = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(cancelGoallessIntroductionsFromThread(44221, '501')).resolves.toBe(0);
    expect(warn).toHaveBeenCalledWith(
      '[intro] could not withdraw requests for conversation 44221:',
      'timeout',
    );
  });

  it('is offered by the typed stop when the conversation holds no goal', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    expect(chat).toContain(
      '? ((await introductionsWithdrawnLine(userId, threadId, stopLang)) ??\n            NOTHING_TO_STOP_LINE[stopLang])',
    );
  });
});
