import { query } from '../db/postgres/client';

/**
 * #2113: whether this conversation carries a goal that has sent nothing to
 * anybody — no ask, no question held on an evening card, no introduction
 * request. Read-only. False when there is no goal, and false when the read
 * fails: a guard that cannot look does not accuse.
 */
const QUERY_TIMEOUT_MS = 4_000;

export async function goalSentNothing(threadId: number): Promise<boolean> {
  try {
    const result = await query<{ silent: boolean }>(
      `SELECT EXISTS (SELECT 1 FROM tasks k WHERE k.thread_id = $1)
              AND NOT EXISTS (
                SELECT 1 FROM tasks k JOIN task_asks a ON a.task_id = k.id WHERE k.thread_id = $1)
              AND NOT EXISTS (
                SELECT 1 FROM tasks k JOIN held_asks h ON h.task_id = k.id WHERE k.thread_id = $1)
              AND NOT EXISTS (
                SELECT 1 FROM tasks k JOIN introduction_requests r ON r.requester_task_id = k.id
                 WHERE k.thread_id = $1) AS silent`,
      [threadId],
      QUERY_TIMEOUT_MS,
    );
    return result.rows[0]?.silent === true;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(`[goal-sent-nothing] thread ${threadId}:`, (err as Error).message);
    return false;
  }
}
