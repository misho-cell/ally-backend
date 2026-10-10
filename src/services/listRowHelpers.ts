import { query } from '../db/postgres/client';
import { ASKED_AS_THE_ASKER_SAVED_THEM } from './savedNameSql';

/**
 * Box 50986 (goal 24125, needs12.csv): a list whose rows ARE the needs
 * („ელექტრიკოსი, ნოტარიუსი, …"), worked by asking a helper. The helper named a
 * notary and a photographer; the answer sat only on the electrician row it
 * was asked from, and the notary and photographer rows still read „nobody /
 * no route". A row named in a helper's answer points at that answer.
 */
const QUERY_TIMEOUT_MS = 5_000;
const MAX_ANSWERS_READ = 30;
/** A Georgian word this long or longer is matched by its stem (ნოტარიუსი → ნოტარიუს-ს, -მა …). */
const STEMMED_WORD_MIN_CHARS = 5;
const GEORGIAN_FINAL_I = 'ი';

export interface GoalAnswer {
  readonly helper: string | null;
  readonly answer: string;
}

/** The answered asks this owner sent on this goal, newest first. */
export async function answersOnGoal(userId: string, taskId: number): Promise<GoalAnswer[]> {
  const result = await query<{ helper: string | null; answer: string }>(
    `SELECT ${ASKED_AS_THE_ASKER_SAVED_THEM} AS helper, ta.answer
       FROM task_asks ta
      WHERE ta.task_id = $1 AND ta.from_user_id = $2 AND ta.status = 'answered'
        AND ta.answer IS NOT NULL AND ta.parent_ask_id IS NULL
      ORDER BY ta.answered_at DESC NULLS LAST
      LIMIT $3`,
    [taskId, userId, MAX_ANSWERS_READ],
    QUERY_TIMEOUT_MS,
  );
  return result.rows;
}

/** The part of a row's label every case form of it keeps. */
function labelStem(label: string): string {
  const word = label.trim().toLowerCase();
  return word.length >= STEMMED_WORD_MIN_CHARS && word.endsWith(GEORGIAN_FINAL_I)
    ? word.slice(0, -GEORGIAN_FINAL_I.length)
    : word;
}

/** Does this answer speak of this row („ნოტარიუსი" in „ნოტარიუსს ვიცნობ")? */
export function answerNamesRow(answer: string, label: string): boolean {
  const stem = labelStem(label);
  return stem !== '' && answer.toLowerCase().includes(stem);
}

/** The first answer that speaks of this row, if any. */
export function answerForRow(
  answers: readonly GoalAnswer[],
  label: string,
): GoalAnswer | undefined {
  return answers.find((a) => answerNamesRow(a.answer, label));
}
