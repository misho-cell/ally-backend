/**
 * Misho, 20 Nov: GPT makes the run's decisions, not only the last answer
 * (GPT_RUNS_AGENT=true). Each main step crosses to OpenAI and back in Claude's
 * shape; a step GPT cannot take is Claude's.
 */
const mockCreate = jest.fn();
jest.mock('../../config/openai', () => ({
  openaiClient: () => ({
    chat: { completions: { create: (...a: unknown[]) => mockCreate(...a) } },
  }),
}));

import type Anthropic from '@anthropic-ai/sdk';
import type OpenAI from 'openai';
import {
  agentModel,
  gptAgentStep,
  gptRunsTheAgent,
  pairedCalls,
  toAnthropicMessage,
  toChatMessages,
  toChatTools,
} from '../gptAgentStep.service';

const SEARCH_TOOL = {
  name: 'search_network',
  description: 'Search the network.',
  input_schema: { type: 'object', properties: { query: { type: 'string' } } },
};
const HISTORY: Anthropic.MessageParam[] = [
  { role: 'user', content: 'ვინ იცნობს ბუღალტერს?' },
  {
    role: 'assistant',
    content: [
      { type: 'text', text: 'ვეძებ.' },
      { type: 'tool_use', id: 'toolu_1', name: 'search_network', input: { query: 'ბუღალტერი' } },
    ],
  },
  {
    role: 'user',
    content: [{ type: 'tool_result', tool_use_id: 'toolu_1', content: 'Nino Beridze — ბუღალტერი' }],
  },
];
const REQUEST = {
  messages: HISTORY,
  systemPrompt: 'შენ ხარ ასისტენტი.',
  tools: [SEARCH_TOOL],
  maxTokens: 1000,
  forceText: false,
  language: 'ka',
};

function completion(
  message: Partial<OpenAI.Chat.Completions.ChatCompletionMessage>,
  finish = 'stop',
): OpenAI.Chat.Completions.ChatCompletion {
  return {
    id: 'chatcmpl-1',
    object: 'chat.completion',
    created: 0,
    model: 'gpt-6.2-sol',
    choices: [
      {
        index: 0,
        finish_reason: finish,
        logprobs: null,
        message: { role: 'assistant', content: null, refusal: null, ...message },
      },
    ],
    usage: {
      prompt_tokens: 100,
      completion_tokens: 20,
      total_tokens: 120,
      prompt_tokens_details: { cached_tokens: 40 },
    },
  } as OpenAI.Chat.Completions.ChatCompletion;
}

beforeEach(() => {
  mockCreate.mockReset();
  process.env.CHAT_AGENT_MODEL = 'gpt-6.2-sol';
  delete process.env.GPT_RUNS_AGENT;
});

