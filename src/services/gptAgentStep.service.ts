import type Anthropic from '@anthropic-ai/sdk';
import type OpenAI from 'openai';
import { openaiClient } from '../config/openai';
import { finalAnswerModel, unusableReason } from './finalAnswer.service';
import type { ClaudeUsage } from './costLedger.service';
import { plainSystemPrompt } from './systemPromptParts';

/**
 * Misho, 20 Nov: „მთავარი გადაწყვეტილებების მიღება გააკეთოს ჯიპიტიმ და არა მხოლოდ
 * პასუხის მიწერა". With GPT_RUNS_AGENT=true each main-model step of a chat run —
 * which tool to call, with what, and when to stop and answer — is GPT's. The
 * run loop is unchanged: this file translates the step it would have sent to
 * Claude into OpenAI's function-calling form and the reply back into Claude's
 * message shape, so every guard, tool and ledger row downstream works as before.
 *
 * The Responses API, not chat completions: the first live run (20 Nov, 15:28Z)
 * was refused on every step — „Function tools with reasoning_effort are not
 * supported for gpt-6.2-sol in /v1/chat/completions". A step that decides what
 * to do next is worth the model's reasoning, so it goes where tools and
 * reasoning go together.
 *
 * A failed, empty or unreadable GPT step returns null and that one step is
 * Claude's, as the final writer already does: a second provider must not be
 * able to lose a run.
 */
export function gptRunsTheAgent(): boolean {
  return process.env.GPT_RUNS_AGENT?.trim() === 'true';
}

/** CHAT_AGENT_MODEL when set, else the model that writes the answers. */
export function agentModel(): string {
  return process.env.CHAT_AGENT_MODEL?.trim() || finalAnswerModel();
}

const CLAUDE_PREFIX = 'claude';

/**
 * Task #40: the run's answered_by stamp said Claude whenever the agent's own
 * words stood, though with GPT_RUNS_AGENT those words were GPT's. A step GPT
 * took carries GPT's model; any Claude step keeps the run's own model name.
 */
export function stepWriter(step: Pick<Anthropic.Message, 'model'>, claudeModel: string): string {
  return step.model === '' || step.model.startsWith(CLAUDE_PREFIX) ? claudeModel : step.model;
}

const REQUEST_TIMEOUT_MS = 120_000;
const NO_RESULT = 'No result was returned for this call.';
const ID_PREFIX = 'gpt_';
const SAFE_ID_RE = /^[A-Za-z0-9_-]+$/u;
const MAX_OUTPUT_REASON = 'max_output_tokens';

type InputItem = OpenAI.Responses.ResponseInputItem;
type FunctionCall = OpenAI.Responses.ResponseFunctionToolCall;

interface Block {
  readonly type?: string;
  readonly text?: string;
  readonly id?: string;
  readonly name?: string;
  readonly input?: unknown;
  readonly tool_use_id?: string;
  readonly content?: unknown;
}

export interface AgentStepRequest {
  readonly messages: readonly Anthropic.MessageParam[];
  readonly systemPrompt: string;
  readonly tools: readonly { name: string; description?: string; input_schema?: unknown }[];
  readonly maxTokens: number;
  readonly forceText: boolean;
  readonly forceTool?: string;
  readonly language: string;
}

/** Pure: the run's tools as OpenAI functions; a tool without a schema is not one GPT can call. */
export function toFunctionTools(tools: AgentStepRequest['tools']): OpenAI.Responses.FunctionTool[] {
  return tools
    .filter((t) => typeof t.input_schema === 'object' && t.input_schema !== null)
    .map((t) => ({
      type: 'function' as const,
      name: t.name,
      description: t.description ?? '',
      parameters: t.input_schema as Record<string, unknown>,
      strict: false,
    }));
}

function blocksOf(content: Anthropic.MessageParam['content']): Block[] {
  return typeof content === 'string' ? [{ type: 'text', text: content }] : (content as Block[]);
}

