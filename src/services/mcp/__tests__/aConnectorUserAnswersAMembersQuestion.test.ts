jest.mock('../../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));
jest.mock('../../taskAsks.service', () => ({
  __esModule: true,
  sendApprovedAskAnswer: jest.fn(),
}));

import { query } from '../../../db/postgres/client';
import { sendApprovedAskAnswer } from '../../taskAsks.service';
import { answerMemberQuestion, askIdOf } from '../answerMemberQuestion';

/**
 * 1256: check_my_inbox lists what another member asked this user, with an
 * ask_id, and the connector had no way to answer it. The answer now goes
 * through the app's own path, for the ask's recipient only.
 */
const mockQuery = query as jest.MockedFunction<typeof query>;
const mockSend = sendApprovedAskAnswer as jest.MockedFunction<typeof sendApprovedAskAnswer>;
const RECIPIENT = '183656';
const ASK_THREAD = 9101;

function threadRows(ids: number[]): { rows: Array<{ ask_thread_id: number }>; rowCount: number } {
  return { rows: ids.map((id) => ({ ask_thread_id: id })), rowCount: ids.length };
}

describe('answer_member_question', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSend.mockResolvedValue({ sent: true });
  });

  it('sends the confirmed answer on the ask’s own thread', async () => {
    mockQuery.mockResolvedValue(threadRows([ASK_THREAD]) as never);
    const result = await answerMemberQuestion(RECIPIENT, {
      ask_id: '4410',
      answer: 'კი, ნინოს ვიცნობ, 599 00 00 00',
      confirmed: true,
    });
    expect(result).toEqual({ sent: true });
    expect(mockQuery.mock.calls[0][1]).toEqual([4410, RECIPIENT]);
    expect(mockSend).toHaveBeenCalledWith(RECIPIENT, ASK_THREAD, 'კი, ნინოს ვიცნობ, 599 00 00 00');
  });

  it('sends nothing without confirmed=true', async () => {
    const result = await answerMemberQuestion(RECIPIENT, { ask_id: '4410', answer: 'კი' });
    expect(result.sent).toBe(false);
    expect(mockQuery).not.toHaveBeenCalled();
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('sends nothing for an ask that is not this user’s, or not the latest round', async () => {
    mockQuery.mockResolvedValue(threadRows([]) as never);
    const result = await answerMemberQuestion(RECIPIENT, {
      ask_id: '4410',
      answer: 'კი',
      confirmed: true,
    });
    expect(result.sent).toBe(false);
    expect(result.error).toContain('check_my_inbox');
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('passes the app path’s refusal on unchanged', async () => {
    mockQuery.mockResolvedValue(threadRows([ASK_THREAD]) as never);
    mockSend.mockResolvedValue({ sent: false, already_delivered: true, error: 'already' });
    const result = await answerMemberQuestion(RECIPIENT, {
      ask_id: '4410',
      answer: 'კი',
      confirmed: true,
    });
    expect(result).toEqual({ sent: false, already_delivered: true, error: 'already' });
  });

  it('propagates a failed read instead of claiming a send', async () => {
    mockQuery.mockRejectedValue(new Error('statement timeout'));
    await expect(
      answerMemberQuestion(RECIPIENT, { ask_id: '4410', answer: 'კი', confirmed: true }),
    ).rejects.toThrow('statement timeout');
    expect(mockSend).not.toHaveBeenCalled();
  });
});

describe('askIdOf', () => {
  it('reads a plain positive id and refuses anything else', () => {
    expect(askIdOf(' 4410 ')).toBe(4410);
    expect(askIdOf('ask_4410')).toBeNull();
    expect(askIdOf('0')).toBeNull();
    expect(askIdOf(undefined)).toBeNull();
  });
});
