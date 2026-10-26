import { query } from '../db/postgres/client';

/**
 * #7888 (founder 26 Oct: 200 paid customers by 31 Dec; the target per person
 * is 2 sessions of ~15 minutes a week). Netai recorded no sessions, so the
 * onboarding list could show only active days and message counts.
 *
 * A session is the app open: it starts with the app's first signed-in request
 * and lasts while requests keep coming (the app polls while it is open), until
 * SESSION_IDLE_MINUTES pass with none. Its minutes are last_seen − started.
 */
export const SESSION_IDLE_MINUTES = 30;
const QUERY_TIMEOUT_MS = 4_000;
/** The most people one admin read covers. */
export const MAX_USERS_PER_READ = 500;

export interface AppSessionStats {
  readonly user_id: number;
  readonly sessions_7d: number;
  readonly minutes_7d: number;
  readonly sessions_30d: number;
  readonly last_session_at: string | null;
}

/** Extends the person's open session, or starts a new one when the last went idle. */
export async function noteAppActivity(userId: string): Promise<void> {
  await query(
    `WITH open_session AS (
       UPDATE app_sessions SET last_seen_at = NOW()
        WHERE id = (SELECT id FROM app_sessions
                     WHERE user_id = $1::int
                       AND last_seen_at > NOW() - make_interval(mins => $2)
                     ORDER BY last_seen_at DESC LIMIT 1)
       RETURNING id
     )
     INSERT INTO app_sessions (user_id)
     SELECT $1::int WHERE NOT EXISTS (SELECT 1 FROM open_session)`,
    [userId, SESSION_IDLE_MINUTES],
    QUERY_TIMEOUT_MS,
  );
}

interface StatsRow {
  readonly user_id: number;
  readonly sessions_7d: number;
  readonly minutes_7d: number;
  readonly sessions_30d: number;
  readonly last_session_at: string | null;
}

/** Sessions and minutes for each of these people; a person with none reads as zeros. */
export async function appSessionStats(userIds: readonly number[]): Promise<AppSessionStats[]> {
  if (userIds.length === 0) return [];
  const result = await query<StatsRow>(
    `SELECT u.id AS user_id,
            COUNT(s.id) FILTER (WHERE s.started_at > NOW() - INTERVAL '7 days')::int AS sessions_7d,
            COALESCE(ROUND(SUM(EXTRACT(EPOCH FROM (s.last_seen_at - s.started_at)) / 60)
              FILTER (WHERE s.started_at > NOW() - INTERVAL '7 days')), 0)::int AS minutes_7d,
            COUNT(s.id)::int AS sessions_30d,
            MAX(s.last_seen_at)::text AS last_session_at
       FROM unnest($1::int[]) AS u(id)
       LEFT JOIN app_sessions s ON s.user_id = u.id AND s.started_at > NOW() - INTERVAL '30 days'
      GROUP BY u.id
      ORDER BY u.id`,
    [[...userIds]],
    QUERY_TIMEOUT_MS,
  );
  return result.rows;
}
