/**
 * Alert 859 (23 Nov) and a second member (24 Nov): the router read only the
 * goal's title and never what the member had just been shown, so a reminder on
 * the goal, an answer to the run's own question and „the goals later, find the
 * B2B person first" each opened a new conversation and a duplicate goal.
 */
const mockCreate = jest.fn();
const mockOpenGoal = jest.fn();
const mockCreateThread = jest.fn();
const mockQuery = jest.fn();
jest.mock('../../config/anthropic', () => ({
  __esModule: true,
  default: { messages: { create: (...a: unknown[]) => mockCreate(...a) } },
}));
jest.mock('../costLedger.service', () => ({ recordClaudeUsage: async () => undefined }));
jest.mock('../taskStore.service', () => ({
  getOpenTaskByThread: (...a: unknown[]) => mockOpenGoal(...a),
}));
jest.mock('../threads.service', () => ({
  createThread: (...a: unknown[]) => mockCreateThread(...a),
}));
jest.mock('../whatsappReplies.service', () => ({ labelWhatsappThread: () => undefined }));
jest.mock('../../db/postgres/client', () => ({
  __esModule: true,
  query: (...a: unknown[]) => mockQuery(...a),
}));

import {
  conversationForLine,
  goalText,
  lastLinesShown,
  routerInput,
} from '../whatsappRouting.service';

const THREAD = 61000;
const said = (word: string): unknown => ({
  content: [{ type: 'text', text: word }],
  usage: { input_tokens: 10, output_tokens: 1 },
});
const readInput = (): string => String(mockCreate.mock.calls[0][0].messages[0].content);
const readPrompt = (): string => String(mockCreate.mock.calls[0][0].system);

beforeEach(() => {
  mockCreate.mockReset().mockResolvedValue(said('same_goal'));
  mockOpenGoal.mockReset();
  mockCreateThread.mockReset().mockResolvedValue({ id: 99 });
  mockQuery.mockReset();
});

describe('the router reads the goal as asked and what the member last saw', () => {
  it('describes the goal by its brief, else what was asked, else its title', () => {
    expect(
      goalText({
        title: 'we talked before, start over',
        description: 'meet the city architect',
        brief: null,
      }),
    ).toBe('meet the city architect');
    expect(goalText({ title: 'T', description: 'asked', brief: 'Goal: meet the architect' })).toBe(
      'Goal: meet the architect',
    );
    expect(goalText({ title: 'T', description: '  ', brief: null })).toBe('T');
  });

  it('reads the last answer and card the member saw, oldest first, never a progress caption', async () => {
    mockQuery.mockResolvedValue({ rows: [{ content: 'card' }, { content: 'answer' }] });
    await expect(lastLinesShown(THREAD)).resolves.toBe('answer\n\ncard');
    expect(mockQuery.mock.calls[0][1][1]).toEqual(['message', 'pending']);
    expect(typeof mockQuery.mock.calls[0][2]).toBe('number');
    mockQuery.mockRejectedValue(new Error('timeout'));
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(lastLinesShown(THREAD)).resolves.toBe('');
  });

  it('puts what was last shown between the goal and the line', () => {
    const input = routerInput('meet the architect', 'later', 'Shall I ask Nino?');
    expect(input).toBe(
      'OPEN GOAL: meet the architect\n\nLAST SHOWN: Shall I ask Nino?\n\nNEW LINE: later',
    );
    expect(routerInput('g', 'l')).toBe('OPEN GOAL: g\n\nNEW LINE: l');
  });

  it('tells the small model an answer to the last lines, or a reminder, is the same goal', async () => {
    mockOpenGoal.mockResolvedValue({
      id: 1,
      title: 'we talked before',
      description: 'a B2B sales lead',
      brief: null,
    });
    mockQuery.mockResolvedValue({
      rows: [{ content: '10 goals wait for your answer' }, { content: 'Ask Nino Beridze first?' }],
    });
    await expect(
      conversationForLine(7, THREAD, 'the goals later, let us find the B2B person first'),
    ).resolves.toBe(THREAD);
    expect(readInput()).toContain('OPEN GOAL: a B2B sales lead');
    expect(readInput()).toContain(
      'LAST SHOWN: Ask Nino Beridze first?\n\n10 goals wait for your answer',
    );
    expect(readPrompt()).toContain('answers or reacts to LAST SHOWN');
    expect(readPrompt()).toContain('remind, nudge or follow up');
    expect(mockCreateThread).not.toHaveBeenCalled();
  });

  it('still opens a new conversation for a need neither the goal nor the last lines are about', async () => {
    mockOpenGoal.mockResolvedValue({ id: 1, title: 'renovation', description: null, brief: null });
    mockQuery.mockResolvedValue({ rows: [{ content: 'Levan Japaridze has not answered yet.' }] });
    mockCreate.mockResolvedValue(said('new_request'));
    jest.spyOn(console, 'info').mockImplementation(() => {});
    await expect(conversationForLine(7, THREAD, 'a dance teacher for my kids')).resolves.toBe(99);
  });
});
