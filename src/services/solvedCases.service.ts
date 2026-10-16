import { query } from '../db/postgres/client';
import { AskTap, askTapOf } from './askOpening';

/**
 * 5446, founder ruling D792 (16 Oct). The real TBC loan was unblocked by hand:
 * Tornike asked Beso, Beso pointed to Tiko, Tiko asked her bank contact. Netai
 * learned nothing from it, so the next friend with the same problem would not
 * be pointed to Tiko.
 *
 * When a goal closes as solved, every helper who answered its question — and
 * did not say no — is remembered with the goal's own words. The helper is not
 * asked (founder), and the record is never shown or quoted: search reads it to
 * find and rank the helper, and the model offers them without a reason (BP).
 */
const QUERY_TIMEOUT_MS = 5_000;
/** Enough of a goal's words to match on; a description longer than this adds noise. */
const MAX_CASE_CHARS = 1_000;

interface AnsweredAsk {
  readonly to_user_id: number;
  readonly from_user_id: number;
  readonly answer: string | null;
  readonly case_text: string;
}

/** An answer that only says no, or later, did not help, whatever the goal's ending. */
export function answerHelped(answer: string | null): boolean {
  if (answer === null || answer.trim() === '') return false;
  const tap = askTapOf(answer);
  return tap !== AskTap.Decline && tap !== AskTap.Later;
}

async function answeredAsks(taskId: number): Promise<AnsweredAsk[]> {
  const result = await query<AnsweredAsk>(
    `SELECT DISTINCT ON (ta.to_user_id) ta.to_user_id, ta.from_user_id, ta.answer,
            LEFT(TRIM(t.title || ' ' || COALESCE(t.description, '')), ${MAX_CASE_CHARS}) AS case_text
       FROM task_asks ta
       JOIN tasks t ON t.id = ta.task_id
      WHERE ta.task_id = $1
        AND ta.status = 'answered'
        AND ta.declined_at IS NULL
        AND ta.to_user_id IS NOT NULL
      ORDER BY ta.to_user_id, ta.answered_at DESC NULLS LAST`,
    [taskId],
    QUERY_TIMEOUT_MS,
  );
  return result.rows;
}

/** Remember the solved goal on each helper who answered it; returns how many were written. */
export async function recordSolvedCases(taskId: number): Promise<number> {
  const helpers = (await answeredAsks(taskId)).filter((ask) => answerHelped(ask.answer));
  if (helpers.length === 0) return 0;
  const result = await query(
    `INSERT INTO helper_solved_cases (helper_user_id, owner_user_id, task_id, case_text)
     SELECT x.helper, x.owner, $1, x.case_text
       FROM UNNEST($2::int[], $3::int[], $4::text[]) AS x(helper, owner, case_text)
     ON CONFLICT (helper_user_id, task_id) DO NOTHING`,
    [
      taskId,
      helpers.map((h) => h.to_user_id),
      helpers.map((h) => h.from_user_id),
      helpers.map((h) => h.case_text),
    ],
    QUERY_TIMEOUT_MS,
  );
  return result.rowCount ?? 0;
}
