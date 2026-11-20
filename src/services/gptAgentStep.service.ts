import type Anthropic from '@anthropic-ai/sdk';
import type OpenAI from 'openai';
import { openaiClient } from '../config/openai';
import { finalAnswerModel, toLedgerUsage, unusableReason } from './finalAnswer.service';
import { plainSystemPrompt } from './systemPromptParts';

/**
 * Misho, 20 Nov: „მთავარი გადაწყვეტილებების მიღება გააკეთოს ჯიპიტიმ და არა მხოლოდ
 * პასუხის მიწერა". With GPT_RUNS_AGENT=true each main-model step of a chat run —
 * which tool to call, with what, and when to stop and answer — is GPT's. The
 * run loop is unchanged: this file translates the step it would have sent to
 * Claude into OpenAI's function-calling form and the reply back into Claude's
 * message shape, so every guard, tool and ledger row downstream works as before.
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

const REQUEST_TIMEOUT_MS = 120_000;
const NO_RESULT = 'No result was returned for this call.';
const ID_PREFIX = 'gpt_';
const NO_TOOL_CHOICE = 'none';

type ChatMessage = OpenAI.Chat.Completions.ChatCompletionMessageParam;
type ChatTool = OpenAI.Chat.Completions.ChatCompletionTool;
type ToolCall = OpenAI.Chat.Completions.ChatCompletionMessageToolCall;

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
export function toChatTools(tools: AgentStepRequest['tools']): ChatTool[] {
  return tools
    .filter((t) => typeof t.input_schema === 'object' && t.input_schema !== null)
    .map((t) => ({
      type: 'function' as const,
      function: {
        name: t.name,
        description: t.description ?? '',
        parameters: t.input_schema as Record<string, unknown>,
      },
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

function assistantMessage(blocks: readonly Block[]): ChatMessage {
  const calls: ToolCall[] = blocks
    .filter((b) => b.type === 'tool_use')
    .map((b) => ({
      id: b.id ?? '',
      type: 'function' as const,
      function: { name: b.name ?? '', arguments: JSON.stringify(b.input ?? {}) },
    }));
  const text = joinedText(blocks);
  return calls.length > 0
    ? { role: 'assistant', content: text === '' ? null : text, tool_calls: calls }
    : { role: 'assistant', content: text };
}

function userMessages(blocks: readonly Block[]): ChatMessage[] {
  const results: ChatMessage[] = blocks
    .filter((b) => b.type === 'tool_result')
    .map((b) => ({
      role: 'tool',
      tool_call_id: b.tool_use_id ?? '',
      content: resultText(b.content),
    }));
  const text = joinedText(blocks);
  return text === '' ? results : [...results, { role: 'user', content: text }];
}

/**
 * OpenAI refuses a history where a call has no result or a result has no call;
 * Claude's history can carry either after a trimmed or interrupted turn. A lone
 * call gets a „no result" line, a lone result becomes plain text.
 */
export function pairedCalls(sent: readonly ChatMessage[]): ChatMessage[] {
  const out: ChatMessage[] = [];
  let open = new Set<string>();
  const closeOpen = (): void => {
    for (const id of open) out.push({ role: 'tool', tool_call_id: id, content: NO_RESULT });
    open = new Set();
  };
  for (const m of sent) {
    if (m.role === 'tool') {
      if (open.delete(m.tool_call_id)) out.push(m);
      else out.push({ role: 'user', content: `[result] ${String(m.content)}` });
      continue;
    }
    closeOpen();
    out.push(m);
    if (m.role === 'assistant') open = new Set((m.tool_calls ?? []).map((c) => c.id));
  }
  closeOpen();
  return out;
}

/** Pure: the system prompt and Claude's history as an OpenAI conversation. */
export function toChatMessages(
  systemPrompt: string,
  messages: readonly Anthropic.MessageParam[],
): ChatMessage[] {
  const sent: ChatMessage[] = [{ role: 'system', content: plainSystemPrompt(systemPrompt) }];
  for (const m of messages) {
    const blocks = blocksOf(m.content);
    if (m.role === 'assistant') sent.push(assistantMessage(blocks));
    else sent.push(...userMessages(blocks));
  }
  return pairedCalls(sent);
}