describe('GPT makes the decisions', () => {
  it('is off unless GPT_RUNS_AGENT=true, and uses CHAT_AGENT_MODEL', () => {
    expect(gptRunsTheAgent()).toBe(false);
    process.env.GPT_RUNS_AGENT = 'true';
    expect(gptRunsTheAgent()).toBe(true);
    process.env.CHAT_AGENT_MODEL = 'gpt-6.2-astra';
    expect(agentModel()).toBe('gpt-6.2-astra');
  });

  it('offers the run’s tools as functions, leaving out one without a schema', () => {
    const tools = toChatTools([SEARCH_TOOL, { name: 'web_search' }]);
    expect(tools).toEqual([
      {
        type: 'function',
        function: {
          name: 'search_network',
          description: 'Search the network.',
          parameters: SEARCH_TOOL.input_schema,
        },
      },
    ]);
  });

  it('carries the calls and what they found as calls and results', () => {
    const sent = toChatMessages('შენ ხარ ასისტენტი.', HISTORY);
    expect(sent.map((m) => m.role)).toEqual(['system', 'user', 'assistant', 'tool']);
    expect(sent[2]).toMatchObject({
      content: 'ვეძებ.',
      tool_calls: [
        { id: 'toolu_1', function: { name: 'search_network', arguments: '{"query":"ბუღალტერი"}' } },
      ],
    });
    expect(sent[3]).toEqual({
      role: 'tool',
      tool_call_id: 'toolu_1',
      content: 'Nino Beridze — ბუღალტერი',
    });
  });

  it('gives a call without a result a „no result" line, and a lone result becomes text', () => {
    const out = pairedCalls([
      {
        role: 'assistant',
        content: null,
        tool_calls: [{ id: 'a', type: 'function', function: { name: 'x', arguments: '{}' } }],
      },
      { role: 'user', content: 'შემდეგი' },
      { role: 'tool', tool_call_id: 'zzz', content: 'stray' },
    ]);
    expect(out.map((m) => m.role)).toEqual(['assistant', 'tool', 'user', 'user']);
    expect(out[3]).toEqual({ role: 'user', content: '[result] stray' });
  });

  it('returns GPT’s tool call as Claude’s tool_use, with the cache counted apart', () => {
    const msg = toAnthropicMessage(
      completion(
        {
          tool_calls: [
            {
              id: 'call_9',
              type: 'function',
              function: { name: 'search_network', arguments: '{"query":"იურისტი"}' },
            },
          ],
        },
        'tool_calls',
      ),
      'gpt-6.2-sol',
      'ka',
    );
    expect(msg?.stop_reason).toBe('tool_use');
    expect(msg?.content).toEqual([
      {
        type: 'tool_use',
        id: 'call_9',
        name: 'search_network',
        input: { query: 'იურისტი' },
        caller: { type: 'direct' },
      },
    ]);
    expect(msg?.usage).toMatchObject({
      input_tokens: 60,
      cache_read_input_tokens: 40,
      output_tokens: 20,
    });
  });

  it('returns GPT’s answer as Claude’s text, ending the turn', () => {
    const msg = toAnthropicMessage(
      completion({ content: 'Nino Beridze ბუღალტერია, მას გიცნობს.' }),
      'gpt-6.2-sol',
      'ka',
    );
    expect(msg?.stop_reason).toBe('end_turn');
    expect(msg?.content).toEqual([
      { type: 'text', text: 'Nino Beridze ბუღალტერია, მას გიცნობს.', citations: null },
    ]);
  });

  it('will not stand in for Claude with an empty answer, broken arguments or the wrong alphabet', () => {
    expect(toAnthropicMessage(completion({ content: '' }), 'm', 'ka')).toBeNull();
    const broken = completion({
      tool_calls: [{ id: 'c', type: 'function', function: { name: 'x', arguments: '{bad' } }],
    });
    expect(toAnthropicMessage(broken, 'm', 'ka')).toBeNull();
    const english =
      'This answer is written entirely in English and carries no Georgian letter at all, so it is refused.';
    expect(toAnthropicMessage(completion({ content: english }), 'm', 'ka')).toBeNull();
  });

  it('forces a text turn as tool_choice none and a named tool as that function', async () => {
    mockCreate.mockResolvedValue(completion({ content: 'კარგი, ვწერ.' }));
    await gptAgentStep({ ...REQUEST, forceText: true });
    expect(mockCreate.mock.calls[0][0]).toMatchObject({
      model: 'gpt-6.2-sol',
      tool_choice: 'none',
      max_completion_tokens: 1000,
    });
    await gptAgentStep({ ...REQUEST, forceTool: 'search_network' });
    expect(mockCreate.mock.calls[1][0].tool_choice).toEqual({
      type: 'function',
      function: { name: 'search_network' },
    });
    expect(typeof mockCreate.mock.calls[1][1].timeout).toBe('number');
  });

  it('hands the step to Claude when the call fails', async () => {
    mockCreate.mockRejectedValue(new Error('overloaded'));
    jest.spyOn(console, 'error').mockImplementation(() => {});
    await expect(gptAgentStep(REQUEST)).resolves.toBeNull();
  });
});
