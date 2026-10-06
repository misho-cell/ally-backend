import { query } from '../db/postgres/client';
import { PendingUpdate } from './pendingUpdates.service';

/**
 * #2080 (the founder, D703, 7 Oct): „mark as unread / follow up".
 *
 * Opening the updates page spends every card into „already read", and a
 * person who wants to come back to one had no way to keep it in front of
 * them. A one-tap flag on an update card or on a დავალება row now keeps it on
 * top — out of the read list, counted in the sidebar — until a second tap
 * clears it. Stored on the server, so it survives a reload and holds on every
 * device.
 *
 * Every write is scoped to the owner: an id alone is never trusted, and
 * another person's row is a „not found", never a write.
 */
const QUERY_TIMEOUT_MS = 5_000;
const FOLLOWED_LIST_LIMIT = 50;

/** Flags or clears a conversation row. Null when it is not the caller's. */
export async function setThreadFollowed(
  threadId: number,
  userId: string,
  followed: boolean,
): Promise<boolean | null> {
  const result = await query<{ followed: boolean }>(
    `UPDATE threads
        SET followed_at = CASE WHEN $3 THEN COALESCE(followed_at, NOW()) ELSE NULL END
      WHERE id = $1 AND user_id = $2
      RETURNING followed_at IS NOT NULL AS followed`,
    [threadId, userId, followed],
    QUERY_TIMEOUT_MS,
  );
  return result.rows[0]?.followed ?? null;
}

/** Flags or clears an update card. False when it is not the caller's. */
export async function setUpdateFollowed(
  userId: string,
  updateId: number,
  followed: boolean,
): Promise<boolean> {
  const result = await query(
    `UPDATE pending_updates
        SET followed_at = CASE WHEN $3 THEN COALESCE(followed_at, NOW()) ELSE NULL END
      WHERE id = $1 AND user_id = $2`,
    [updateId, userId, followed],
    QUERY_TIMEOUT_MS,
  );
  return (result.rowCount ?? 0) > 0;
}

/** The flagged cards already shown once, most recently flagged first. */
export async function listFollowedUpdates(userId: string): Promise<PendingUpdate[]> {
  const result = await query<PendingUpdate>(
    `SELECT p.id, p.task_id, p.kind, p.payload
       FROM pending_updates p
      WHERE p.user_id = $1 AND p.status = 'seen' AND p.followed_at IS NOT NULL
      ORDER BY p.followed_at DESC, p.id DESC
      LIMIT $2`,
    [userId, FOLLOWED_LIST_LIMIT],
    QUERY_TIMEOUT_MS,
  );
  return result.rows;
}

/** How many flagged cards the sidebar count carries — the same rows the list shows. */
export async function countFollowedUpdates(userId: string): Promise<number> {
  const result = await query<{ n: number }>(
    `SELECT COUNT(*)::int AS n
       FROM pending_updates p
      WHERE p.user_id = $1 AND p.status = 'seen' AND p.followed_at IS NOT NULL`,
    [userId],
    QUERY_TIMEOUT_MS,
  );
  return result.rows[0]?.n ?? 0;
}
