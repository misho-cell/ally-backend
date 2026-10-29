jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));
const mockRecordFixed = jest.fn().mockResolvedValue(undefined);
const mockRecordUsage = jest.fn().mockResolvedValue(undefined);
jest.mock('../costLedger.service', () => ({
  __esModule: true,
  recordFixedUsage: (...a: unknown[]) => mockRecordFixed(...a),
  recordClaudeUsage: (...a: unknown[]) => mockRecordUsage(...a),
}));
jest.mock('../tools/webSearchProvider', () => ({
  ...jest.requireActual('../tools/webSearchProvider'),
  webSearchLedger: jest.fn().mockResolvedValue({ provider: 'gemini', priceKey: 'gemini.search' }),
}));
const mockLog = jest.fn().mockResolvedValue(undefined);
jest.mock('../toolCallLog.service', () => ({
  __esModule: true,
  logToolCall: (...a: unknown[]) => mockLog(...a),
}));
const mockCreate = jest.fn();
jest.mock('../../config/openai', () => ({
  openaiClient: () => (process.env.OPENAI_API_KEY ? { responses: { create: mockCreate } } : null),
}));
jest.mock('../finalAnswer.service', () => ({
  finalAnswerModel: () => process.env.CHAT_FINAL_ANSWER_MODEL ?? '',
}));

import OpenAI from 'openai';
import { citedPages, responseUsage } from '../tools/openaiWebSearch';
import { withoutInlineLinks } from '../worldAnswer';
import { askTheWorld, WorldAnswerEngine } from '../worldAnswer.service';

/**
 * #8350 (tester 78145: stage 1 never posted while Gemini refuses every call):
 * when Gemini itself fails, the chat's GPT model answers with OpenAI's web
 * search, under the same pages-or-nothing rule.
 */
const PAGE = 'https://city.example.ge/transport';
const TEXT =
  'Nino Example heads the City Transport Service ([city.example.ge](https://city.example.ge/transport)).\n' +
  'PEOPLE: Nino Example | Head | City Transport Service';

function gptResponse(text: string, cited: boolean): OpenAI.Responses.Response {
  return {
    output_text: text,
    output: [
      {
        type: 'message',
        content: [
          {
            type: 'output_text',
            text,
            annotations: cited
              ? [{ type: 'url_citation', url: PAGE, title: 'City', start_index: 0, end_index: 1 }]
              : [],
          },
        ],
      },
    ],
    usage: { input_tokens: 100, output_tokens: 20, input_tokens_details: { cached_tokens: 40 } },
  } as unknown as OpenAI.Responses.Response;
}

const run = { userId: '7', runId: 'r1', threadId: 9 };

beforeEach(() => {
  jest.clearAllMocks();
  process.env.OPENAI_API_KEY = 'test';
  process.env.CHAT_FINAL_ANSWER_MODEL = 'gpt-test';
  process.env.GEMINI_API_KEY = 'test-key';
});

afterEach(() => {
  delete process.env.OPENAI_API_KEY;
  delete process.env.CHAT_FINAL_ANSWER_MODEL;
  delete process.env.GEMINI_API_KEY;
  jest.restoreAllMocks();
});

describe('the GPT answer read back', () => {
  it('keeps each cited page once, and books cached tokens apart', () => {
    expect(citedPages(gptResponse(TEXT, true))).toEqual([
      { title: 'City', url: PAGE, snippet: '' },
    ]);
    expect(responseUsage(gptResponse(TEXT, true).usage)).toMatchObject({
      input_tokens: 60,
      output_tokens: 20,
      cache_read_input_tokens: 40,
    });
  });

  it('shows the answer without the links written into it', () => {
    expect(withoutInlineLinks('A heads B ([b.ge](https://b.ge/x)). See [B](https://b.ge).')).toBe(
      'A heads B. See B.',
    );
  });
});

describe('asking the world when Gemini fails (#8350)', () => {
  it('asks GPT after Gemini is refused, and logs which engine answered', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 403,
      text: async () => 'billing',
    } as unknown as Response);
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    mockCreate.mockResolvedValue(gptResponse(TEXT, true));
    const answer = await askTheWorld(run, 'Who heads the city transport service?', 'en');
    expect(answer?.text).toBe('Nino Example heads the City Transport Service.');
    expect(answer?.people[0].name).toBe('Nino Example');
    expect(mockCreate.mock.calls[0][0]).toMatchObject({ tools: [{ type: 'web_search' }] });
    expect(mockLog.mock.calls[0][0].input.engine).toBe(WorldAnswerEngine.OpenAi);
    expect(mockRecordUsage.mock.calls[0][0]).toMatchObject({
      provider: 'openai',
      kind: 'web_search',
    });
  });

  it('shows nothing when GPT cites no page', async () => {
    delete process.env.GEMINI_API_KEY;
    mockCreate.mockResolvedValue(gptResponse(TEXT, false));
    expect(await askTheWorld(run, 'Who heads the city transport service?', 'en')).toBeNull();
  });

  it('never throws: both engines failing is no answer', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('network down'));
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    mockCreate.mockRejectedValue(new Error('429'));
    expect(await askTheWorld(run, 'Who heads the city transport service?', 'en')).toBeNull();
  });
});