function resultText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return JSON.stringify(content ?? null);
  return (content as Block[])
    .map((b) => (b.type === 'text' ? (b.text ?? '') : ''))
    .filter((t) => t !== '')
    .join('\n');
}

function joinedText(blocks: readonly Block[]): string {
  return blocks
    .filter((b) => b.type === 'text')
    .map((b) => b.text ?? '')
    .join('\n')
    .trim();
}

function assistantItems(blocks: readonly Block[]): InputItem[] {
  const text = joinedText(blocks);
  const calls: InputItem[] = blocks
    .filter((b) => b.type === 'tool_use')
    .map((b) => ({
      type: 'function_call' as const,
      call_id: b.id ?? '',
      name: b.name ?? '',
      arguments: JSON.stringify(b.input ?? {}),
    }));
  return text === '' ? calls : [{ role: 'assistant', content: text }, ...calls];
}

function userItems(blocks: readonly Block[]): InputItem[] {
  const results: InputItem[] = blocks
    .filter((b) => b.type === 'tool_result')
    .map((b) => ({
      type: 'function_call_output' as const,
      call_id: b.tool_use_id ?? '',
      output: resultText(b.content),
    }));
  const text = joinedText(blocks);
  return text === '' ? results : [...results, { role: 'user', content: text }];
}

function callIdOf(item: InputItem): string | null {
  return 'type' in item && item.type === 'function_call' ? item.call_id : null;
}

function outputIdOf(item: InputItem): string | null {
  return 'type' in item && item.type === 'function_call_output' ? (item.call_id ?? '') : null;
}

/**
 * OpenAI refuses a history where a call has no output or an output has no call;
 * Claude's history can carry either after a trimmed or interrupted turn. A lone
 * call gets a „no result" output, a lone output becomes plain text.
 */
export function pairedCalls(items: readonly InputItem[]): InputItem[] {
  const called = new Set(items.map(callIdOf).filter((id): id is string => id !== null));
  const answered = new Set(items.map(outputIdOf).filter((id): id is string => id !== null));
  return items.flatMap((item): InputItem[] => {
    const callId = callIdOf(item);
    if (callId !== null && !answered.has(callId)) {
      return [item, { type: 'function_call_output', call_id: callId, output: NO_RESULT }];
    }
    const outputId = outputIdOf(item);
    if (outputId !== null && !called.has(outputId)) {
      const output = 'output' in item ? String(item.output) : '';
      return [{ role: 'user', content: `[result] ${output}` }];
    }
    return [item];
  });
}

/** Pure: the system prompt and Claude's history as Responses input. */
export function toInputItems(
  systemPrompt: string,
  messages: readonly Anthropic.MessageParam[],
): InputItem[] {
  const items: InputItem[] = [{ role: 'system', content: plainSystemPrompt(systemPrompt) }];
  for (const m of messages) {
    const blocks = blocksOf(m.content);
    items.push(...(m.role === 'assistant' ? assistantItems(blocks) : userItems(blocks)));
  }
  return pairedCalls(items);
}

function toolChoice(req: AgentStepRequest): OpenAI.Responses.ResponseCreateParams['tool_choice'] {
  if (req.forceText) return 'none';
  if (req.forceTool !== undefined) return { type: 'function', name: req.forceTool };
  return 'auto';
}

function parsedInput(args: string): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(args === '' ? '{}' : args);
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function toolUseBlocks(calls: readonly FunctionCall[]): Anthropic.ToolUseBlock[] | null {
  const blocks: Anthropic.ToolUseBlock[] = [];
  for (const call of calls) {
    const input = parsedInput(call.arguments);
    if (input === null) return null;
    const id = SAFE_ID_RE.test(call.call_id) ? call.call_id : `${ID_PREFIX}${blocks.length}`;
    blocks.push({ type: 'tool_use', id, name: call.name, input, caller: { type: 'direct' } });
  }
  return blocks;
}

