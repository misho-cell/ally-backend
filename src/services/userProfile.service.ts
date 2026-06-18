import { query } from '../db/postgres/client';

export async function getUserProfile(userId: string): Promise<Record<string, unknown>> {
  const result = await query<{ profile_data: Record<string, unknown> }>(
    'SELECT profile_data FROM user_profiles WHERE user_id = $1',
    [userId],
  );
  return result.rows[0]?.profile_data ?? {};
}

export async function setUserProfileField(
  userId: string,
  key: string,
  value: string,
): Promise<void> {
  await query(
    `INSERT INTO user_profiles (user_id, profile_data, updated_at)
     VALUES ($1, jsonb_build_object($2::text, $3::text), NOW())
     ON CONFLICT (user_id) DO UPDATE
     SET profile_data = user_profiles.profile_data || jsonb_build_object($2::text, $3::text),
         updated_at = NOW()`,
    [userId, key, value],
  );
}
