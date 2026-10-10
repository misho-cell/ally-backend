import { query } from '../db/postgres/client';
import { contactInstructionIn } from './instructionUnsent';

/**
 * 3730 (2) (MASTER TEST RUN chat #8, IN-026, 2 of 2): after the helper agreed,
 * the owner wrote in the SAME goal conversation „ჰკითხე მაიას ისიც, როდის
 * სცალია ბახვას ზარისთვის." — and the run opened a NEW goal (create_task +
 * propose_task_plan), so the helper got a new conversation asking HER when SHE
 * is free. An instruction to ask a contact, on a conversation whose open goal
 * has already asked somebody, is a follow-up on that goal (D316 needs no plan
 * for a person the owner names). So that run does not hold the two tools that
 * open a goal and plan it — no new words to the model, the tools are simply
 * not offered (as inviteHeld does for invite_contact).
 */
const FOLLOW_UP_QUERY_TIMEOUT_MS = 4_000;

/** The tools that open a new goal or plan one. */
export const NEW_GOAL_TOOL_NAMES: ReadonlySet<string> = new Set([
  'create_task',
  'propose_task_plan',
]);

/** Has the open goal on this conversation already asked somebody? Fails towards false. */
async function openGoalHasAsked(threadId: number): Promise<boolean> {
  try {
    const result = await query<{ asked: boolean }>(
      `SELECT EXISTS (
                SELECT 1 FROM tasks k JOIN task_asks a ON a.task_id = k.id
                 WHERE k.thread_id = $1 AND k.status = 'open' AND a.status <> 'cancelled'
              ) AS asked`,
      [threadId],
      FOLLOW_UP_QUERY_TIMEOUT_MS,
    );
    return result.rows[0]?.asked === true;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(`[follow-up-in-goal] thread ${threadId}:`, (err as Error).message);
    return false;
  }
}

/** Is the owner's line a follow-up to ask a contact on a goal that has already asked? */
export async function isFollowUpInGoal(threadId: number, ownerLine: string): Promise<boolean> {
  if (contactInstructionIn(ownerLine) === null) return false;
  return openGoalHasAsked(threadId);
}
