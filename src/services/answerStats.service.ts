import { query } from '../db/postgres/client';
import { fieldTerms } from './prematch.service';
import type { AnswerStatsRow } from '../types';

/**
 * 1689 (A6, the intelligence research of 6 October, D679/D680): outcomes were
 * recorded per search and per goal, never per person asked, so the engine
 * could not tell who answers about what, how fast, or who helps. This keeps,
 * per person and per field, separate counters recomputed from the source
 * tables — asks, debrief outcomes, accepted introductions — so a recount can
 * never drift or double. Never shown to a user; the admin page reads it.
 *
 * `referred` stays 0 until referrals exist (A13). `bridged` (introductions he
 * accepted as the go-between) has no field and is kept on the '' row.
 */
const QUERY_TIMEOUT_MS = 8_000;
const FIELD_WORDS = 3;
const SWEEP_LOOKBACK_HOURS = 2;
const SWEEP_USERS_MAX = 500;
const ADMIN_ROWS_MAX = 50;

/** The field an ask is filed under: the goal's first field words, '' when it names none. */
export function askField(goalText: string | null): string {
  return fieldTerms(goalText ?? '')
    .slice(0, FIELD_WORDS)
    .join(' ');
}

/** Recount one person's record from the source tables, every field at once. */
export async function refreshAnswerStats(userId: number): Promise<void> {
  await query(
    `WITH asks AS (
       SELECT COALESCE(ta.field, '') AS field, ta.id, ta.status, ta.created_at, ta.answered_at,
              ta.declined_at, ta.later_at, ta.expired_at
         FROM task_asks ta
        WHERE ta.to_user_id = $1 AND ta.parent_ask_id IS NULL
     ),
     by_field AS (
       SELECT field,
              COUNT(*)::int AS asked,
              COUNT(*) FILTER (WHERE status = 'answered' AND declined_at IS NULL)::int AS yes,
              COUNT(*) FILTER (WHERE declined_at IS NOT NULL)::int AS no,
              COUNT(*) FILTER (WHERE later_at IS NOT NULL)::int AS later,
              COUNT(*) FILTER (WHERE expired_at IS NOT NULL AND answered_at IS NULL)::int AS silent,
              (PERCENTILE_CONT(0.5) WITHIN GROUP (
                 ORDER BY EXTRACT(EPOCH FROM (answered_at - created_at)) / 60)
                 FILTER (WHERE answered_at IS NOT NULL))::real AS median,
              COUNT(*) FILTER (WHERE EXISTS (
                SELECT 1 FROM outcome_events oe
                 WHERE oe.subject_type = 'task_ask' AND oe.subject_id = asks.id::text
                   AND oe.outcome = 'worked'))::int AS helped
         FROM asks GROUP BY field
     ),
     bridge AS (
       SELECT COUNT(*)::int AS bridged FROM introduction_requests
        WHERE mediator_user_id = $1 AND status = 'accepted'
     ),
     rows AS (
       SELECT COALESCE(f.field, '') AS field, COALESCE(f.asked, 0) AS asked,
              COALESCE(f.yes, 0) AS yes, COALESCE(f.no, 0) AS no,
              COALESCE(f.later, 0) AS later, COALESCE(f.silent, 0) AS silent,
              f.median, COALESCE(f.helped, 0) AS helped,
              CASE WHEN COALESCE(f.field, '') = '' THEN (SELECT bridged FROM bridge) ELSE 0 END
                AS bridged
         FROM by_field f
         FULL JOIN (SELECT '' AS field) g ON g.field = f.field
     )
     INSERT INTO answer_stats (user_id, field, asked, yes, no, later, silent,
                               first_answer_minutes_median, helped, bridged, updated_at)
     SELECT $1, field, asked, yes, no, later, silent, median, helped, bridged, NOW() FROM rows
     ON CONFLICT (user_id, field) DO UPDATE SET
       asked = EXCLUDED.asked, yes = EXCLUDED.yes, no = EXCLUDED.no, later = EXCLUDED.later,
       silent = EXCLUDED.silent, first_answer_minutes_median = EXCLUDED.first_answer_minutes_median,
       helped = EXCLUDED.helped, bridged = EXCLUDED.bridged, updated_at = NOW()`,
    [userId],
    QUERY_TIMEOUT_MS,
  );
}

/** Fire-and-forget after a state change: a failed recount is logged, never fails the caller. */
export function recountAnswerStats(userId: number | string): void {
  const id = Number(userId);
  if (!Number.isInteger(id) || id <= 0) return;
  void refreshAnswerStats(id).catch((err: unknown) =>
    // eslint-disable-next-line no-console
    console.error(`[answer-stats] ${id} not recounted:`, (err as Error).message),
  );
}

/** The hourly safety net: everyone asked, answered or debriefed in the last two hours. */
export async function sweepAnswerStats(): Promise<number> {
  const recent = await query<{ user_id: number }>(
    `SELECT DISTINCT to_user_id AS user_id FROM task_asks
      WHERE GREATEST(created_at, answered_at, declined_at, later_at, expired_at)
            > NOW() - make_interval(hours => $1)
      LIMIT $2`,
    [SWEEP_LOOKBACK_HOURS, SWEEP_USERS_MAX],
    QUERY_TIMEOUT_MS,
  );
  for (const row of recent.rows) {
    await refreshAnswerStats(row.user_id).catch((err: unknown) =>
      // eslint-disable-next-line no-console
      console.error(`[answer-stats] ${row.user_id} not recounted:`, (err as Error).message),
    );
  }
  return recent.rows.length;
}

/** The admin per-user page's read-only box. */
export async function answerStatsOf(userId: number): Promise<AnswerStatsRow[]> {
  const result = await query<AnswerStatsRow>(
    `SELECT field, asked, yes, no, referred, later, silent, first_answer_minutes_median,
            helped, bridged
       FROM answer_stats WHERE user_id = $1 ORDER BY asked DESC LIMIT $2`,
    [userId, ADMIN_ROWS_MAX],
    QUERY_TIMEOUT_MS,
  );
  return result.rows;
}
