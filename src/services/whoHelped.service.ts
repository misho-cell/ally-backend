import { query } from '../db/postgres/client';
import { phoneDigits } from './phone';
import { accountDetailsFor, fetchAccountStates } from './tools/membership';

/**
 * 5446 (D792), the case the ruling was made on. The real TBC loan was unblocked
 * outside Netai: Tornike asked Beso, Beso pointed to Tiko, Tiko called her bank
 * contact. The tester's 63100 told Netai the same kind of story afterwards
 * („I asked Tamar, she called her TBC contact, the loan was approved"), and
 * nothing was learned, because a case is remembered only when a goal closes
 * with a helper's answer given INSIDE Netai (solvedCases.service.ts).
 *
 * This is the other door: the owner says who solved it, and the person is
 * remembered on the same table with the goal's words, read by search the same
 * way, never shown and never asked of the helper. On since the founder's yes on
 * its text (D797, box 63200); WHO_HELPED_TOOL=false turns it off.
 */
export const WHO_HELPED_TOOL_ON = process.env.WHO_HELPED_TOOL?.trim() !== 'false';

const QUERY_TIMEOUT_MS = 5_000;
/** The same length solvedCases keeps; a longer story adds noise to the match. */
const MAX_CASE_CHARS = 1_000;

export enum WhoHelpedRefusal {
  NoPhone = 'no_phone',
  NotOwnContact = 'not_own_contact',
  NotAMember = 'not_a_member',
  Self = 'self',
  NoGoal = 'no_goal',
  NoWords = 'no_words',
}

export type WhoHelpedOutcome =
  | { readonly recorded: true; readonly alreadyKnown: boolean }
  | { readonly recorded: false; readonly reason: WhoHelpedRefusal };

export interface WhoHelpedInput {
  readonly ownerId: string;
  readonly phone: string;
  readonly whatWasSolved: string;
  /** The goal the owner named; null takes the conversation's newest goal. */
  readonly taskId: number | null;
  readonly threadId: number | null;
}

interface GoalRow {
  readonly id: number;
  readonly words: string;
}

/** The goal this help belongs to: the one named if it is the owner's, else the conversation's newest. */
async function goalFor(input: WhoHelpedInput): Promise<GoalRow | null> {
  const result = await query<GoalRow>(
    `SELECT id, TRIM(title || ' ' || COALESCE(description, '')) AS words
       FROM tasks
      WHERE user_id::text = $1
        AND (($2::int IS NOT NULL AND id = $2) OR ($2::int IS NULL AND thread_id = $3))
      ORDER BY id DESC
      LIMIT 1`,
    [input.ownerId, input.taskId, input.threadId],
    QUERY_TIMEOUT_MS,
  );
  return result.rows[0] ?? null;
}

/** Only somebody the owner has saved can be named as the one who helped. */
async function inOwnersPhonebook(ownerId: string, digits: string): Promise<boolean> {
  const result = await query<{ one: number }>(
    `SELECT 1 AS one FROM "UserAlias"
      WHERE "contactId" = $1 AND regexp_replace(phone, '\\D', '', 'g') = $2
      LIMIT 1`,
    [ownerId, digits],
    QUERY_TIMEOUT_MS,
  );
  return result.rows.length > 0;
}

/** The goal's words, then the owner's own account of how it was solved. */
export function caseTextOf(goalWords: string, whatWasSolved: string): string {
  return [goalWords.trim(), whatWasSolved.trim()]
    .filter((part) => part !== '')
    .join(' ')
    .slice(0, MAX_CASE_CHARS);
}

async function helperOf(input: WhoHelpedInput, digits: string): Promise<number | WhoHelpedRefusal> {
  if (!(await inOwnersPhonebook(input.ownerId, digits))) return WhoHelpedRefusal.NotOwnContact;
  const helper = accountDetailsFor(await fetchAccountStates([digits]), digits);
  if (helper.user_id === null || helper.state !== 'netai_user') return WhoHelpedRefusal.NotAMember;
  if (String(helper.user_id) === input.ownerId) return WhoHelpedRefusal.Self;
  return helper.user_id;
}

/** Remember the person the owner says solved the goal; refuses rather than guessing. */
export async function recordWhoHelped(input: WhoHelpedInput): Promise<WhoHelpedOutcome> {
  const digits = phoneDigits(input.phone);
  if (digits === '') return { recorded: false, reason: WhoHelpedRefusal.NoPhone };
  if (input.whatWasSolved.trim() === '')
    return { recorded: false, reason: WhoHelpedRefusal.NoWords };
  const helper = await helperOf(input, digits);
  if (typeof helper !== 'number') return { recorded: false, reason: helper };
  const goal = await goalFor(input);
  if (goal === null) return { recorded: false, reason: WhoHelpedRefusal.NoGoal };
  const result = await query(
    `INSERT INTO helper_solved_cases (helper_user_id, owner_user_id, task_id, case_text)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (helper_user_id, task_id) DO NOTHING`,
    [helper, Number(input.ownerId), goal.id, caseTextOf(goal.words, input.whatWasSolved)],
    QUERY_TIMEOUT_MS,
  );
  return { recorded: true, alreadyKnown: (result.rowCount ?? 0) === 0 };
}
