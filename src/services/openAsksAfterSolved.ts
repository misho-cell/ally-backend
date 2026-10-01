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

/**
 * The tester's 941, under rule 8 of the Georgian block: a button is the
 * owner's own action in the first person, never an order to Netai. The
 * Georgian labels say what the owner does; the old ones still count as a tap,
 * because cards written before today are still on people's screens.
 */
const CLOSE_LABEL: Readonly<Record<RunLanguage, string>> = {
  ka: 'ვხურავ დანარჩენ კითხვებს',
  en: 'Close the other questions',
  ru: 'Закрыть остальные вопросы',
  es: 'Cerrar las demás preguntas',
};

const KEEP_LABEL: Readonly<Record<RunLanguage, string>> = {
  ka: 'ღიად ვტოვებ',
  en: 'Keep them open',
  ru: 'Оставить открытыми',
  es: 'Dejarlas abiertas',
};

const EARLIER_CLOSE_LABELS: readonly string[] = ['დანარჩენი კითხვები დახურე'];
const EARLIER_KEEP_LABELS: readonly string[] = ['ღიად დატოვე'];

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
  if ([...Object.values(CLOSE_LABEL), ...EARLIER_CLOSE_LABELS].includes(said)) {
    return OpenAsksTap.Close;
  }
  if ([...Object.values(KEEP_LABEL), ...EARLIER_KEEP_LABELS].includes(said)) {
    return OpenAsksTap.Keep;
  }
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
  await query(
    `UPDATE tasks SET open_asks_offered_at = NOW(), open_asks_settled_at = NULL WHERE id = $1`,
    [taskId],
    QUERY_TIMEOUT_MS,
  );
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

interface OfferedGoal {
  readonly id: number;
  readonly settled: boolean;
}

/** The goal whose card this thread showed last, and whether it was answered. */
async function goalWithTheCard(threadId: number, userId: string): Promise<OfferedGoal | null> {
  const result = await query<{ id: number; settled: boolean }>(
    `SELECT t.id, t.open_asks_settled_at IS NOT NULL AS settled FROM tasks t
      WHERE t.thread_id = $1 AND t.user_id = $2 AND t.open_asks_offered_at IS NOT NULL
      ORDER BY t.open_asks_offered_at DESC
      LIMIT 1`,
    [threadId, userId],
    QUERY_TIMEOUT_MS,
  );
  const row = result.rows[0];
  return row ? { id: row.id, settled: row.settled === true } : null;
}

/** The first tap claims the card. False when another tap got there first. */
async function claimTheCard(taskId: number): Promise<boolean> {
  const result = await query<{ id: number }>(
    `UPDATE tasks SET open_asks_settled_at = NOW()
      WHERE id = $1 AND open_asks_settled_at IS NULL
      RETURNING id`,
    [taskId],
    QUERY_TIMEOUT_MS,
  );
  return result.rows.length > 0;
}

const ALREADY_SETTLED =
  '[სერვერი: ამ ბარათზე არჩევანი უკვე გაკეთდა და ამ დაჭერამ არაფერი შეცვალა. ერთი მოკლე ' +
  'ხაზით უთხარი, რომ უკვე გაკეთებულია. მიზანი არ გახსნა, update_task არ გამოიძახო და არც ' +
  'ერთი კითხვა არ გააუქმო.]';

const CLOSED_LINE = (cancelled: number): string =>
  `[სერვერმა უკვე შეასრულა: მფლობელმა დახურვა აირჩია — ${cancelled} ღია კითხვა დაიხურა, ` +
  'თითოეულ ადამიანს ერთხელ მიუვიდა, რომ აღარ არის საჭირო. ერთი მოკლე ხაზით დაუდასტურე; ' +
  'მიზანი არ გახსნა და ახალი ნაბიჯი არ შესთავაზო.]';

const KEPT_LINE =
  '[სერვერმა უკვე შეასრულა: მფლობელმა კითხვები ღიად დატოვა. მიზანი დახურულია; თუ ვინმე ' +
  'უპასუხებს, პასუხი აქ ბარათად მოვა. ერთი მოკლე ხაზით დაუდასტურე; მიზანი არ გახსნა.]';

/**
 * A tap on one of the two buttons, acted on by the server ONCE (row 311, the
 * tester's 941). Returns the line the run is told (so its reply only
 * confirms), or null when this message is not such a tap or this thread showed
 * no card. A tap on a card already answered changes nothing, and says so.
 */
export async function settleOpenAsksOnTap(
  userId: string,
  threadId: number,
  message: string,
): Promise<string | null> {
  const tap = openAsksTapOf(message);
  if (tap === null) return null;
  const goal = await goalWithTheCard(threadId, userId);
  if (goal === null) return null;
  if (goal.settled || !(await claimTheCard(goal.id))) return ALREADY_SETTLED;
  if (tap === OpenAsksTap.Close) return CLOSED_LINE(await cancelAsksForTask(goal.id));
  return KEPT_LINE;
}
