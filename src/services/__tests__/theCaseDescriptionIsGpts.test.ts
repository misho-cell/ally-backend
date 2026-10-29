const mockQuery = jest.fn();
jest.mock('../../db/postgres/client', () => ({ query: (...a: unknown[]) => mockQuery(...a) }));
const mockClaude = jest.fn();
jest.mock('../../config/anthropic', () => ({
  __esModule: true,
  default: { messages: { create: (...a: unknown[]) => mockClaude(...a) } },
}));
const mockGpt = jest.fn();
jest.mock('../../config/openai', () => ({
  openaiClient: () => ({ chat: { completions: { create: (...a: unknown[]) => mockGpt(...a) } } }),
}));
jest.mock('../finalAnswer.service', () => ({
  finalAnswerModel: () => 'gpt-test',
  toLedgerUsage: () => ({ input_tokens: 1, output_tokens: 1 }),
}));
const mockRecord = jest.fn().mockResolvedValue(undefined);
jest.mock('../costLedger.service', () => ({
  recordClaudeUsage: (...a: unknown[]) => mockRecord(...a),
}));
jest.mock('../sse.service', () => ({ emitThreadUpdated: jest.fn() }));

import { refreshCaseDescription } from '../caseDescriptionWriter.service';

/**
 * Misho, 29 Oct: the case description is written by the same GPT model as the
 * chat's answers; the small Claude model only when GPT gives nothing usable.
 */
const GOOD = 'შენ ეძებ კედლის მლესავ ოსტატს ახალი რესტორნის რემონტისთვის.';

beforeEach(() => {
  jest.clearAllMocks();
  mockQuery
    .mockResolvedValueOnce({ rows: [{ title: 'საჭიროა კედლის მლესავი' }] })
    .mockResolvedValueOnce({ rows: [{ role: 'user', content: 'კედლის მლესავი მჭირდება' }] })
    .mockResolvedValue({ rows: [] });
});

describe('the case description (Misho, 29 Oct)', () => {
  it('is written by the chat’s GPT model and booked as OpenAI', async () => {
    mockGpt.mockResolvedValue({ choices: [{ message: { content: GOOD } }], usage: {} });
    expect(await refreshCaseDescription('7', 9, true)).toBe(true);
    expect(mockGpt.mock.calls[0][0].model).toBe('gpt-test');
    expect(mockClaude).not.toHaveBeenCalled();
    expect(mockRecord.mock.calls[0][0]).toMatchObject({ provider: 'openai', model: 'gpt-test' });
    expect(mockQuery.mock.calls[2][1][1]).toBe(GOOD);
  });

  it('falls back to Claude when GPT fails', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    mockGpt.mockRejectedValue(new Error('down'));
    mockClaude.mockResolvedValue({ content: [{ type: 'text', text: GOOD }], usage: {} });
    expect(await refreshCaseDescription('7', 9, true)).toBe(true);
    expect(mockClaude).toHaveBeenCalledTimes(1);
  });
});
