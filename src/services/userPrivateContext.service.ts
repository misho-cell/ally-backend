import { query } from '../db/postgres/client';

export async function getPrivateContext(userId: string): Promise<Record<string, string>> {
  const result = await query<{ key: string; value: string }>(
    'SELECT key, value FROM user_private_context WHERE user_id = $1 ORDER BY key',
    [userId],
  );
  return Object.fromEntries(result.rows.map((r) => [r.key, r.value]));
}

export async function savePrivateContext(
  userId: string,
  key: string,
  value: string,
  mode: 'set' | 'append',
): Promise<void> {
  if (mode === 'append') {
    await query(
      `INSERT INTO user_private_context (user_id, key, value)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, key) DO UPDATE
       SET value = user_private_context.value || E'\n' || $3,
           updated_at = NOW()`,
      [userId, key, value],
    );
  } else {
    await query(
      `INSERT INTO user_private_context (user_id, key, value)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, key) DO UPDATE
       SET value = $3,
           updated_at = NOW()`,
      [userId, key, value],
    );
  }
}
