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
    `UPDATE pending_updates
     SET status = 'seen'
     WHERE id IN (
       SELECT id FROM pending_updates
       WHERE user_id = $1 AND status = 'held' AND release_at <= NOW()
       ORDER BY release_at ASC
       LIMIT $2
     )
     RETURNING id, task_id, kind, payload`,
    [userId, MAX_RELEASED_PER_READ],
    QUERY_TIMEOUT_MS,
  );
  return result.rows;
}

/** How many updates are still held for the user (due later) — for a "more coming" hint. */
export async function countHeldUpdates(userId: string): Promise<number> {
  const result = await query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM pending_updates WHERE user_id = $1 AND status = 'held'`,
    [userId],
    QUERY_TIMEOUT_MS,
  );
  return Number(result.rows[0]?.count ?? 0);
}