function toolChoice(req: AgentStepRequest): OpenAI.Chat.Completions.ChatCompletionToolChoiceOption {
  if (req.forceText) return NO_TOOL_CHOICE;
  if (req.forceTool !== undefined) return { type: 'function', function: { name: req.forceTool } };
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

function toolUseBlocks(calls: readonly ToolCall[]): Anthropic.ToolUseBlock[] | null {
  const blocks: Anthropic.ToolUseBlock[] = [];
  for (const call of calls) {
    if (call.type !== 'function') return null;
    const input = parsedInput(call.function.arguments);
    if (input === null) return null;
    const id = /^[A-Za-z0-9_-]+$/u.test(call.id) ? call.id : `${ID_PREFIX}${blocks.length}`;
    blocks.push({
      type: 'tool_use',
      id,
      name: call.function.name,
      input,
      caller: { type: 'direct' },
    });
  }
  return blocks;
}

function stopReason(finish: string | null, calls: number): Anthropic.StopReason {
  if (calls > 0) return 'tool_use';
  return finish === 'length' ? 'max_tokens' : 'end_turn';
}

/** Why GPT's step cannot stand in for Claude's, or null when it can. */
export function unusableStep(text: string, calls: number, language: string): string | null {
  if (calls === 0) return unusableReason(text, language);
  return text.trim() === '' ? null : unusableReason(text, language);
}

/**
 * Pure: GPT's reply as the message Claude would have returned, or null when it
 * cannot stand in for one (no choice, a broken call, unreadable text).
 */
export function toAnthropicMessage(
  completion: OpenAI.Chat.Completions.ChatCompletion,
  model: string,
  language: string,
): Anthropic.Message | null {
  const choice = completion.choices[0];
  if (choice === undefined) return null;
  const text = choice.message.content ?? '';
  const calls = choice.message.tool_calls ?? [];
  const tools = toolUseBlocks(calls);
  if (tools === null || unusableStep(text, calls.length, language) !== null) return null;
  const content: Anthropic.ContentBlock[] = [
    ...(text.trim() === '' ? [] : [{ type: 'text' as const, text, citations: null }]),
    ...tools,
  ];
  const usage = toLedgerUsage(completion.usage);
  return {
    id: completion.id,
    type: 'message',
    role: 'assistant',
    model,
    container: null,
    content,
    stop_details: null,
    stop_reason: stopReason(choice.finish_reason, calls.length),
    stop_sequence: null,
    usage: {
      ...usage,
      cache_creation: null,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: usage.cache_read_input_tokens ?? 0,
      inference_geo: null,
      output_tokens_details: null,
      server_tool_use: null,
      service_tier: null,
    },
  } as Anthropic.Message;
}

/** One agent step by GPT, or null to let Claude take it. Never throws. */
export async function gptAgentStep(req: AgentStepRequest): Promise<Anthropic.Message | null> {
  const model = agentModel();
  const client = openaiClient();
  if (model === '' || client === null) return null;
  try {
    const tools = toChatTools(req.tools);
    const completion = await client.chat.completions.create(
      {
        model,
        max_completion_tokens: req.maxTokens,
        messages: toChatMessages(req.systemPrompt, req.messages),
        ...(tools.length > 0 ? { tools, tool_choice: toolChoice(req) } : {}),
      },
      { timeout: REQUEST_TIMEOUT_MS },
    );
    const message = toAnthropicMessage(completion, model, req.language);
    if (message === null) {
      // eslint-disable-next-line no-console
      console.warn(`[gpt-agent] ${model} step not usable — Claude takes it`);
    }
    return message;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`[gpt-agent] ${model} failed — Claude takes the step:`, (err as Error).message);
    return null;
  }
}
