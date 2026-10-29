import { query } from '../db/postgres/client';
import { recordFixedUsage } from './costLedger.service';
import { logToolCall } from './toolCallLog.service';
import { RunLanguage } from './runLanguage';
import { groundedCall, withPageAddresses } from './tools/geminiSearch';
import { geminiKey, webSearchLedger } from './tools/webSearchProvider';
import { WorldAnswer, worldAnswerFrom, worldQuestionPrompt } from './worldAnswer';

/**
 * #8350 (founder, 29 Oct): the web's answer to an ask goes to the member first,
 * in about twenty seconds, and the run then builds the route on top of it.
 * This file asks the web, books the call and logs it. Off until the switch is
 * turned on from the dashboard, so it can be stopped in seconds without a deploy.
 */
export const WORLD_ANSWER_FLAG = 'world_answer_first';
/** The founder's „about 20 s": past it the run goes on without the answer. */
export const WORLD_ANSWER_BUDGET_MS = 20_000;
const FLAG_TTL_MS = 30_000;
const FLAG_QUERY_TIMEOUT_MS = 3_000;
const LOGGED_TOOL = 'world_answer:opening';

export interface WorldAnswerRun {
  readonly userId: string;
  readonly runId: string;
  readonly threadId: number;
}

let flagRead: { readonly on: boolean; readonly at: number } | null = null;

/** On when there is a Gemini key and the dashboard switch is on. */
export async function worldAnswerSwitchOn(): Promise<boolean> {
  if (geminiKey() === '') return false;
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
  durationMs: number,
): void {
  void logToolCall({
    threadId: run.threadId,
    surface: 'chat',
    runId: run.runId,
    userId: run.userId,
    tool: LOGGED_TOOL,
    input: { query: question },
    result: answer === null ? { found: false } : { found: true, results: answer.sources },
    durationMs,
    resultSample: answer?.sources.map((s) => `${s.title} — ${s.url}`).join(' | '),
  });
}

/** The web's answer with its pages, or null when it has none or did not answer in time. Never throws. */
export async function askTheWorld(
  run: WorldAnswerRun,
  question: string,
  language: RunLanguage,
): Promise<WorldAnswer | null> {
  const startedAt = Date.now();
  try {
    await bookTheCall(run);
    const data = await groundedCall(
      worldQuestionPrompt(question, language),
      geminiKey(),
      WORLD_ANSWER_BUDGET_MS,
    );
    const read = worldAnswerFrom(data, question);
    const answer =
      read === null ? null : { ...read, sources: await withPageAddresses(read.sources) };
    logTheCall(run, question, answer, Date.now() - startedAt);
    return answer;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(`[world-answer] run ${run.runId}: no answer:`, (err as Error).message);
    logTheCall(run, question, null, Date.now() - startedAt);
    return null;
  }
}
