import { createHash } from 'crypto';
import { query } from '../db/postgres/client';

/**
 * The store behind push quiet hours (pushQuietHours.ts): a push that falls
 * between 23:00 and 09:30 on a device's clock waits here until 09:30, then the
 * releaser in notification.service.ts sends it. Nothing in here sends.
 */
const QUERY_TIMEOUT_MS = 5_000;

export interface HeldPayload {
  readonly title: string;
  readonly body: string;
  readonly url?: string;
}

export interface HeldPush {
  readonly id: number;
  readonly userId: string;
  readonly endpoint: string;
  readonly payload: HeldPayload;
}

/** The same words to the same device are one push: a stable key over them. */
function payloadKey(payload: HeldPayload): string {
  return createHash('sha256')
    .update(`${payload.title}\u0000${payload.body}\u0000${payload.url ?? ''}`)
    .digest('hex');
}

/** Holds one push for one device until `releaseAt`; an identical one already held stays one. */
export async function holdPush(
  userId: string,
  endpoint: string,
  payload: HeldPayload,
  releaseAt: Date,
): Promise<void> {
  await query(
    `INSERT INTO held_pushes (user_id, endpoint, payload, payload_key, release_at)
     VALUES ($1, $2, $3::jsonb, $4, $5)
     ON CONFLICT (endpoint, payload_key) DO NOTHING`,
    [userId, endpoint, JSON.stringify(payload), payloadKey(payload), releaseAt],
    QUERY_TIMEOUT_MS,
  );
}

/** Held pushes whose time has come, oldest first, at most `limit`. */
export async function duePushes(limit: number): Promise<HeldPush[]> {
  const result = await query<{
    id: string;
    user_id: number;
    endpoint: string;
    payload: HeldPayload;
  }>(
    `SELECT id, user_id, endpoint, payload FROM held_pushes
      WHERE release_at <= NOW()
      ORDER BY created_at, id
      LIMIT $1`,
    [limit],
    QUERY_TIMEOUT_MS,
  );
  return result.rows.map((row) => ({
    id: Number(row.id),
    userId: String(row.user_id),
    endpoint: row.endpoint,
    payload: row.payload,
  }));
}

/** Forgets a held push once it has been dealt with (sent, skipped, or its device is gone). */
export async function releaseHeld(id: number): Promise<void> {
  await query(`DELETE FROM held_pushes WHERE id = $1`, [id], QUERY_TIMEOUT_MS);
}
