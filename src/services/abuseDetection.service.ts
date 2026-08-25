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
  resultCount: number | null = null,
): Promise<number | null> {
  const q = rawQuery.trim().slice(0, MAX_QUERY_LENGTH);
  if (!q) return null;

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

  // A row that returned nothing already has its outcome — "no name found",
  // the first rung of the outcome ladder (ticket 6, founder's answer ②).
  // Every other rung (refused/accepted/sent/replied/followed_up) needs a
  // real signal from the conversation, so it starts NULL, not guessed.
  const outcome = resultCount === 0 ? 'no_result' : null;
  // Computed in JS, not a SQL CASE reusing $6: live-caught (25 Aug) — a
  // bare parameter placeholder used twice in one statement (once as a
  // plain value, once inside a CASE) reads as two different inferred types
  // on this Postgres version and fails with "could not determine data type
  // of parameter $6". Same bug class already documented in
  // contacts.service.ts; this INSERT was hitting it on every single
  // search, silently — logSearchActivity threw, runLoggedSearch's .catch
  // swallowed it, and no error ever reached a log.
  const outcomeUpdatedAt = outcome !== null ? new Date() : null;

  const inserted = await query<{ id: number }>(
    `INSERT INTO search_activity (user_id, query, tool, flagged, result_count, outcome, outcome_updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id`,
    [userId, q, tool, flagged, resultCount, outcome, outcomeUpdatedAt],
  );

  if (flagged) {
    // eslint-disable-next-line no-console
    console.warn(
      `[abuse] user ${userId} flagged — hourly=${hourly}, same_target("${q}")=${sameTarget}`,
    );
  }

  return inserted.rows[0]?.id ?? null;
}
