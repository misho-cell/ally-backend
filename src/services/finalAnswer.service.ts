import type Anthropic from '@anthropic-ai/sdk';
import type OpenAI from 'openai';
import { openaiClient } from '../config/openai';
import type { ClaudeUsage } from './costLedger.service';

/**
 * Ticket 20 row 129 — the final user-facing answer, written by OpenAI.
 *
 * WHY THIS IS SMALL, because the reason is the whole design. A run's last call
 * is already a separate call made with tool_choice: none — the model cannot
 * call anything, it only READS what the run gathered and writes the reply.
 * So the history it receives does not need a faithful two-way mapping of the
 * tool protocol, which is the part that makes a real provider port weeks of
 * work. It needs to be READABLE. Tool calls and their results are flattened
 * into plain lines, and nothing downstream of here changes.
 *
 * WHAT THIS DOES NOT DO. It does not touch the tool turns: every search, every
 * decision, every guard still runs on Anthropic. Only the last paragraph the
 * user reads comes from here. The step captions they watch DURING a long run
 * are still Anthropic's — that is a real limit of the hybrid and not an
 * oversight.
 *
 * FAILURE IS NOT FATAL, BY CONTRACT. Every path returns null instead of
 * throwing, and the caller then writes the answer the old way. A second
 * provider must not be able to lose an answer the run already earned.
 */

/** Unset = the product behaves exactly as it did before this file existed. */
const FINAL_ANSWER_MODEL = process.env.CHAT_FINAL_ANSWER_MODEL?.trim() ?? '';

/**
 * The model id is an env var rather than a constant on purpose: it is an
 * OpenAI-side identifier that can be corrected without a deploy. Guessing it
 * in code and being wrong would mean a failed call on every run until the next
 * release.
 */
export function finalAnswerModel(): string {
  return FINAL_ANSWER_MODEL;
}

const MAX_TOKENS = 8192;
const REQUEST_TIMEOUT_MS = 90_000;
/**
 * How much of one flattened tool result is carried into the history. Results
 * are already trimmed upstream by the tool-result diet; this is a ceiling so a
 * single oversized one cannot crowd out the rest of what the run found.
 */
const MAX_BLOCK_CHARS = 4_000;

function clip(text: string): string {
  return text.length > MAX_BLOCK_CHARS ? `${text.slice(0, MAX_BLOCK_CHARS)}…` : text;
}

/**
 * One Anthropic content block as a line of text.
 *
 * The markers are for the MODEL's benefit, not the user's — nothing from here
 * reaches a screen, because the model is being asked to write a fresh reply
 * rather than to quote this back.
 */
function blockToText(block: unknown): string {
  if (typeof block === 'string') return block;
  if (block === null || typeof block !== 'object') return '';
  const b = block as {
    type?: string;
    text?: string;
    name?: string;
    input?: unknown;
    content?: unknown;
  };
  if (b.type === 'text') return b.text ?? '';
  if (b.type === 'tool_use')
    return clip(`[tool ${b.name ?? '?'}] ${JSON.stringify(b.input ?? {})}`);
  if (b.type === 'tool_result') {
    const inner = Array.isArray(b.content)
      ? b.content.map(blockToText).filter(Boolean).join('\n')
      : typeof b.content === 'string'
        ? b.content
        : JSON.stringify(b.content ?? null);
    return clip(`[result] ${inner}`);
  }
  return '';
}

function contentToText(content: Anthropic.MessageParam['content']): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .map(blockToText)
    .filter((part) => part.trim() !== '')
    .join('\n');
}

/**
 * The run's history as plain OpenAI messages.
 *
 * Exported for its tests: this is the one piece with real logic in it, and the
 * property that matters — the gathered results survive the crossing — is not
 * observable from outside without it.
 */
export function toOpenAiMessages(
  messages: readonly Anthropic.MessageParam[],
  systemPrompt: string,
): OpenAI.Chat.ChatCompletionMessageParam[] {
  const out: OpenAI.Chat.ChatCompletionMessageParam[] = [{ role: 'system', content: systemPrompt }];
  for (const message of messages) {
    const text = contentToText(message.content);
    // An empty turn is dropped rather than sent: the API rejects empty content,
    // and a turn that flattened to nothing carried nothing worth reading.
    if (text.trim() === '') continue;
    out.push(
      message.role === 'assistant'
        ? { role: 'assistant', content: text }
        : { role: 'user', content: text },
    );
  }
  return out;
}

/**
 * OpenAI's token counts in the four terms our ledger already speaks.
 *
 * prompt_tokens INCLUDES the cached ones, so the cached count is subtracted
 * out rather than added alongside — billing them twice would overstate every
 * run. cache_creation is 0 because OpenAI does not charge for a cache write;
 * that is the fact the whole hybrid's cost case rests on.
 */
export function toLedgerUsage(usage: OpenAI.CompletionUsage | undefined): ClaudeUsage {
  const prompt = usage?.prompt_tokens ?? 0;
  const cached = usage?.prompt_tokens_details?.cached_tokens ?? 0;
  return {
    input_tokens: Math.max(0, prompt - cached),
    output_tokens: usage?.completion_tokens ?? 0,
    cache_read_input_tokens: cached,
    cache_creation_input_tokens: 0,
  };
}

