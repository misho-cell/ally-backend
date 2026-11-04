import { query } from '../db/postgres/client';

/**
 * #8620 (the tester's DR7, thread 74218; Misho's yes, 4 Nov): the wake said
 * „Tornike did not answer in 2 days — ask Iro?", but Tornike had answered on
 * 1 Nov. The run had opened a second goal from the same conversation
 * (create_task) and asked him there, so the answer belonged to that goal and
 * the first goal's wake never saw it. A goal's scheduled wake is now told of
 * the answers that came in, in other goals started from its conversation.
 */
const QUERY_TIMEOUT_MS = 3_000;
const LOOKBACK_DAYS = 14;
const MAX_ANSWERS = 5;
const MAX_ANSWER_CHARS = 300;

export interface AnswerElsewhere {
  readonly helper: string;
  readonly answer: string;
}

/** Answers that came in, in other goals asked from this conversation. */
export async function answersInSiblingGoals(
  threadId: number,
  taskId: number,
): Promise<AnswerElsewhere[]> {
  const result = await query<{ helper: string | null; answer: string }>(
    `SELECT u.name AS helper, a.answer
       FROM task_asks a
       LEFT JOIN "User" u ON u.id = a.to_user_id
      WHERE a.origin_thread_id = $1 AND a.task_id <> $2
        AND a.answer IS NOT NULL AND TRIM(a.answer) <> ''
        AND a.answered_at > NOW() - ($3 || ' days')::interval
      ORDER BY a.answered_at DESC
      LIMIT $4`,
    [threadId, taskId, LOOKBACK_DAYS, MAX_ANSWERS],
    QUERY_TIMEOUT_MS,
  );
  return result.rows.map((row) => ({
    helper: (row.helper ?? '').trim(),
    answer: row.answer.trim().slice(0, MAX_ANSWER_CHARS),
  }));
}

/** The wake's note about them; null when there are none. */
export function answersElsewhereNote(answers: readonly AnswerElsewhere[]): string | null {
  if (answers.length === 0) return null;
  const lines = answers.map((a) => `• ${a.helper === '' ? 'კონტაქტი' : a.helper}: „${a.answer}"`);
  return (
    'ამავე საუბრიდან დაწყებულ სხვა მიზანში პასუხი უკვე მოვიდა — ნუ დაწერ, რომ ამ ადამიანმა არ ' +
    'გიპასუხა, და მას ხელახლა ნუ ჰკითხავ:\n' +
    lines.join('\n')
  );
}
