jest.mock('../../db/postgres/client', () => ({ query: jest.fn(), __esModule: true }));
jest.mock('../threads.service', () => ({
  __esModule: true,
  saveThreadMessage: jest.fn().mockResolvedValue(undefined),
  createThread: jest.fn().mockResolvedValue({ id: 1 }),
  userLanguage: jest.fn().mockResolvedValue('en'),
}));
jest.mock('../threadStatus.service', () => ({
  __esModule: true,
  setThreadStatus: jest.fn().mockResolvedValue(undefined),
}));

import { query } from '../../db/postgres/client';
import { saveThreadMessage, userLanguage } from '../threads.service';
import { setThreadStatus } from '../threadStatus.service';
import { cancelAsksForTask } from '../taskAsks.service';

const mockQuery = query as jest.MockedFunction<typeof query>;
const mockSave = saveThreadMessage as jest.MockedFunction<typeof saveThreadMessage>;
const mockLanguage = userLanguage as jest.MockedFunction<typeof userLanguage>;

/** The close runs two statements: cancel the unanswered, then read the answered. */
function closing(opts: { cancelled?: unknown[]; answered?: unknown[] }): void {
  mockQuery.mockImplementation((sql: string) => {
    const text = String(sql);
    if (text.includes("SET status = 'cancelled'")) {
      const rows = opts.cancelled ?? [];
      return Promise.resolve({ rows, rowCount: rows.length } as never);
    }
    if (text.includes("ta.status = 'answered'")) {
      const rows = opts.answered ?? [];
      return Promise.resolve({ rows, rowCount: rows.length } as never);
    }
    return Promise.resolve({ rows: [], rowCount: 0 } as never);
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockLanguage.mockResolvedValue('en');
});

/**
 * ROW 233's OTHER HALF, and the seat put it better than the row did.
 *
 * One goal closed at 10:32:58 on 22 September:
 *
 *   10:32:57  Netai Test 7, who NEVER ANSWERED, got „this question is no
 *             longer needed, no reply necessary. Thank you!" and went to done
 *   10:32:19  Netai Test 9, who DID answer, last heard anything at the moment
 *             he sent it. Nothing at the finish. Nothing since.
 *
 * „The person who ignored the question is thanked, and the person who actually
 * helped is not."
 */
describe('closing a goal thanks the people who answered it', () => {
  it('writes to the answerer’s thread, naming who asked', async () => {
    closing({
      answered: [{ ask_thread_id: 21720, to_user_id: 171940, asker_name: 'Netai Test 7' }],
    });

    await cancelAsksForTask(7829);

    const [threadId, userId, role, text] = mockSave.mock.calls[0];
    expect(threadId).toBe(21720);
    expect(userId).toBe(171940);
    expect(role).toBe('assistant');
    expect(String(text)).toContain('Netai Test 7');
    expect(String(text)).toContain('Thank you');
  });

  /**
   * The seat wrote TWO lines — one for „your answer is what settled it" and
   * one for „they got there another way" — and were right that no single line
   * honestly carries both. But nothing records which it was: `tasks` has no
   * link from its result to an ask, and `record_debrief_outcome` is asked
   * three days later, after this has to be said.
   *
   * So the clause neither of us can support is absent, rather than guessed.
   */
  it('claims nothing about whether their answer was the one used', async () => {
    closing({
      answered: [{ ask_thread_id: 21720, to_user_id: 171940, asker_name: 'Netai Test 7' }],
    });

    await cancelAsksForTask(7829);

    const text = String(mockSave.mock.calls[0][3]).toLowerCase();
    expect(text).not.toContain('settled');
    expect(text).not.toContain('another way');
    expect(text).not.toContain('recommendation');
  });

  it('in the ANSWERER’s language — they are a stranger doing somebody a favour', async () => {
    mockLanguage.mockResolvedValue('ka');
    closing({
      answered: [{ ask_thread_id: 21720, to_user_id: 171940, asker_name: 'ნინო კახიძე' }],
    });

    await cancelAsksForTask(7829);

    expect(mockLanguage).toHaveBeenCalledWith('171940');
    // Declined, not hyphenated: „კახიძე" in the ergative is „კახიძემ".
    expect(String(mockSave.mock.calls[0][3])).toContain('კახიძემ');
  });

  /**
   * Row 148's rule, and a relayed conversation deliberately continues in ONE
   * thread — so a goal that asked the same person twice has two rows pointing
   * at one chat, and two identical thank-yous in the same second read as a
   * fault rather than as courtesy.
   */
  it('thanks each person once, however many questions they answered', async () => {
    closing({
      answered: [
        { ask_thread_id: 21720, to_user_id: 171940, asker_name: 'Netai Test 7' },
        { ask_thread_id: 21720, to_user_id: 171940, asker_name: 'Netai Test 7' },
      ],
    });

    await cancelAsksForTask(7829);

    expect(mockSave).toHaveBeenCalledTimes(1);
  });

  it('leaves their thread’s state alone — the answer already closed it', async () => {
    closing({
      answered: [{ ask_thread_id: 21720, to_user_id: 171940, asker_name: 'Netai Test 7' }],
    });

    await cancelAsksForTask(7829);

    expect(setThreadStatus).not.toHaveBeenCalled();
  });

  it('says nothing when nobody answered', async () => {
    closing({ answered: [] });

    await cancelAsksForTask(7829);

    expect(mockSave).not.toHaveBeenCalled();
  });

  /**
   * The apology to the people who did NOT answer is the half that already
   * worked, and it must keep working: this runs after it, not instead of it.
   */
  it('still apologises to the people who never answered', async () => {
    closing({
      cancelled: [{ ask_thread_id: 21721, to_user_id: 171938 }],
      answered: [{ ask_thread_id: 21720, to_user_id: 171940, asker_name: 'Netai Test 7' }],
    });

    const n = await cancelAsksForTask(7829);

    expect(n).toBe(1);
    expect(mockSave.mock.calls.map((call) => call[0]).sort()).toEqual([21720, 21721]);
    expect(setThreadStatus).toHaveBeenCalledWith('171938', 21721, 'done', { isTask: true });
  });

  /** A close must never fail because a thank-you could not be written. */
  it('does not throw when the thank-you cannot be written', async () => {
    const quiet = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockQuery.mockImplementation((sql: string) => {
      if (String(sql).includes("ta.status = 'answered'")) return Promise.reject(new Error('down'));
      return Promise.resolve({ rows: [], rowCount: 0 } as never);
    });

    await expect(cancelAsksForTask(7829)).resolves.toBe(0);

    expect(quiet).toHaveBeenCalled();
    quiet.mockRestore();
  });
});
