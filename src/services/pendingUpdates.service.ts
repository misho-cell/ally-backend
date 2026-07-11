import { query } from '../db/postgres/client';

const QUERY_TIMEOUT_MS = 8_000;
// Release a small burst immediately, then one per day. The Nth queued-but-unseen
// update for a user is delayed by max(0, N - DRIP_BURST) days.
const DRIP_BURST = 3;
const MAX_RELEASED_PER_READ = 10;

export interface PendingUpdate {
  id: number;
  task_id: number | null;
  kind: string;
  payload: Record<string, unknown>;
}

/**
 * Queue a found result for a goal. The release time is staggered by how many
 * updates are already held for the user, so the first few surface now and the
 * rest trickle out one per day — extras are held, never dropped or invented.
 */
export async function queueResult(
  userId: string,
  taskId: number | null,
  kind: string,
  payload: Record<string, unknown>,
): Promise<{ id: number }> {
  const result = await query<{ id: number }>(
    `INSERT INTO pending_updates (user_id, task_id, kind, payload, release_at)
     VALUES ($1, $2, $3, $4::jsonb,
             NOW() + GREATEST(
               0,
               (SELECT COUNT(*) FROM pending_updates WHERE user_id = $1 AND status = 'held')
               - ($5 - 1)
             ) * INTERVAL '1 day')
     RETURNING id`,
    [userId, taskId, kind, JSON.stringify(payload), DRIP_BURST],
    QUERY_TIMEOUT_MS,
  );
  return { id: result.rows[0].id };
}

/**
 * The updates due now (release_at reached), flipped to 'seen' so each is
 * reported once. Held-but-not-yet-due updates stay for a later day.
 */
export async function getPendingUpdates(userId: string): Promise<PendingUpdate[]> {
  const result = await query<PendingUpdate>(
    `UPDATE pending_updates pu
     SET status = 'seen'
     WHERE pu.id IN (
       SELECT p.id FROM pending_updates p
       LEFT JOIN tasks t ON t.id = p.task_id AND t.user_id = $1
       WHERE p.user_id = $1 AND p.status = 'held' AND p.release_at <= NOW()
         AND (p.task_id IS NULL OR t.status <> 'closed')
       ORDER BY p.release_at ASC
       LIMIT $2
     )
     RETURNING pu.id, pu.task_id, pu.kind, pu.payload`,
    [userId, MAX_RELEASED_PER_READ],
    QUERY_TIMEOUT_MS,
  );
  return result.rows;
}

/**
 * How many updates are still held for the user (due later) — the "more coming"
 * hint. Excludes updates for a closed goal (they never release), and must be
 * read AFTER getPendingUpdates in the same turn so the just-released ones are
 * already 'seen' and not counted.
 */
export async function countHeldUpdates(userId: string): Promise<number> {
  const result = await query<{ count: string }>(
    `SELECT COUNT(*) AS count
     FROM pending_updates p
     LEFT JOIN tasks t ON t.id = p.task_id AND t.user_id = $1
     WHERE p.user_id = $1 AND p.status = 'held'
       AND (p.task_id IS NULL OR t.status <> 'closed')`,
    [userId],
    QUERY_TIMEOUT_MS,
  );
  return Number(result.rows[0]?.count ?? 0);
}
