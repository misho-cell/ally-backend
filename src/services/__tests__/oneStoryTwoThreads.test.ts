jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));
jest.mock('../threads.service', () => ({
  __esModule: true,
  saveThreadMessage: jest.fn().mockResolvedValue(undefined),
  userLanguage: jest.fn().mockResolvedValue('en'),
}));

import { query } from '../../db/postgres/client';
import { saveThreadMessage } from '../threads.service';
import {
  AskScope,
  backPointerLine,
  findEarlierAskThread,
  forwardPointerLine,
  linkRequestToEarlierAsk,
} from '../threadBackPointer.service';

const mockQuery = query as jest.MockedFunction<typeof query>;
const mockSave = saveThreadMessage as jest.MockedFunction<typeof saveThreadMessage>;

/**
 * Row 305 (a), goal 11323: the introduction request opened thread 27194
 * beside the ask thread 26997 — same two people, same goal — and nothing said
 * they were one conversation.
 */
const INPUT = {
  taskId: 11323,
  requesterUserId: 172836,
  readerUserId: 172833,
  requestThreadId: 27194,
  requestThreadTitle: 'Netai Test 68 → Nika',
  requesterName: 'Netai Test 65',
  targetName: 'Nika',
} as const;

beforeEach(() => jest.clearAllMocks());

describe('one story in two threads', () => {
  it('writes the back line into the new thread and the forward line into the old one', async () => {
    mockQuery.mockResolvedValue({
      rows: [{ id: 26997, title: 'Netai Test 65: do you know an electrician?' }],
      rowCount: 1,
    } as never);

    await expect(linkRequestToEarlierAsk(INPUT)).resolves.toBe(true);

    const [sql, params, timeout] = mockQuery.mock.calls[0];
    expect(String(sql)).toContain('a.task_id = $1 AND a.from_user_id = $2 AND a.to_user_id = $3');
    expect(params).toEqual([11323, 172836, 172833]);
    expect(timeout).toBeGreaterThan(0);

    expect(mockSave).toHaveBeenCalledTimes(2);
    const [backThread, , , backText] = mockSave.mock.calls[0];
    const [forwardThread, , , forwardText] = mockSave.mock.calls[1];
    expect(backThread).toBe(27194);
    expect(backText).toContain('„Netai Test 65: do you know an electrician?"');
    expect(forwardThread).toBe(26997);
    expect(forwardText).toContain('„Netai Test 68 → Nika"');
    expect(forwardText).toContain('**Nika**');
  });

  /**
   * Row 305 (a) points at an ask whatever became of it — a cancelled question
   * still happened. Only (b)'s „is there a conversation to CONTINUE" narrows it.
   */
  it('points at any earlier ask, not only an open one', async () => {
    mockQuery.mockResolvedValue({ rows: [{ id: 26997, title: null }], rowCount: 1 } as never);

    await linkRequestToEarlierAsk(INPUT);

    expect(String(mockQuery.mock.calls[0][0])).not.toContain('a.status IN');
  });

  it('narrows to the asks createAsk would continue when asked for an open one', async () => {
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 } as never);

    await findEarlierAskThread(11323, 172836, 172833, AskScope.StillOpen);

    expect(String(mockQuery.mock.calls[0][0])).toContain("AND a.status IN ('sent', 'answered')");
  });

  it('writes nothing when the goal never asked this person', async () => {
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 } as never);

    await expect(linkRequestToEarlierAsk(INPUT)).resolves.toBe(false);
    expect(mockSave).not.toHaveBeenCalled();
  });

  it('lets a failed lookup reach the caller rather than hiding it', async () => {
    mockQuery.mockRejectedValue(new Error('timeout'));

    await expect(linkRequestToEarlierAsk(INPUT)).rejects.toThrow('timeout');
    expect(mockSave).not.toHaveBeenCalled();
  });

  it('has both lines in every language, with the names in them', () => {
    for (const language of ['ka', 'en', 'ru', 'es'] as const) {
      expect(backPointerLine(language, 'Netai Test 65', 'chat')).toContain('Netai Test 65');
      expect(forwardPointerLine(language, 'Netai Test 65', 'Nika', 'chat')).toContain(
        'Netai Test 65',
      );
    }
  });

  it('leaves out the chat name when a thread has no title', () => {
    expect(backPointerLine('en', 'Netai Test 65', null)).not.toContain('„');
  });
});
