import { randomUUID } from 'crypto';
import { query } from '../db/postgres/client';
import { RunLanguage } from './runLanguage';
import { emitMessageAppended } from './sse.service';
import { saveServerLine } from './threads.service';

/**
 * Team task #364 — Giorgi, 2 October (G-008, G-010; Misho: „#364 დაიწყე").
 *
 * When the questions are over and the search begins, the owner reads a real
 * assistant message, in Giorgi's own words, that the work has started; the
 * findings come in the next message. A prompt line could not do it (the
 * tester's 1029, 0 of 3): a run writes ONE reply, so a bubble before the
 * search has to come from the server.
 *
 * WHEN: the first search call of an owner's run in a goal's thread. A run
 * still asking (the city, a detail) does not search, so the line lands exactly
 * when the questions end. ONCE PER GOAL: a thread that already holds it never
 * gets it twice. Never on a wake: nobody is waiting for it there.
 */
const QUERY_TIMEOUT_MS = 3_000;

/** The tools that are „the search" — own contacts, contacts' contacts, the web. */
export const WORKING_LINE_TOOLS: ReadonlySet<string> = new Set([
  'search_by_tag',
  'search_by_insight',
  'search_second_degree',
  'search_contact_by_name',
  'search_roster',
  'web_search',
]);

/** Giorgi's sentence, word for word in Georgian; the same in the other three. */
export const WORKING_LINE: Readonly<Record<RunLanguage, string>> = {
  ka:
    'ვმუშაობ შენს დავალებაზე, მოვძებნი შენს კონტაქტებში, კონტაქტების კონტაქტებში და ასევე ' +
    'მოვიძიებ ინფორმაციას ინტერნეტში, დამელოდე ცოტახანი და მოგაწვდი პირველად ინფორმაციას.',
  en:
    'I am working on your task: I will search your contacts, your contacts’ contacts and the ' +
    'internet. Give me a little while and I will bring you the first findings.',
  ru:
    'Работаю над твоей задачей: поищу в твоих контактах, в контактах твоих контактов и в ' +
    'интернете. Подожди немного, и я принесу первые результаты.',
  es:
    'Estoy trabajando en tu tarea: buscaré en tus contactos, en los contactos de tus contactos ' +
    'y en internet. Dame un momento y te traeré los primeros resultados.',
};

/** Runs that have already decided, so parallel search calls in one turn post once. */
const decidedRuns = new Set<string>();

/** Is this thread an open goal's, and has it never carried the line? */
async function lineIsDue(threadId: number): Promise<boolean> {
  const result = await query<{ due: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM tasks WHERE thread_id = $1 AND status = 'open')
        AND NOT EXISTS (
          SELECT 1 FROM conversations
           WHERE thread_id = $1 AND role = 'assistant' AND content = ANY($2::text[])
        ) AS due`,
    [threadId, Object.values(WORKING_LINE)],
    QUERY_TIMEOUT_MS,
  );
  return result.rows[0]?.due === true;
}

/**
 * Posts the line if this is the first search of an owner's run in a goal that
 * has not had it. Never throws: the search must run whether or not the line
 * could be written.
 */
export async function postWorkingLineOnce(
  userId: string,
  threadId: number,
  runId: string,
  language: RunLanguage,
): Promise<boolean> {
  if (decidedRuns.has(runId)) return false;
  decidedRuns.add(runId);
  try {
    if (!(await lineIsDue(threadId))) return false;
    const saved = await saveServerLine(threadId, Number(userId), WORKING_LINE[language]);
    emitMessageAppended(userId, threadId, randomUUID(), {
      messageId: String(saved.id),
      kind: 'working',
      content: saved.content,
      choices: [],
      ref: {},
    });
    return true;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`[working-line] thread ${threadId}:`, (err as Error).message);
    return false;
  }
}

/** The run is over; its decision is no longer needed. */
export function forgetWorkingLineRun(runId: string): void {
  decidedRuns.delete(runId);
}
