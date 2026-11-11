import OpenAI from 'openai';
import { openaiClient } from '../../config/openai';
import { ClaudeUsage } from '../costLedger.service';
import { finalAnswerModel, gptWritesTheAnswer } from '../finalAnswer.service';
import { GeminiHit } from './geminiSearch';

/**
 * #8350 (tester 78145: stage 1 never posted, because Gemini refuses every call
 * until its billing is on — Lika's task): the web's answer comes from the chat's
 * own GPT model with OpenAI's web search when Gemini cannot give it. The same
 * question, the same pages-or-nothing rule.
 */
const WEB_SEARCH_TOOL = 'web_search';
const MAX_SOURCES = 8;

export interface WebAnswer {
  readonly text: string;
  readonly sources: readonly GeminiHit[];
  readonly model: string;
  readonly usage: ClaudeUsage;
}

/** Pure: the pages the answer cites, each once, in the order cited. */
export function citedPages(response: OpenAI.Responses.Response): GeminiHit[] {
  const pages = new Map<string, GeminiHit>();
  for (const item of response.output) {
    if (item.type !== 'message') continue;
    for (const part of item.content) {
      if (part.type !== 'output_text') continue;
      for (const note of part.annotations) {
        if (note.type !== 'url_citation' || pages.has(note.url)) continue;
        pages.set(note.url, { title: note.title, url: note.url, snippet: '' });
      }
    }
  }
  return [...pages.values()].slice(0, MAX_SOURCES);
}

/** Pure: the response's token counts as the usage ledger reads them. */
export function responseUsage(usage: OpenAI.Responses.ResponseUsage | undefined): ClaudeUsage {
  const input = usage?.input_tokens ?? 0;
  const cached = usage?.input_tokens_details?.cached_tokens ?? 0;
  return {
    input_tokens: Math.max(0, input - cached),
    output_tokens: usage?.output_tokens ?? 0,
    cache_read_input_tokens: cached,
    cache_creation_input_tokens: 0,
  };
}

/**
 * True when GPT is switched on and there is a model and a key to search with.
 * Misho, 11 Nov („ჯიპიტის ნაწილი სრულად ჩაგვეხსნა"): GPT is off everywhere;
 * the web is searched by Gemini, and GPT_WRITES_ANSWERS=true brings this back
 * with the rest of GPT, without a release.
 */
export function openaiWebSearchAvailable(): boolean {
  return gptWritesTheAnswer() && finalAnswerModel() !== '' && openaiClient() !== null;
}

/** One web-searched answer; null when no GPT model or key is set. Throws when the call fails. */
export async function openaiWebAnswer(
  prompt: string,
  timeoutMs: number,
): Promise<WebAnswer | null> {
  const model = finalAnswerModel();
  const client = openaiClient();
  if (model === '' || client === null) return null;
  const response = await client.responses.create(
    { model, input: prompt, tools: [{ type: WEB_SEARCH_TOOL }] },
    // Tester 78509: the SDK's two retries made a 20 s budget a 60 s wait before the run.
    { timeout: timeoutMs, maxRetries: 0 },
  );
  return {
    text: response.output_text.trim(),
    sources: citedPages(response),
    model,
    usage: responseUsage(response.usage),
  };
}
