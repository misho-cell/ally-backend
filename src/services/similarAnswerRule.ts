import { query } from '../db/postgres/client';
import { saveAnswerRule } from './answerRules.service';
import { RunLanguage } from './runLanguage';

/**
 * ROW 302 / D527, the tester's 958 — A STANDING RULE ONLY ON THE OWNER'S TAP.
 *
 * Test 103 answered an ask, the answer went at once (right), and the reply
 * said „I've also saved this so similar questions get answered the same way
 * automatically" — rule 232 was written with no button and no yes. The model
 * had set `remember_for_similar` on the send itself. D120: a rule that answers
 * on someone's behalf needs their permission; D527: it is offered only as an
 * optional button AFTER the answer has gone.
 *
 * So the send never writes a rule. The reply offers this one button; a tap on
 * it — matched by its exact words, like every other server button — writes the
 * rule from the question and answer already in this thread, once.
 */
const QUERY_TIMEOUT_MS = 5_000;
const MAX_KIND_CHARS = 120;

export const SIMILAR_RULE_LABEL: Readonly<Record<RunLanguage, string>> = {
  ka: 'მსგავსებზე ასე ვუპასუხებ',
  en: 'Answer similar ones like this',
  ru: 'Отвечать так на похожие',
  es: 'Responder así a las parecidas',
};

/** True when the message is that button, in any language. */
export function isSimilarRuleTap(message: string): boolean {
  return Object.values(SIMILAR_RULE_LABEL).includes((message ?? '').trim());
}

interface AnsweredAsk {
  readonly question: string;
  readonly answer: string;
}

async function lastAnswerInThread(userId: string, threadId: number): Promise<AnsweredAsk | null> {
  const result = await query<AnsweredAsk>(
    `SELECT question, answer FROM task_asks
      WHERE ask_thread_id = $1 AND to_user_id::text = $2 AND status = 'answered'
        AND answer IS NOT NULL
      ORDER BY id DESC
      LIMIT 1`,
    [threadId, userId],
    QUERY_TIMEOUT_MS,
  );
  return result.rows[0] ?? null;
}

async function ruleAlreadyKept(userId: string, question: string): Promise<boolean> {
  const result = await query<{ id: number }>(
    `SELECT id FROM answer_rules
      WHERE user_id::text = $1 AND active AND sample_question = $2
      LIMIT 1`,
    [userId, question],
    QUERY_TIMEOUT_MS,
  );
  return result.rows.length > 0;
}

const SAVED_LINE =
  '[სერვერმა უკვე შეასრულა: მფლობელმა დააჭირა „მსგავსებზე ასე ვუპასუხებ" — წესი შეინახა. ' +
  'ერთი მოკლე ხაზით დაუდასტურე და უთხარი, რომ მისი ნახვა და წაშლა ნებისმიერ დროს შეუძლია.]';
const ALREADY_LINE =
  '[სერვერი: ეს წესი უკვე შენახულია, ახალი არაფერი ჩაწერილა. ერთი ხაზით უთხარი, რომ უკვე ასეა.]';

/**
 * The tap, acted on by the server. Returns the line the run is told, or null
 * when this message is not the button or the thread holds no answered ask.
 */
export async function saveSimilarRuleOnTap(
  userId: string,
  threadId: number,
  message: string,
): Promise<string | null> {
  if (!isSimilarRuleTap(message)) return null;
  const answered = await lastAnswerInThread(userId, threadId);
  if (answered === null) return null;
  if (await ruleAlreadyKept(userId, answered.question)) return ALREADY_LINE;
  const kind = answered.question.trim().slice(0, MAX_KIND_CHARS);
  const saved = await saveAnswerRule(userId, kind, answered.question, answered.answer);
  return saved.ok
    ? SAVED_LINE
    : `[სერვერი: წესი ვერ შეინახა — ${saved.error}. ერთი ხაზით უთხარი მიზეზი.]`;
}
