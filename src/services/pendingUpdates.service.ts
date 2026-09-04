import { query } from '../db/postgres/client';

const QUERY_TIMEOUT_MS = 8_000;
// Release a small burst immediately, then one per day. The Nth queued-but-unseen
// update for a user is delayed by max(0, N - DRIP_BURST) days.
const DRIP_BURST = 3;
const MAX_RELEASED_PER_READ = 10;

// The typed items of T9's ONE surface (ticket 7 task 13): every conversation
// trigger flows through this list, never through a private side channel.
// 'found_result'-style kinds from queue_result remain free-form; these five
// are the engine triggers, each queued with a payload carrying who / why /
// technique_tag / the thread or search it belongs to.
export type EngineTriggerKind =
  | 'search_followup'
  | 'thanks_loop'
  | 'chorus_ask'
  | 'debrief'
  | 'curiosity';

export interface PendingUpdate {
  id: number;
  task_id: number | null;
  kind: string;
  payload: Record<string, unknown>;
}

/**
 * Queue a found result for a goal. The release time is staggered by how many
 * updates are already held for the user, so the first few surface now and the
 * rest trickle out one per day — extras are held, never dropped or invented.
 */
export async function queueResult(
  userId: string,
  taskId: number | null,
  kind: string,
  payload: Record<string, unknown>,
): Promise<{ id: number }> {
  const result = await query<{ id: number }>(
    `INSERT INTO pending_updates (user_id, task_id, kind, payload, release_at)
     VALUES ($1, $2, $3, $4::jsonb,
             NOW() + GREATEST(
               0,
               (SELECT COUNT(*) FROM pending_updates WHERE user_id = $1 AND status = 'held')
               - ($5 - 1)
             ) * INTERVAL '1 day')
     RETURNING id`,
    [userId, taskId, kind, JSON.stringify(payload), DRIP_BURST],
    QUERY_TIMEOUT_MS,
  );
  return { id: result.rows[0].id };
}

/**
 * Queue an update for a FIXED future date — a scheduled check-in, not a
 * "found result" waiting to trickle out. Deliberately separate from
 * queueResult: that one's release_at is staggered by how many updates are
 * already held, which is wrong here — a search outcome follow-up means
 * "ask in exactly N days", not "whenever the drip queue gets to it".
 */
/**
 * Kinds that describe a STATE rather than an event, and so must not be spent
 * by being read once (ticket 9 task 20 a).
 */
const STICKY_KINDS = ['goal_question'];

/**
 * How long a sticky item waits before it may surface again. A day: long
 * enough that it is not nagging inside one conversation, short enough that a
 * goal cannot sit blocked for a week on nobody's screen.
 */
const STICKY_COOLDOWN_HOURS = 24;

export async function queueFollowUp(
  userId: string,
  taskId: number | null,
  kind: string,
  payload: Record<string, unknown>,
  delayDays: number,
): Promise<{ id: number }> {
  const result = await query<{ id: number }>(
    `INSERT INTO pending_updates (user_id, task_id, kind, payload, release_at)
     VALUES ($1, $2, $3, $4::jsonb, NOW() + ($5 || ' days')::INTERVAL)
     RETURNING id`,
    [userId, taskId, kind, JSON.stringify(payload), delayDays],
    QUERY_TIMEOUT_MS,
  );
  return { id: result.rows[0].id };
}

/**
 * The updates due now (release_at reached), flipped to 'seen' so each is
 * reported once. Held-but-not-yet-due updates stay for a later day.
 */
export async function getPendingUpdates(userId: string): Promise<PendingUpdate[]> {
  const result = await query<PendingUpdate>(
    // Most updates are news: shown once, then done. A GOAL'S BLOCKING QUESTION
    // is not news — it is a state the goal sits in until somebody answers, and
    // it was being consumed like news (ticket 9 task 20 a).
    //
    // Read live on 4 September: eleven open goals carried an unanswered
    // question and nearly every one of their updates was already `seen` —
    // goal 1156 blocked since 31 August, its single update marked seen in the
    // same minute it was created. Whichever conversation happened next ate the
    // question, and the goal then waited forever for an answer nobody was ever
    // shown. That is the tester's sentence, exactly.
    //
    // So a sticky kind goes back to 'held' with a cooldown instead of being
    // spent. It stops coming back the moment the question is answered or
    // retracted — both paths delete the held row — or the goal closes.
    `UPDATE pending_updates pu
     SET status = CASE WHEN pu.kind = ANY($3::text[]) THEN 'held' ELSE 'seen' END,
         release_at = CASE WHEN pu.kind = ANY($3::text[])
                           THEN NOW() + ($4 || ' hours')::INTERVAL
                           ELSE pu.release_at END
     WHERE pu.id IN (
       SELECT p.id FROM pending_updates p
       LEFT JOIN tasks t ON t.id = p.task_id AND t.user_id = $1
       WHERE p.user_id = $1 AND p.status = 'held' AND p.release_at <= NOW()
         AND (p.task_id IS NULL OR t.status <> 'closed')
         -- A sticky item survives only while its goal is still waiting.
         AND (p.kind <> ALL($3::text[]) OR t.pending_question_at IS NOT NULL)
       ORDER BY p.release_at ASC
       LIMIT $2
     )
     RETURNING pu.id, pu.task_id, pu.kind, pu.payload`,
    [userId, MAX_RELEASED_PER_READ, STICKY_KINDS, STICKY_COOLDOWN_HOURS],
    QUERY_TIMEOUT_MS,
  );
  return result.rows;
}

/**
 * How many updates are still held for the user (due later) — the "more coming"
 * hint. Excludes updates for a closed goal (they never release), and must be
 * read AFTER getPendingUpdates in the same turn so the just-released ones are
 * already 'seen' and not counted.
 */
export async function countHeldUpdates(userId: string): Promise<number> {
  const result = await query<{ count: string }>(
    `SELECT COUNT(*) AS count
     FROM pending_updates p
     LEFT JOIN tasks t ON t.id = p.task_id AND t.user_id = $1
     WHERE p.user_id = $1 AND p.status = 'held'
       AND (p.task_id IS NULL OR t.status <> 'closed')`,
    [userId],
    QUERY_TIMEOUT_MS,
  );
  return Number(result.rows[0]?.count ?? 0);
}
