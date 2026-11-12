const mockProcessChat = jest.fn();
const mockEmit = jest.fn();
jest.mock('../chat.service', () => ({
  processChat: (...args: unknown[]) => mockProcessChat(...args),
}));
jest.mock('../sse.service', () => ({
  emitRunComplete: (...args: unknown[]) => mockEmit(...args),
}));

import { answerEventBody, tellTheAnswerInTheChat } from '../introAnswerInChat';

/**
 * Lika's podcast test (12 Nov, E13): the person asked said yes and wrote what
 * the asker wanted to know; the asker read only „he agreed", because the
 * request had no goal to carry the answer. It is now told, in its own words,
 * in the conversation the request was sent from.
 */
describe('an answer to a request with no goal behind it', () => {
  const answer = 'ახალი ტექნოლოგიური პოდკასტია, YouTube-ზე, ონლაინ, დაახლოებით 40 წუთი.';
  const input = {
    requesterUserId: '7',
    originThreadId: 83,
    answeredBy: 'ნიკა',
    accepted: true,
    answer,
  };

  beforeEach(() => {
    mockProcessChat.mockReset();
    mockEmit.mockReset();
  });

  it('carries every fact to the run, and asks for it in the run’s own words', () => {
    const body = answerEventBody(input);
    expect(body).toContain(answer);
    expect(body).toContain('დათანხმდა');
    expect(body).toContain('ციტატის გარეშე');
  });

  it('runs the conversation it was asked from, once', async () => {
    mockProcessChat.mockResolvedValue({ reply: 'ნიკა დათანხმდა.' });
    await expect(tellTheAnswerInTheChat(input)).resolves.toBe(true);
    expect(mockProcessChat).toHaveBeenCalledTimes(1);
    const [userId, threadId, line] = mockProcessChat.mock.calls[0] as [string, number, string];
    expect([userId, threadId]).toEqual(['7', 83]);
    expect(line.startsWith('[მოვლენა] ')).toBe(true);
    expect(mockEmit).toHaveBeenCalledTimes(1);
  });

  it('runs nothing with no conversation or nothing to tell', async () => {
    await expect(tellTheAnswerInTheChat({ ...input, originThreadId: null })).resolves.toBe(false);
    await expect(tellTheAnswerInTheChat({ ...input, answer: '  ' })).resolves.toBe(false);
    expect(mockProcessChat).not.toHaveBeenCalled();
  });
});
