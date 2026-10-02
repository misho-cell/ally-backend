import { query } from '../db/postgres/client';
import { hideGoal } from './taskStore.service';
import { deleteThread } from './threads.service';

/**
 * §82 — clear ONE named goal so its owner can retest from a blank page.
 *
 * Giorgi, 2 October (G-004, team task #265); Misho's direct word in the session:
 * „წაშალე, ჩუმად დახურე". The goal's open asks are cancelled WITHOUT the note
 * `cancelAsksForTask` writes to each recipient, its pending cards are dropped,
 * its thread is deleted exactly as the owner's own delete does it, and the
 * closed goal is hidden from every goal list.
 *
 * ONE ID, NEVER A RULE (the principle /admin/goals/hidden carries): it acts on
 * the goal it is named and refuses anything else.
 */
const QUERY_TIMEOUT_MS = 8_000;

export enum ClearRefusal {
  NoSuchGoal = 'no_such_goal',
  NoThread = 'goal_has_no_thread',
  BadReason = 'bad_reason',
}

export interface ClearedGoal {
  readonly taskId: number;
  readonly owner: string;
  readonly threadId: number;
  readonly asksCancelled: number;
  readonly cardsDropped: number;
  readonly threadDeleted: boolean;
  readonly hidden: string;
}

export type ClearOutcome =
  | { readonly ok: true; readonly cleared: ClearedGoal }
  | { readonly ok: false; readonly refusal: ClearRefusal };

/** Silent on purpose: a cancellation notice is a message, and Misho said none. */
async function cancelOpenAsksSilently(taskId: number): Promise<number> {
  const result = await query(
    `UPDATE task_asks SET status = 'cancelled' WHERE task_id = $1 AND status = 'sent'`,
    [taskId],
    QUERY_TIMEOUT_MS,
  );
  return result.rowCount ?? 0;
}

async function dropPendingCards(taskId: number): Promise<number> {
  const result = await query(
    `DELETE FROM pending_updates WHERE (payload->>'task_id') = $1`,
    [String(taskId)],
    QUERY_TIMEOUT_MS,
  );
  return result.rowCount ?? 0;
}

export async function clearGoalForRetest(taskId: number, reason: string): Promise<ClearOutcome> {
  const why = reason.trim();
  if (why.length < 3) return { ok: false, refusal: ClearRefusal.BadReason };
  const goal = await query<{ user_id: string; thread_id: number | null }>(
    `SELECT user_id, thread_id FROM tasks WHERE id = $1 LIMIT 1`,
    [taskId],
    QUERY_TIMEOUT_MS,
  );
  const found = goal.rows[0];
  if (found === undefined) return { ok: false, refusal: ClearRefusal.NoSuchGoal };
  if (found.thread_id === null) return { ok: false, refusal: ClearRefusal.NoThread };

  // Asks first: deleteThread's own comment says cancelling them is the
  // caller's job, before the transaction.
  const asksCancelled = await cancelOpenAsksSilently(taskId);
  const cardsDropped = await dropPendingCards(taskId);
  const deleted = await deleteThread(found.user_id, found.thread_id);
  const hidden = await hideGoal(taskId, 'admin:§82', why);
  return {
    ok: true,
    cleared: {
      taskId,
      owner: found.user_id,
      threadId: found.thread_id,
      asksCancelled,
      cardsDropped,
      threadDeleted: deleted.deleted,
      hidden,
    },
  };
}
