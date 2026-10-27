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

/**
 * The tools that are „the search" — own contacts, contacts' contacts, the web.
 *
 * Not search_contact_by_name: that looks up ONE person the owner named. The
 * tester's 44884 (3 of 6): on „ask <helper> whether…" the run looked the helper
 * up, and the owner read „I will search your contacts, your contacts' contacts
 * and the internet" about a question to one person.
 */
export const WORKING_LINE_TOOLS: ReadonlySet<string> = new Set([
  'search_by_tag',
  'search_by_insight',
  'search_second_degree',
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

/**
 * Is this thread an open goal's with no plan yet, and has it never carried the line?
 *
 * T4886 (13 Oct, thread 51030): the goal's first search ran in the turn that
 * created it, before the thread was a goal's, so the line was still due when
 * the owner asked „გიორგი რა შუაშია" about the proposed plan. The run searched
 * again and the owner's question was answered with „I am working on your task…".
 * Once a plan is on the screen the search has long begun: the line is not due.
 */
async function lineIsDue(threadId: number): Promise<boolean> {
  const result = await query<{ due: boolean }>(
    `SELECT EXISTS (
          SELECT 1 FROM tasks
           WHERE thread_id = $1 AND status = 'open' AND plan_proposed IS NULL AND plan IS NULL
        )
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
      createdAt: saved.createdAt,
    });
    return true;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`[working-line] thread ${threadId}:`, (err as Error).message);
    return false;
  }
}

/**
 * #8053 (founder 27 Oct): the owner waited 1–2 minutes of searching without
 * knowing the request was understood; the text the model wrote beside its
 * first search was only a step caption. That text is now posted at once as a
 * real line, and it stands in for the canned line above, which says nothing
 * about what was understood. Never throws: the search runs either way, and
 * the canned line still goes if this one could not be written.
 */
export async function postFirstLine(
  userId: string,
  threadId: number,
  runId: string,
  text: string,
): Promise<boolean> {
  try {
    const saved = await saveServerLine(threadId, Number(userId), text);
    decidedRuns.add(runId);
    emitMessageAppended(userId, threadId, runId, {
      messageId: String(saved.id),
      kind: 'working',
      content: saved.content,
      choices: [],
      ref: {},
      createdAt: saved.createdAt,
    });
    return true;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`[first-line] thread ${threadId}:`, (err as Error).message);
    return false;
  }
}

/**
 * #8053 (3): a run still searching after a minute says so once, truthfully;
 * never a second time, never on a wake.
 */
export const PROGRESS_LINE_AFTER_MS = 60_000;

export const PROGRESS_LINE: Readonly<Record<RunLanguage, string>> = {
  ka: 'ჯერ კიდევ ვეძებ. როგორც კი დავასრულებ, აქვე მოგწერ.',
  en: 'Still searching. I will write here as soon as I am done.',
  ru: 'Всё ещё ищу. Напишу сюда, как только закончу.',
  es: 'Sigo buscando. Escribiré aquí en cuanto termine.',
};

/** Runs that already said they are still searching. */
const progressRuns = new Set<string>();

/** Posts the progress line once per run, when the run has passed a minute. Never throws. */
export async function postProgressLineOnce(
  userId: string,
  threadId: number,
  runId: string,
  language: RunLanguage,
  elapsedMs: number,
): Promise<boolean> {
  if (elapsedMs < PROGRESS_LINE_AFTER_MS || progressRuns.has(runId)) return false;
  progressRuns.add(runId);
  try {
    const saved = await saveServerLine(threadId, Number(userId), PROGRESS_LINE[language]);
    emitMessageAppended(userId, threadId, runId, {
      messageId: String(saved.id),
      kind: 'working',
      content: saved.content,
      choices: [],
      ref: {},
      createdAt: saved.createdAt,
    });
    return true;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`[progress-line] thread ${threadId}:`, (err as Error).message);
    return false;
  }
}

/** The run is over; its decision is no longer needed. */
export function forgetWorkingLineRun(runId: string): void {
  decidedRuns.delete(runId);
  progressRuns.delete(runId);
}
