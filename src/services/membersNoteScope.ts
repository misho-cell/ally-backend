import { query } from '../db/postgres/client';

/**
 * 2908 (the master test run's 45679, WB-015, SD-015, CH-007, AB-022, GP-036):
 * the „your friends on Netai were not offered" note (#960, 1487) fired where
 * it did not belong, and each time added a second message, often a second
 * plan and a second „დავიწყო?", 40–65 seconds later. The note belongs only to
 * the first answer to a need people could help with. It is out of place when:
 *
 *   - the owner said to write to nobody (44137, 44139);
 *   - the goal already has a plan, or is no longer open: a follow-up, a status
 *     question or a closing turn (44113, 44065–44067, 44150, 44068, 44076),
 *     and the run that just proposed the plan (44063, 44146, 44270);
 *   - the line is a follow-up question („რატომ…?", „რა არის ახალი?");
 *   - the reply already says nobody fits (44129, 44274). A plain „not found"
 *     is not that: friends on Netai may still know someone, which is #960.
 */
const WRITE_TO_NOBODY_RE =
  /(არავის\s+(?:არ\s+)?(?:მისწერ|მიწერ|დაუკავშირდ|ჰკითხ)|ნუ\s+(?:მისწერ|დაუკავშირდ|ჰკითხ)|write to (?:nobody|no one)|(?:do not|don't|never)\s+(?:write|message|contact|ask)\b)/iu;
const FOLLOW_UP_RE =
  /^\s*(?:რატომ|რა\s+არის\s+ახალი|რა\s+ხდება|რა\s+სიახლე|სად\s+ვართ|why\b|what'?s\s+new|any\s+(?:news|update))/iu;
const NOBODY_FITS_RE =
  /(შესაფერისი[^.!?\n]{0,60}ვერ|ვერავინ[^.!?\n]{0,40}(?:ვიპოვე|გამოვყავი|მოიძებნა)|nobody (?:in your network )?(?:fits|suits|matches)|no one (?:fits|suits|matches))/iu;
const GOAL_READ_TIMEOUT_MS = 3_000;

export interface GoalState {
  /** The goal's own words: title, description and brief. */
  readonly text: string;
  readonly hasPlan: boolean;
  readonly open: boolean;
}

/** True when the members note must not fire on this turn. */
export function membersNoteOutOfPlace(
  ownerLine: string,
  finalText: string,
  goal: GoalState | null,
): boolean {
  if (WRITE_TO_NOBODY_RE.test(ownerLine) || FOLLOW_UP_RE.test(ownerLine)) return true;
  if (NOBODY_FITS_RE.test(finalText)) return true;
  if (goal === null) return false;
  return goal.hasPlan || !goal.open || WRITE_TO_NOBODY_RE.test(goal.text);
}

/** The newest goal on the conversation; null when there is none or the read fails. */
export async function goalStateOnThread(threadId: number): Promise<GoalState | null> {
  try {
    const result = await query<{ text: string; has_plan: boolean; open: boolean }>(
      `SELECT CONCAT_WS(' ', title, description, brief) AS text,
              (plan IS NOT NULL OR plan_proposed IS NOT NULL) AS has_plan,
              status <> 'closed' AS open
         FROM tasks WHERE thread_id = $1 ORDER BY id DESC LIMIT 1`,
      [threadId],
      GOAL_READ_TIMEOUT_MS,
    );
    const row = result.rows[0];
    return row === undefined ? null : { text: row.text, hasPlan: row.has_plan, open: row.open };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[members] could not read the goal:', (err as Error).message);
    return null;
  }
}
