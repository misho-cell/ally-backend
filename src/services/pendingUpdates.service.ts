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

/**
 * Ticket 20 row 124. How many BLOCKING GOAL QUESTIONS one read may release.
 *
 * Thread 15676, 16 September: the owner asked one line — „ვინ არის ახლა
 * თბილისის მერი?" — and between 11:59:11 and 11:59:15 received the answer plus
 * seven cards, one per waiting goal: plumber, the FreeUni dean, air
 * conditioner, Batumi electrician, boat engine, Wissol, Batumi photographer.
 *
 * The overall cap of ten was doing its job and was simply far too loose for
 * this class. Read live while fixing it: of the updates due right now, the
 * worst account carries FOUR news items and TWELVE blocking questions. The
 * pile-up is entirely in the sticky class, because news is staggered at queue
 * time by DRIP_BURST and a sticky question is not — it is re-armed on a flat
 * 24-hour cooldown, so every question a goal has ever asked comes due together
 * and stays that way.
 *
 * A question is a request for the owner to do work. Seven of them at once is
 * not seven requests, it is none. One is a request.
 *
 * The skipped ones are NOT spent: they stay `held` with their release_at in
 * the past, so the next read takes the next one. The released one goes to the
 * back of the queue for a day. That is what makes a cap here safe and a cap at
 * delivery time a silent swallow — by the time the rows reach the chat they
 * have already been marked.
 */
const MAX_BLOCKING_QUESTIONS_PER_READ = 1;

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
    // Ticket 20 row 124: the oldest few, with the blocking questions among them
    // capped separately and much harder. `due` ranks each class on its own so
    // one loud class cannot crowd the other out in either direction.
    `WITH due AS (
       SELECT p.id, p.release_at,
              (p.kind = ANY($3::text[])) AS sticky,
              ROW_NUMBER() OVER (
                PARTITION BY (p.kind = ANY($3::text[]))
                ORDER BY p.release_at ASC, p.id ASC
              ) AS rank_in_class
       FROM pending_updates p
       LEFT JOIN tasks t ON t.id = p.task_id AND t.user_id = $1
       WHERE p.user_id = $1 AND p.status = 'held' AND p.release_at <= NOW()
         AND (p.task_id IS NULL OR t.status <> 'closed')
         -- A sticky item survives only while its goal is still waiting.
         AND (p.kind <> ALL($3::text[]) OR t.pending_question_at IS NOT NULL)
     ), chosen AS (
       SELECT id FROM due
       WHERE NOT sticky OR rank_in_class <= $5
       ORDER BY release_at ASC, id ASC
       LIMIT $2
     )
     UPDATE pending_updates pu
     SET status = CASE WHEN pu.kind = ANY($3::text[]) THEN 'held' ELSE 'seen' END,
         release_at = CASE WHEN pu.kind = ANY($3::text[])
                           THEN NOW() + ($4 || ' hours')::INTERVAL
                           ELSE pu.release_at END
     WHERE pu.id IN (SELECT id FROM chosen)
     RETURNING pu.id, pu.task_id, pu.kind, pu.payload`,
    [
      userId,
      MAX_RELEASED_PER_READ,
      STICKY_KINDS,
      STICKY_COOLDOWN_HOURS,
      MAX_BLOCKING_QUESTIONS_PER_READ,
    ],
    QUERY_TIMEOUT_MS,
  );
  return result.rows;
}

const SEEN_LIST_LIMIT = 50;

/**
 * Updates ALREADY shown once (status 'seen'), newest first — a read that
 * changes nothing. Ticket 12 Task 32: the connector showed 1 item on an
 * account holding 24 rows; the 23 others had been surfaced in earlier
 * conversations. This is how the connector lists them again when asked,
 * without turning news back into news. Ticket 13 Task 32: a shown row on a
 * goal that has since closed is still a row the account holds — the founder's
 * data page counts it — so nothing is filtered here; the two counts must agree.
 */
export async function listSeenUpdates(
  userId: string,
  limit = SEEN_LIST_LIMIT,
): Promise<PendingUpdate[]> {
  const result = await query<PendingUpdate>(
    `SELECT p.id, p.task_id, p.kind, p.payload
     FROM pending_updates p
     WHERE p.user_id = $1 AND p.status = 'seen'
     ORDER BY p.release_at DESC
     LIMIT $2`,
    [userId, Math.max(1, Math.min(limit, SEEN_LIST_LIMIT))],
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
