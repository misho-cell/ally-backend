jest.mock('../../db/postgres/client', () => ({ query: jest.fn(), __esModule: true }));
jest.mock('../threads.service', () => ({
  __esModule: true,
  saveThreadMessage: jest.fn().mockResolvedValue(undefined),
  createThread: jest.fn().mockResolvedValue({ id: 1 }),
  userLanguage: jest.fn().mockResolvedValue('en'),
}));

import { query } from '../../db/postgres/client';
import { saveThreadMessage, userLanguage } from '../threads.service';
import { withdrawAsksToOptedOutPerson } from '../taskAsks.service';

const mockQuery = query as jest.MockedFunction<typeof query>;
const mockSave = saveThreadMessage as jest.MockedFunction<typeof saveThreadMessage>;
const mockLanguage = userLanguage as jest.MockedFunction<typeof userLanguage>;

const cancelled = (rows: unknown[]): void => {
  mockQuery.mockResolvedValue({ rows, rowCount: rows.length } as never);
};

beforeEach(() => {
  jest.clearAllMocks();
  mockLanguage.mockResolvedValue('en');
});

/**
 * The seat asked whether the ASKER is ever told that his question died because
 * the person he asked switched questions off — and would not report it until
 * one of us knew.
 *
 * Read from the live table, 22 September: ask 3665 went to `cancelled` at
 * 09:27:40, and account 171937's held updates that morning are two debriefs
 * and two search follow-ups, none about it. The 3-day debrief for that ask
 * would have said „no answer for 3 days … keep waiting" — false about a
 * withdrawn question, and correctly dropped at release time by
 * `debriefStillDue`, which keeps a relayed-ask debrief only while the ask is
 * still `sent`.
 *
 * So the answer was: silence, correctly, and permanently.
 */
describe('the person who asked is told his question is gone', () => {
  it('cancels only what is still in flight to that person', async () => {
    cancelled([]);

    await withdrawAsksToOptedOutPerson('171938');

    const sql = String(mockQuery.mock.calls[0][0]);
    expect(sql).toContain("SET status = 'cancelled'");
    expect(sql).toContain("ta.status = 'sent'");
    expect(mockQuery.mock.calls[0][1]).toEqual(['171938']);
  });

  it('writes the line into the goal’s own thread, naming the person asked', async () => {
    cancelled([{ task_id: 7829, from_user_id: 171937, thread_id: 21504, to_name: 'Netai Test 8' }]);

    const n = await withdrawAsksToOptedOutPerson('171938');

    expect(n).toBe(1);
    const [threadId, userId, role, text] = mockSave.mock.calls[0];
    expect(threadId).toBe(21504);
    expect(userId).toBe(171937);
    expect(role).toBe('assistant');
    expect(String(text)).toContain('Netai Test 8');
  });

  /**
   * The other person's refusal to be contacted is theirs. A line explaining it
   * would publish one person's choice to another, which is the rule the plan
   * path already keeps — so this says the question is gone and offers the only
   * thing the asker can act on.
   */
  it('says nothing about WHY it was withdrawn', async () => {
    cancelled([{ task_id: 7829, from_user_id: 171937, thread_id: 21504, to_name: 'Netai Test 8' }]);

    await withdrawAsksToOptedOutPerson('171938');

    const text = String(mockSave.mock.calls[0][3]).toLowerCase();
    expect(text).not.toContain('opted');
    expect(text).not.toContain('opt-out');
    expect(text).not.toContain('blocked');
    expect(text).not.toContain('refused');
    // And it offers the way forward rather than leaving him with nothing.
    expect(text).toContain('somebody else');
  });

  it('in the ASKER’s language, not the other person’s', async () => {
    mockLanguage.mockResolvedValue('ka');
    cancelled([{ task_id: 7829, from_user_id: 171937, thread_id: 21504, to_name: 'ნინო კახიძე' }]);

    await withdrawAsksToOptedOutPerson('171938');

    expect(mockLanguage).toHaveBeenCalledWith('171937');
    // Declined, not hyphenated: „კახიძე" → „კახიძისთვის".
    expect(String(mockSave.mock.calls[0][3])).toContain('კახიძისთვის');
  });

  /**
   * Row 148's lesson in a third place. A goal that wrote to this person twice
   * — ordinary since ticket 9 task 12 — has two rows here, and two identical
   * withdrawals in the same second read as a fault rather than as courtesy.
   */
  it('says it once per goal, however many questions were out', async () => {
    cancelled([
      { task_id: 7829, from_user_id: 171937, thread_id: 21504, to_name: 'Netai Test 8' },
      { task_id: 7829, from_user_id: 171937, thread_id: 21504, to_name: 'Netai Test 8' },
    ]);

    const n = await withdrawAsksToOptedOutPerson('171938');

    // Both are cancelled; the sentence is said once.
    expect(n).toBe(2);
    expect(mockSave).toHaveBeenCalledTimes(1);
  });

  it('tells each goal separately when two of them were asking', async () => {
    cancelled([
      { task_id: 7829, from_user_id: 171937, thread_id: 21504, to_name: 'Netai Test 8' },
      { task_id: 7830, from_user_id: 171939, thread_id: 21600, to_name: 'Netai Test 8' },
    ]);

    await withdrawAsksToOptedOutPerson('171938');

    expect(mockSave.mock.calls.map((call) => call[0])).toEqual([21504, 21600]);
  });

  it('says nothing when there is no thread to say it in, and still cancels', async () => {
    cancelled([{ task_id: 7829, from_user_id: 171937, thread_id: null, to_name: 'Netai Test 8' }]);

    expect(await withdrawAsksToOptedOutPerson('171938')).toBe(1);
    expect(mockSave).not.toHaveBeenCalled();
  });

  /** «I have withdrawn your question to » with a blank name is not a sentence. */
  it('says nothing rather than naming nobody', async () => {
    cancelled([{ task_id: 7829, from_user_id: 171937, thread_id: 21504, to_name: null }]);

    expect(await withdrawAsksToOptedOutPerson('171938')).toBe(1);
    expect(mockSave).not.toHaveBeenCalled();
  });
});
