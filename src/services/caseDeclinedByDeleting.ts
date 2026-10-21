import { query } from '../db/postgres/client';
import { geoName } from './georgianCase';
import { georgianScriptName, withoutAllyWord } from './georgianScriptName';
import type { RunLanguage } from './runLanguage';
import { ASKED_AS_THE_ASKER_SAVED_THEM } from './savedNameSql';
import { saveThreadMessage, userLanguage } from './threads.service';

/**
 * #7096 / #7097 (Giorgi, G-180, 21 Oct): a go-between or a target who deletes
 * the case has it closed for them (D588), and nobody was told. Their own
 * assistant now says they closed the request, and the owner is told that this
 * person declined to take part; the open question counts as declined, so the
 * routes show it so. Giorgi's own words (#7096, #7097).
 */
const CLOSED_BY_YOU: Readonly<Record<RunLanguage, string>> = {
  ka: 'ეს მოთხოვნა დახურე.',
  en: 'You closed this request.',
  ru: 'Ты закрыл этот запрос.',
  es: 'Cerraste esta solicitud.',
};

const DECLINED_FOR_OWNER: Readonly<Record<RunLanguage, (name: string) => string>> = {
  ka: (n) => `${geoName(n, 'erg')} უარი თქვა ამ საქმეში მონაწილეობაზე.`,
  en: (n) => `${n} declined to take part in this case.`,
  ru: (n) => `${n} отказался участвовать в этом деле.`,
  es: (n) => `${n} no quiso participar en este caso.`,
};

const DECLINE_QUERY_TIMEOUT_MS = 4_000;

/** What the person who deleted the case is told in their own chat. */
export function closedByYouLine(language: RunLanguage): string {
  return CLOSED_BY_YOU[language] ?? CLOSED_BY_YOU.ka;
}

/** What the owner is told, the person named as the owner saved them, in Georgian script. */
export function declinedLineForOwner(name: string, language: RunLanguage): string {
  const shown = language === 'ka' ? georgianScriptName(name) : withoutAllyWord(name);
  return (DECLINED_FOR_OWNER[language] ?? DECLINED_FOR_OWNER.ka)(shown.trim() || name.trim());
}

interface DeclinedAsk {
  readonly from_user_id: number;
  readonly task_thread_id: number | null;
  readonly reader_name: string | null;
}

/**
 * The question still waiting in this chat counts as declined: answered, with
 * the decline stamped and no answer to wake the goal with — the owner is told
 * here, once. Null when nothing was waiting.
 */
async function declineWaitingAsk(threadId: number): Promise<DeclinedAsk | null> {
  const result = await query<DeclinedAsk>(
    `UPDATE task_asks ta
        SET status = 'answered', answered_at = NOW(),
            declined_at = COALESCE(ta.declined_at, NOW()), wake_delivered_at = NOW()
      WHERE ta.id = (SELECT id FROM task_asks
                      WHERE ask_thread_id = $1 AND status = 'sent'
                      ORDER BY id DESC LIMIT 1)
      RETURNING ta.from_user_id,
                (SELECT t.thread_id FROM tasks t WHERE t.id = ta.task_id) AS task_thread_id,
                ${ASKED_AS_THE_ASKER_SAVED_THEM} AS reader_name`,
    [threadId],
    DECLINE_QUERY_TIMEOUT_MS,
  );
  return result.rows[0] ?? null;
}

async function tellOwner(ask: DeclinedAsk): Promise<void> {
  if (ask.task_thread_id === null) return;
  const name = ask.reader_name?.trim() ?? '';
  if (name === '') return;
  const language = await userLanguage(String(ask.from_user_id));
  await saveThreadMessage(
    ask.task_thread_id,
    ask.from_user_id,
    'assistant',
    declinedLineForOwner(name, language),
  );
}

/**
 * A go-between's or target's case was closed by their delete: their assistant
 * says so, and a question still waiting there is declined and told to the
 * owner. Best-effort: the close itself has already happened and stands.
 */
export async function tellCaseClosedByDeleting(userId: string, threadId: number): Promise<void> {
  try {
    const declined = await declineWaitingAsk(threadId);
    if (declined !== null) await tellOwner(declined);
    const language = await userLanguage(userId);
    await saveThreadMessage(threadId, Number(userId), 'assistant', closedByYouLine(language));
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`[case-close] thread ${threadId}: not told:`, (err as Error).message);
  }
}
