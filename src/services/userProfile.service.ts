import { query } from '../db/postgres/client';

export async function getUserProfile(userId: string): Promise<Record<string, string>> {
  const result = await query<{ key: string; value: string }>(
    'SELECT key, value FROM user_profile_kv WHERE user_id = $1 ORDER BY key',
    [userId],
  );
  return Object.fromEntries(result.rows.map((r) => [r.key, r.value]));
}

/**
 * A PROFILE LINE UNDER AN EMPTY KEY IS A LINE NOBODY WILL EVER READ BACK.
 *
 * `key` and `value` are both `TEXT NOT NULL`, so an omitted field used to be a
 * not-null violation — a thrown tool, and nothing catches one. Coercing the
 * door turns that into `''`, which is worse in the quiet way: the row stores,
 * `ON CONFLICT (user_id, key)` collapses every such save onto the SAME row,
 * and no read for a real key finds it. So the refusal lives here, and the
 * answer says which it was rather than nothing at all.
 */
export const PROFILE_LINE_NEEDS_BOTH = 'Pass both a key and a value.';

export async function setUserProfileField(
  userId: string,
  key: string,
  value: string,
  mode: 'set' | 'append' = 'set',
): Promise<{ saved: boolean; error?: string }> {
  if (key.trim() === '' || value.trim() === '') {
    return { saved: false, error: PROFILE_LINE_NEEDS_BOTH };
  }
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
  return { saved: true };
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
