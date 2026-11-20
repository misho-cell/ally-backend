/**
 * Misho, 20 Nov: GPT makes the run's decisions, not only the last answer
 * (GPT_RUNS_AGENT=true). Each main step crosses to OpenAI's Responses API and
 * back in Claude's shape; a step GPT cannot take is Claude's.
 */
const mockCreate = jest.fn();
jest.mock('../../config/openai', () => ({
  openaiClient: () => ({ responses: { create: (...a: unknown[]) => mockCreate(...a) } }),
}));

import type Anthropic from '@anthropic-ai/sdk';
import type OpenAI from 'openai';
import {
  agentModel,
  gptAgentStep,
  gptRunsTheAgent,
  pairedCalls,
  toAnthropicMessage,
  toFunctionTools,
  toInputItems,
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

function textItem(text: string): OpenAI.Responses.ResponseOutputItem {
  return {
    type: 'message',
    id: 'msg_1',
    role: 'assistant',
    status: 'completed',
    content: [{ type: 'output_text', text, annotations: [] }],
  } as unknown as OpenAI.Responses.ResponseOutputItem;
}

function callItem(callId: string, name: string, args: string): OpenAI.Responses.ResponseOutputItem {
  return {
    type: 'function_call',
    call_id: callId,
    name,
    arguments: args,
  } as OpenAI.Responses.ResponseOutputItem;
}

function response(
  output: OpenAI.Responses.ResponseOutputItem[],
  status = 'completed',
): OpenAI.Responses.Response {
  return {
    id: 'resp_1',
    status,
    incomplete_details: null,
    output,
    usage: {
      input_tokens: 100,
      input_tokens_details: { cached_tokens: 40 },
      output_tokens: 20,
      total_tokens: 120,
    },
  } as unknown as OpenAI.Responses.Response;
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
    expect(toFunctionTools([SEARCH_TOOL, { name: 'web_search' }])).toEqual([
      {
        type: 'function',
        name: 'search_network',
        description: 'Search the network.',
        parameters: SEARCH_TOOL.input_schema,
        strict: false,
      },
    ]);
  });

  it('carries the calls and what they found as calls and outputs', () => {
    const items = toInputItems('შენ ხარ ასისტენტი.', HISTORY);
    expect(items).toEqual([
      { role: 'system', content: 'შენ ხარ ასისტენტი.' },
      { role: 'user', content: 'ვინ იცნობს ბუღალტერს?' },
      { role: 'assistant', content: 'ვეძებ.' },
      {
        type: 'function_call',
        call_id: 'toolu_1',
        name: 'search_network',
        arguments: '{"query":"ბუღალტერი"}',
      },
      { type: 'function_call_output', call_id: 'toolu_1', output: 'Nino Beridze — ბუღალტერი' },
    ]);
  });

  it('gives a call without an output a „no result" line, and a lone output becomes text', () => {
    const out = pairedCalls([
      { type: 'function_call', call_id: 'a', name: 'x', arguments: '{}' },
      { role: 'user', content: 'შემდეგი' },
      { type: 'function_call_output', call_id: 'zzz', output: 'stray' },
    ]);
    expect(out).toEqual([
      { type: 'function_call', call_id: 'a', name: 'x', arguments: '{}' },
      {
        type: 'function_call_output',
        call_id: 'a',
        output: 'No result was returned for this call.',
      },
      { role: 'user', content: 'შემდეგი' },
      { role: 'user', content: '[result] stray' },
    ]);
  });

  it('returns GPT’s tool call as Claude’s tool_use, with the cache counted apart', () => {
    const msg = toAnthropicMessage(
      response([callItem('call_9', 'search_network', '{"query":"იურისტი"}')]),
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
      response([textItem('Nino Beridze ბუღალტერია, მას იცნობ.')]),
      'gpt-6.2-sol',
      'ka',
    );
    expect(msg?.stop_reason).toBe('end_turn');
    expect(msg?.content).toEqual([
      { type: 'text', text: 'Nino Beridze ბუღალტერია, მას იცნობ.', citations: null },
    ]);
  });

  it('takes an empty answer as an answer: a scheduled check may have nothing to say (20 Nov 17:10Z)', () => {
    const msg = toAnthropicMessage(response([]), 'm', 'ka');
    expect(msg?.content).toEqual([]);
    expect(msg?.stop_reason).toBe('end_turn');
  });

  it('will not stand in for Claude with broken arguments, the wrong alphabet or a failure', () => {
    expect(toAnthropicMessage(response([callItem('c', 'x', '{bad')]), 'm', 'ka')).toBeNull();
    const english =
      'This answer is written entirely in English and carries no Georgian letter at all, so it is refused.';
    expect(toAnthropicMessage(response([textItem(english)]), 'm', 'ka')).toBeNull();
    expect(toAnthropicMessage(response([textItem('კარგი.')], 'failed'), 'm', 'ka')).toBeNull();
  });

  it('forces a text turn as tool_choice none and a named tool as that function, stored nowhere', async () => {
    mockCreate.mockResolvedValue(response([textItem('კარგი, ვწერ.')]));
    await gptAgentStep({ ...REQUEST, forceText: true });
    expect(mockCreate.mock.calls[0][0]).toMatchObject({
      model: 'gpt-6.2-sol',
      store: false,
      tool_choice: 'none',
      max_output_tokens: 1000,
    });
    await gptAgentStep({ ...REQUEST, forceTool: 'search_network' });
    expect(mockCreate.mock.calls[1][0].tool_choice).toEqual({
      type: 'function',
      name: 'search_network',
    });
    expect(typeof mockCreate.mock.calls[1][1].timeout).toBe('number');
  });

  it('hands the step to Claude when the call fails', async () => {
    mockCreate.mockRejectedValue(new Error('overloaded'));
    jest.spyOn(console, 'error').mockImplementation(() => {});
    await expect(gptAgentStep(REQUEST)).resolves.toBeNull();
  });
});