/**
 * Ticket 20 row 155 — nothing the model writes reaches a thread unless it is a
 * reply.
 *
 * 17 September, on Ninia's account while a tester was working in it, two
 * messages were stored as ordinary replies with the plan buttons under them:
 *
 *   goal 4100  „We need respond next user? No current user only result event.
 *              Need likely wait no reply. But must answer event?" — 1,177
 *              characters of the model's own reasoning, in English, in a
 *              Georgian thread.
 *   goal 4126  „[tool …] … to=functions. …" with 32 CJK characters and 8
 *              Cyrillic ones, then a raw {"tag_query": …} twice. The goal's
 *              first pass ended there and the owner got no answer at all.
 *
 * MEASURED BEFORE FIXING, by answered_by, over every stored assistant message
 * since 10 September:
 *
 *   gpt-5.6-terra    71 messages,  2 carrying these signs   (~3%)
 *   claude-sonnet-5  19 messages,  0
 *   (before the hybrid)         2,380 messages,  0 tool syntax
 *
 * So it is this path and only this path, at about one reply in thirty-five.
 * The cause is visible in toOpenAiMessages: the run's history is flattened
 * into lines like „[tool web_search] {…}" and „[result] …", and a model handed
 * that shape sometimes CONTINUES it instead of answering. tool_choice: none
 * stops it calling a tool; it does not stop it writing what one looks like. I
 * built that flattening and wrote „safe because the final call cannot call
 * anything", which was true and beside the point.
 *
 * REFUSING IS CHEAP AND MISSING IS NOT, so this errs towards refusing: every
 * rejection falls back to the Claude answer the run had already written, which
 * is a good answer by construction. A false refusal costs one wasted OpenAI
 * call. A false acceptance puts „to=functions" on a real person's screen.
 */

/** A reply that is entirely tool protocol, however it was produced. */
const TOOL_SYNTAX = [/to=functions/i, /\[tool\s/i, /\{"[a-z_]{2,}"\s*:/];

/** Scripts no conversation in this product is held in. */
const CJK = /[\u3040-\u30ff\u4e00-\u9fff]/;
const CYRILLIC = /[\u0400-\u04ff]/;
const GEORGIAN = /[\u10a0-\u10ff\u1c90-\u1cbf]/;

/**
 * Below this a Latin-only line is plausibly a name, a link or a single word,
 * and refusing it would cost an answer for nothing.
 */
const MIN_CHARS_TO_JUDGE_SCRIPT = 80;

/**
 * Why this text must not be stored, or null when it may be.
 *
 * Returns the REASON rather than a boolean so the log can say which rule
 * fired — the alternative is another record that says something happened and
 * not what, which this codebase has now found four times in a week.
 */
export function unusableReason(text: string, language: string): string | null {
  const trimmed = text.trim();
  if (trimmed === '') return 'empty';
  if (TOOL_SYNTAX.some((re) => re.test(trimmed))) return 'tool syntax';
  if (CJK.test(trimmed)) return 'CJK characters';
  if (language === 'ka' && CYRILLIC.test(trimmed)) return 'Cyrillic in a Georgian thread';
  // A Georgian thread whose reply carries not one Georgian letter is not a
  // reply in that conversation, whatever it says. Deliberately a test about
  // the ALPHABET rather than about the words: judging „is this reasoning
  // rather than an answer" would need to read it, and this does not.
  if (language === 'ka' && trimmed.length >= MIN_CHARS_TO_JUDGE_SCRIPT && !GEORGIAN.test(trimmed)) {
    return 'no Georgian in a Georgian thread';
  }
  return null;
}

export interface FinalAnswer {
  readonly text: string;
  readonly usage: ClaudeUsage;
  readonly model: string;
}

/**
 * Write the run's final answer with OpenAI, or return null to let the caller
 * write it the way it always has.
 *
 * null — never an exception — for all three of: the flag is off, no API key is
 * set, and the call failed. The caller cannot tell them apart and does not
 * need to; what it does about each is identical.
 */
export async function writeFinalAnswer(
  messages: readonly Anthropic.MessageParam[],
  systemPrompt: string,
  onText?: (text: string) => void,
  /** Row 155: the conversation's language, for the script checks. */
  language = 'ka',
): Promise<FinalAnswer | null> {
  const model = finalAnswerModel();
  if (model === '') return null;
  const client = openaiClient();
  if (client === null) {
    // Worth a line: the flag is on and the key is not, which is somebody
    // half-way through a change rather than a working configuration.
    // eslint-disable-next-line no-console
    console.warn(`[final-answer] ${model} requested but OPENAI_API_KEY is not set — using Claude`);
    return null;
  }

  try {
    const stream = await client.chat.completions.create(
      {
        model,
        max_completion_tokens: MAX_TOKENS,
        messages: toOpenAiMessages(messages, systemPrompt),
        stream: true,
        stream_options: { include_usage: true },
      },
      { timeout: REQUEST_TIMEOUT_MS },
    );

    let text = '';
    let usage: OpenAI.CompletionUsage | undefined;
    for await (const chunk of stream) {
      // The usage-only chunk arrives last and carries no choices.
      if (chunk.usage) usage = chunk.usage;
      const delta = chunk.choices[0]?.delta?.content;
      if (typeof delta === 'string' && delta !== '') {
        text += delta;
        onText?.(delta);
      }
    }

    // Row 155. An empty answer is a failure, not an answer — and so is one
    // made of tool protocol or written in the wrong alphabet. Falling back
    // costs one extra call; shipping either costs the user their reply and
    // puts „to=functions" on their screen.
    const unusable = unusableReason(text, language);
    if (unusable !== null) {
      // eslint-disable-next-line no-console
      console.warn(
        `[final-answer] ${model} answer refused (${unusable}), ${text.length} chars — using Claude`,
      );
      return null;
    }
    return { text, usage: toLedgerUsage(usage), model };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`[final-answer] ${model} failed — using Claude:`, (err as Error).message);
    return null;
  }
}
