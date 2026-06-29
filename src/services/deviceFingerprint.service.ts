import { query } from '../db/postgres/client';

const MAX_FIELD = 256;

/**
 * Record (or update) a device seen for a user. Best-effort: callers invoke
 * this fire-and-forget so it never blocks or fails a request.
 */
export async function recordDevice(
  userId: string,
  deviceId: string,
  userAgent: string | null,
  ip: string | null,
): Promise<void> {
  await query(
    `INSERT INTO device_fingerprints (user_id, device_id, user_agent, ip)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id, device_id)
     DO UPDATE SET request_count = device_fingerprints.request_count + 1,
                   last_seen     = NOW(),
                   user_agent    = EXCLUDED.user_agent,
                   ip            = EXCLUDED.ip`,
    [userId, deviceId.slice(0, MAX_FIELD), userAgent?.slice(0, MAX_FIELD) ?? null, ip],
  );
}
