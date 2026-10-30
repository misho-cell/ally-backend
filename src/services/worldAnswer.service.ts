import { query } from '../db/postgres/client';
import { recordClaudeUsage, recordFixedUsage } from './costLedger.service';
import { logToolCall } from './toolCallLog.service';
import { RunLanguage } from './runLanguage';
import { groundedCall, withPageAddresses } from './tools/geminiSearch';
import { openaiWebAnswer, openaiWebSearchAvailable } from './tools/openaiWebSearch';
import { geminiKey, webSearchLedger } from './tools/webSearchProvider';
import {
  WorldAnswer,
  worldAnswerFrom,
  worldAnswerFromText,
  worldQuestionPrompt,
} from './worldAnswer';

/**
 * #8350 (founder, 29 Oct): the web's answer to an ask goes to the member first,
 * in about twenty seconds, and the run then builds the route on top of it.
 * This file asks the web, books the call and logs it. Off until the switch is
 * turned on from the dashboard, so it can be stopped in seconds without a deploy.
 */
export const WORLD_ANSWER_FLAG = 'world_answer_first';
/** The founder's „about 20 s": past it the run goes on without the answer. */
export const WORLD_ANSWER_BUDGET_MS = 20_000;
/**
 * Tester 78807 (#8350, 3 of 10): with Gemini refused at once (402), GPT's web
 * search answered in 15–21 s seven times and timed out at 20 s on the three
 * harder asks, which then waited 70–96 s for a nameless answer. The fallback
 * gets until 30 s from the start.
 */
export const WORLD_ANSWER_FALLBACK_BUDGET_MS = 30_000;
const FLAG_TTL_MS = 30_000;
const FLAG_QUERY_TIMEOUT_MS = 3_000;
const LOGGED_TOOL = 'world_answer:opening';
const OPENAI_PROVIDER = 'openai';
const LEDGER_KIND = 'web_search';

/** Which engine gave the answer; logged with the call. */
export enum WorldAnswerEngine {
  Gemini = 'gemini',
  OpenAi = 'openai',
}

/** An engine's reading: the answer (or none), or that the engine itself failed. */
type EngineReading = { readonly answer: WorldAnswer | null } | { readonly failed: true };

export interface WorldAnswerRun {
  readonly userId: string;
  readonly runId: string;
  readonly threadId: number;
}

let flagRead: { readonly on: boolean; readonly at: number } | null = null;

/** On when an engine is set up (a Gemini key, or the chat's GPT model) and the dashboard switch is on. */
export async function worldAnswerSwitchOn(): Promise<boolean> {
  if (geminiKey() === '' && !openaiWebSearchAvailable()) return false;
  const now = Date.now();
  if (flagRead !== null && now - flagRead.at < FLAG_TTL_MS) return flagRead.on;
  try {
    const result = await query<{ enabled: boolean }>(
      'SELECT enabled FROM app_flags WHERE flag = $1 LIMIT 1',
      [WORLD_ANSWER_FLAG],
      FLAG_QUERY_TIMEOUT_MS,
    );
    flagRead = { on: result.rows[0]?.enabled === true, at: now };
    return flagRead.on;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[world-answer] switch not read:', (err as Error).message);
    return false;
  }
}

/** Tests only: forget the cached switch. */
export function resetWorldAnswerSwitchForTests(): void {
  flagRead = null;
}

async function bookTheCall(run: WorldAnswerRun): Promise<void> {
  await recordFixedUsage({
    userId: run.userId,
    kind: 'web_search',
    ...(await webSearchLedger()),
    runId: run.runId,
    threadId: run.threadId,
  }).catch((err: unknown) => {
    // eslint-disable-next-line no-console
    console.warn(`[world-answer] run ${run.runId}: not booked:`, (err as Error).message);
  });
}

function logTheCall(
  run: WorldAnswerRun,
  question: string,
  answer: WorldAnswer | null,
  engine: WorldAnswerEngine | null,
  durationMs: number,
): void {
  void logToolCall({
    threadId: run.threadId,
    surface: 'chat',
    runId: run.runId,
    userId: run.userId,
    tool: LOGGED_TOOL,
    input: { query: question, engine },
    result: answer === null ? { found: false } : { found: true, results: answer.sources },
    durationMs,
    resultSample: answer?.sources.map((s) => `${s.title} — ${s.url}`).join(' | '),
  });
}

async function fromGemini(
  run: WorldAnswerRun,
  prompt: string,
  question: string,
): Promise<EngineReading> {
  try {
    await bookTheCall(run);
    const data = await groundedCall(prompt, geminiKey(), WORLD_ANSWER_BUDGET_MS);
    const read = worldAnswerFrom(data, question);
    return {
      answer: read === null ? null : { ...read, sources: await withPageAddresses(read.sources) },
    };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(`[world-answer] run ${run.runId}: Gemini failed:`, (err as Error).message);
    return { failed: true };
  }
}

async function fromOpenAi(
  run: WorldAnswerRun,
  prompt: string,
  question: string,
  budgetMs: number,
): Promise<EngineReading> {
  try {
    const web = await openaiWebAnswer(prompt, budgetMs);
    if (web === null) return { failed: true };
    await recordClaudeUsage({
      userId: run.userId,
      kind: LEDGER_KIND,
      provider: OPENAI_PROVIDER,
      model: web.model,
      usage: web.usage,
      runId: run.runId,
      threadId: run.threadId,
    }).catch(() => undefined);
    return { answer: worldAnswerFromText(web.text, web.sources, question) };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(`[world-answer] run ${run.runId}: GPT search failed:`, (err as Error).message);
    return { failed: true };
  }
}

/**
 * The web's answer with its pages, or null when it has none or did not answer
 * in time. Gemini first; when Gemini itself fails (no key, refused, timed out),
 * the chat's GPT model searches in the time left. An engine that answered
 * „nothing" is not asked twice. Never throws.
 */
export async function askTheWorld(
  run: WorldAnswerRun,
  question: string,
  language: RunLanguage,
): Promise<WorldAnswer | null> {
  const startedAt = Date.now();
  const prompt = worldQuestionPrompt(question, language);
  let engine: WorldAnswerEngine | null = null;
  let reading: EngineReading = { failed: true };
  if (geminiKey() !== '') {
    engine = WorldAnswerEngine.Gemini;
    reading = await fromGemini(run, prompt, question);
  }
  const left = WORLD_ANSWER_FALLBACK_BUDGET_MS - (Date.now() - startedAt);
  if ('failed' in reading && left > 0 && openaiWebSearchAvailable()) {
    engine = WorldAnswerEngine.OpenAi;
    reading = await fromOpenAi(run, prompt, question, left);
  }
  const answer = 'failed' in reading ? null : reading.answer;
  logTheCall(run, question, answer, engine, Date.now() - startedAt);
  return answer;
}
