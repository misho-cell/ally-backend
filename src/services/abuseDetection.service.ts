import { query } from '../db/postgres/client';

const MAX_QUERY_LENGTH = 200;
// More than this many searches in an hour looks like scraping/automation.
const HOURLY_VOLUME_THRESHOLD = 100;
// Repeatedly targeting the same person in a day looks like stalking.
const SAME_TARGET_THRESHOLD = 20;

/**
 * Log a search and flag suspicious patterns (excessive volume or repeated
 * targeting of the same query). Best-effort: callers invoke fire-and-forget.
 * For now flagged activity is recorded and logged, not hard-blocked.
 */
export async function logSearchActivity(
  userId: string,
  tool: string,
  rawQuery: string,
): Promise<void> {
  const q = rawQuery.trim().slice(0, MAX_QUERY_LENGTH);
  if (!q) return;

  const counts = await query<{ hourly: number; same_target: number }>(
    `SELECT
       COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '60 minutes')                       AS hourly,
       COUNT(*) FILTER (WHERE LOWER(query) = LOWER($2)
                          AND created_at > NOW() - INTERVAL '24 hours')                          AS same_target
     FROM search_activity
     WHERE user_id = $1 AND created_at > NOW() - INTERVAL '24 hours'`,
    [userId, q],
  );

  const row = counts.rows[0];
  const hourly = Number(row?.hourly ?? 0);
  const sameTarget = Number(row?.same_target ?? 0);
  const flagged = hourly >= HOURLY_VOLUME_THRESHOLD || sameTarget >= SAME_TARGET_THRESHOLD;

  await query(
    `INSERT INTO search_activity (user_id, query, tool, flagged) VALUES ($1, $2, $3, $4)`,
    [userId, q, tool, flagged],
  );

  if (flagged) {
    // eslint-disable-next-line no-console
    console.warn(
      `[abuse] user ${userId} flagged — hourly=${hourly}, same_target("${q}")=${sameTarget}`,
    );
  }
}
