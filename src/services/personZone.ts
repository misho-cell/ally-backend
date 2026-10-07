import { query } from '../db/postgres/client';
import { pushTimeZone } from './pushQuietHours';

const ZONE_QUERY_TIMEOUT_MS = 5_000;

/** The person's zone: the device they used last that said one; Tbilisi otherwise. */
export async function personZone(userId: number): Promise<string> {
  const result = await query<{ time_zone: string | null }>(
    `SELECT time_zone FROM push_subscriptions
      WHERE user_id = $1 AND time_zone IS NOT NULL
      ORDER BY last_seen_at DESC NULLS LAST, id DESC
      LIMIT 1`,
    [userId],
    ZONE_QUERY_TIMEOUT_MS,
  );
  return pushTimeZone(result.rows[0]?.time_zone);
}
