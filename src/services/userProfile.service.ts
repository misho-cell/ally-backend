import { query } from '../db/postgres/client';

export async function getUserProfile(userId: string): Promise<Record<string, string>> {
  const result = await query<{ key: string; value: string }>(
    'SELECT key, value FROM user_profile_kv WHERE user_id = $1 ORDER BY key',
    [userId],
  );
  return Object.fromEntries(result.rows.map((r) => [r.key, r.value]));
}

export async function setUserProfileField(
  userId: string,
  key: string,
  value: string,
  mode: 'set' | 'append' = 'set',
): Promise<void> {
  if (mode === 'append') {
    await query(
      `INSERT INTO user_profile_kv (user_id, key, value)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, key) DO UPDATE
       SET value = user_profile_kv.value || E'\n' || $3,
           updated_at = NOW()`,
      [userId, key, value],
    );
  } else {
    await query(
      `INSERT INTO user_profile_kv (user_id, key, value)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, key) DO UPDATE
       SET value = $3,
           updated_at = NOW()`,
      [userId, key, value],
    );
  }
}

/**
 * Delete profile lines by key, for their owner only.
 *
 * The saved-preference store shortened every answer the assistant gave and
 * there was no way to take a line back (Ticket 9 Task 19.4).
 */
export async function deleteUserProfileFields(
  userId: string,
  keys: string[],
): Promise<{ deleted: number }> {
  if (keys.length === 0) return { deleted: 0 };
  const result = await query(
    'DELETE FROM user_profile_kv WHERE user_id = $1 AND key = ANY($2::text[])',
    [userId, keys],
  );
  return { deleted: result.rowCount ?? 0 };
}
