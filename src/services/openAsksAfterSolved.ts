import { query } from '../db/postgres/client';
import { RunLanguage } from './runLanguage';
import { cancelAsksForTask } from './taskAsks.service';
import { saveThreadMessage, threadLanguage } from './threads.service';

/**
 * ROW 311 — „SOLVED", AND PEOPLE ARE STILL BEING ASKED.
 *
 * Until now „solved" closed the goal and cancelled every open question at
 * once: each person still asked got a „no longer needed" line. The plate asked
 * for one question first — go on with them, or stop — and the night list held
 * it as a product decision. Misho, 1 October: decide on the recommendation
 * unless it is money. The recommendation, built here:
 *
 *   „Close" — exactly today's behaviour: every open question is cancelled and
 *             each person is told once that it is no longer needed.
 *   „Keep"  — the goal stays closed, the questions stay live, and an answer
 *             that arrives later reaches the owner as an answers card — no
 *             run, nothing charged (see taskEngine's closed-goal delivery).
 *
 * The buttons are exact strings, matched like row 300's, so the server acts on
 * what the owner pressed and the model only says, in one line, what was done.
 */

const QUERY_TIMEOUT_MS = 5_000;

const CLOSE_LABEL: Readonly<Record<RunLanguage, string>> = {
  ka: 'დანარჩენი კითხვები დახურე',
  en: 'Close the other questions',
  ru: 'Закрыть остальные вопросы',
  es: 'Cerrar las demás preguntas',
};

const KEEP_LABEL: Readonly<Record<RunLanguage, string>> = {
  ka: 'ღიად დატოვე',
  en: 'Keep them open',
  ru: 'Оставить открытыми',
  es: 'Dejarlas abiertas',
};

export enum OpenAsksTap {
  Close = 'close',
  Keep = 'keep',
}

/** The two buttons, close first, in the owner's language. */
export function openAsksChoices(language: RunLanguage): readonly string[] {
  return [CLOSE_LABEL[language] ?? CLOSE_LABEL.ka, KEEP_LABEL[language] ?? KEEP_LABEL.ka];
}

/** Which of the two this message is, in any language; null for anything typed. */
export function openAsksTapOf(message: string): OpenAsksTap | null {
  const said = (message ?? '').trim();
  if (said === '') return null;
  if (Object.values(CLOSE_LABEL).includes(said)) return OpenAsksTap.Close;
  if (Object.values(KEEP_LABEL).includes(said)) return OpenAsksTap.Keep;
  return null;
}

function offerLine(language: RunLanguage, count: number): string {
  const lines: Readonly<Record<RunLanguage, string>> = {
    ka: `${count} ადამიანს კითხვაზე ჯერ არ უპასუხია. მათი კითხვები დავხურო, თუ ღიად დავტოვო? თუ დავტოვებ, მათი პასუხები აქ მოვა.`,
    en: `${count} people have not answered yet. Close their questions, or keep them open? If they stay open, their answers will still arrive here.`,
    ru: `${count} человек ещё не ответили. Закрыть их вопросы или оставить открытыми? Если оставить, ответы придут сюда.`,
    es: `${count} personas aún no han respondido. ¿Cierro sus preguntas o las dejo abiertas? Si quedan abiertas, sus respuestas llegarán aquí.`,
  };
  return lines[language] ?? lines.ka;
}

async function openAskCount(taskId: number): Promise<number> {
  const result = await query<{ n: string }>(
    `SELECT COUNT(*) AS n FROM task_asks WHERE task_id = $1 AND status = 'sent'`,
    [taskId],
    QUERY_TIMEOUT_MS,
  );
  return Number(result.rows[0]?.n ?? 0);
}

/**
 * After „solved": offer the choice when questions are still out. Returns how
 * many are open; 0 means there was nothing to ask about and nothing was written.
 */
export async function offerOpenAsksChoice(
  taskId: number,
  threadId: number,
  ownerId: number,
): Promise<number> {
  const open = await openAskCount(taskId);
  if (open === 0) return 0;
  const language = await threadLanguage(threadId);
  await saveThreadMessage(
    threadId,
    ownerId,
    'assistant',
    offerLine(language, open),
    'message',
    null,
    openAsksChoices(language),
  );
  return open;
}

/** The newest closed goal on this thread that still has questions out. */
async function closedGoalWithOpenAsks(threadId: number, userId: string): Promise<number | null> {
  const result = await query<{ id: number }>(
    `SELECT t.id FROM tasks t
      WHERE t.thread_id = $1 AND t.user_id = $2 AND t.status = 'closed'
        AND EXISTS (SELECT 1 FROM task_asks a WHERE a.task_id = t.id AND a.status = 'sent')
      ORDER BY t.updated_at DESC
      LIMIT 1`,
    [threadId, userId],
    QUERY_TIMEOUT_MS,
  );
  return result.rows[0]?.id ?? null;
}

/**
 * A tap on one of the two buttons, acted on by the server. Returns the line the
 * run is told (so its reply only confirms), or null when this message is not
 * such a tap or there is nothing left to act on.
 */
export async function settleOpenAsksOnTap(
  userId: string,
  threadId: number,
  message: string,
): Promise<string | null> {
  const tap = openAsksTapOf(message);
  if (tap === null) return null;
  const taskId = await closedGoalWithOpenAsks(threadId, userId);
  if (taskId === null) return null;
  if (tap === OpenAsksTap.Close) {
    const cancelled = await cancelAsksForTask(taskId);
    return (
      `[სერვერმა უკვე შეასრულა: მფლობელმა დახურვა აირჩია — ${cancelled} ღია კითხვა დაიხურა, ` +
      'თითოეულ ადამიანს ერთხელ მიუვიდა, რომ აღარ არის საჭირო. ერთი მოკლე ხაზით დაუდასტურე; ' +
      'მიზანი არ გახსნა და ახალი ნაბიჯი არ შესთავაზო.]'
    );
  }
  return (
    '[სერვერმა უკვე შეასრულა: მფლობელმა კითხვები ღიად დატოვა. მიზანი დახურულია; თუ ვინმე ' +
    'უპასუხებს, პასუხი აქ ბარათად მოვა. ერთი მოკლე ხაზით დაუდასტურე; მიზანი არ გახსნა.]'
  );
}