function stopReason(response: OpenAI.Responses.Response, calls: number): Anthropic.StopReason {
  if (calls > 0) return 'tool_use';
  return response.incomplete_details?.reason === MAX_OUTPUT_REASON ? 'max_tokens' : 'end_turn';
}

/**
 * Why GPT's step cannot stand in for Claude's, or null when it can. An empty
 * step is one: a scheduled check is told to leave the reply empty when nothing
 * is new (20 Nov 17:10Z, GPT did, and Claude was paid for the same step again),
 * and the run loop already treats an empty answer the same whoever wrote it.
 */
export function unusableStep(text: string, language: string): string | null {
  if (text.trim() === '') return null;
  return unusableReason(text, language);
}

function answerText(output: readonly OpenAI.Responses.ResponseOutputItem[]): string {
  return output
    .flatMap((item) => (item.type === 'message' ? item.content : []))
    .flatMap((part) => (part.type === 'output_text' ? [part.text] : []))
    .join('');
}

function ledgerUsage(usage: OpenAI.Responses.ResponseUsage | undefined): ClaudeUsage {
  const cached = usage?.input_tokens_details?.cached_tokens ?? 0;
  return {
    input_tokens: Math.max(0, (usage?.input_tokens ?? 0) - cached),
    output_tokens: usage?.output_tokens ?? 0,
    cache_read_input_tokens: cached,
    cache_creation_input_tokens: 0,
  };
}

function claudeUsage(usage: ClaudeUsage): Anthropic.Usage {
  return {
    input_tokens: usage.input_tokens ?? 0,
    output_tokens: usage.output_tokens ?? 0,
    cache_creation: null,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: usage.cache_read_input_tokens ?? 0,
    inference_geo: null,
    output_tokens_details: null,
    server_tool_use: null,
    service_tier: null,
  } as Anthropic.Usage;
}

/**
 * Pure: GPT's reply as the message Claude would have returned, or null when it
 * cannot stand in for one (a failed response, a broken call, unreadable text).
 */
export function toAnthropicMessage(
  response: OpenAI.Responses.Response,
  model: string,
  language: string,
): Anthropic.Message | null {
  if (response.status === 'failed') return null;
  const text = answerText(response.output);
  const calls = response.output.filter((i): i is FunctionCall => i.type === 'function_call');
  const tools = toolUseBlocks(calls);
  if (tools === null || unusableStep(text, language) !== null) return null;
  const content: Anthropic.ContentBlock[] = [
    ...(text.trim() === '' ? [] : [{ type: 'text' as const, text, citations: null }]),
    ...tools,
  ];
  return {
    id: response.id,
    type: 'message',
    role: 'assistant',
    model,
    container: null,
    content,
    stop_details: null,
    stop_reason: stopReason(response, calls.length),
    stop_sequence: null,
    usage: claudeUsage(ledgerUsage(response.usage)),
  } as Anthropic.Message;
}

/** One agent step by GPT, or null to let Claude take it. Never throws. */
export async function gptAgentStep(req: AgentStepRequest): Promise<Anthropic.Message | null> {
  const model = agentModel();
  const client = openaiClient();
  if (model === '' || client === null) return null;
  try {
    const tools = toFunctionTools(req.tools);
    const response = await client.responses.create(
      {
        model,
        store: false,
        max_output_tokens: req.maxTokens,
        input: toInputItems(req.systemPrompt, req.messages),
        ...(tools.length > 0 ? { tools, tool_choice: toolChoice(req) } : {}),
      },
      { timeout: REQUEST_TIMEOUT_MS },
    );
    const message = toAnthropicMessage(response, model, req.language);
    if (message === null) {
      // eslint-disable-next-line no-console
      console.warn(`[gpt-agent] ${model} step not usable (${response.status}) — Claude takes it`);
    }
    return message;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`[gpt-agent] ${model} failed — Claude takes the step:`, (err as Error).message);
    return null;
  }
}
