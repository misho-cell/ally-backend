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
 * ROW 230 (D462) — SHOWN WITHOUT BEING SPENT, AND THE RECORD HAS TO AGREE WITH
 * THE SCREEN.
 *
 * The founder decided on 23 September that the weekly summary is a CARD OF ITS
 * OWN at the top of the updates screen, staying there until the person opens
 * it, and — his second answer, on my own question — „the card must NOT be
 * spent by merely opening the screen."
 *
 * The frontend built the card and then told me, unprompted, that they could
 * only keep half of that: their side finds the summary in `due` OR `seen`, so
 * the card stays visually, but `GET /updates` had already written „seen" into
 * the row. Their words: „ჩანაწერი ტყუის" — the record lies. If anybody ever
 * measures how many people read the weekly summary, the number is wrong, and
 * it is wrong in the exact way this project has spent a week hunting: a record
 * that claims more than happened.
 *
 * So this kind is released and LEFT HELD. It is spent by `markUpdateSeen`,
 * which the card's own button calls — „seen" then means „tapped", which is the
 * only thing it was ever supposed to mean.
 *
 * NOT THE SAME AS STICKY. A sticky item goes back to held WITH A COOLDOWN
 * because it is a question waiting for an answer and must return on its own. A
 * summary is not waiting for anything: it stays until it is read, and there is
 * exactly one a week, so no cooldown and no cap.
 */
const UNSPENT_KINDS = ['weekly_summary'];

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
         -- ⚠️ AN ANSWERED REQUEST KEEPS NO CARD (tester, seat Test 4,
         -- 25 September). Two intro cards from 23 September were still
         -- offering Connect / Decline / Remind me later on requests that had
         -- been answered; „Remind me later" came back 409 „you already
         -- answered this one". The founder's rule is that after an answer,
         -- zero buttons remain.
         --
         -- resolveIntroductionRequest now retires the row when it answers.
         -- THIS IS THE HALF THAT REACHES THE ROWS ALREADY STRANDED, which
         -- nothing written at answer time can ever go back and collect — and
         -- it is also the guard for the next surface that answers a request
         -- without knowing this row exists.
         --
         -- Compared as TEXT, not cast to int: the payload is ours today and a
         -- cast is a query that throws on the day it stops being. And no
         -- backtick in here either: this SQL lives in a template literal, and
         -- the first version of this comment ended the string with one.
         AND (p.kind <> 'intro_request' OR EXISTS (
               SELECT 1 FROM introduction_requests ir
                WHERE ir.id::text = p.payload->>'request_id'
                  AND ir.status = 'pending'))
     ), chosen AS (
       SELECT id FROM due
       WHERE NOT sticky OR rank_in_class <= $5
       ORDER BY release_at ASC, id ASC
       LIMIT $2
     )
     UPDATE pending_updates pu
     -- Row 230: an UNSPENT kind is shown and left exactly as it was — no
     -- 'seen', and no cooldown either, because it is not waiting for an answer
     -- and there is one a week. It is spent by markUpdateSeen, when the person
     -- actually taps the card.
     SET status = CASE
                    WHEN pu.kind = ANY($6::text[]) THEN pu.status
                    WHEN pu.kind = ANY($3::text[]) THEN 'held'
                    ELSE 'seen' END,
         release_at = CASE
                        WHEN pu.kind = ANY($6::text[]) THEN pu.release_at
                        WHEN pu.kind = ANY($3::text[])
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
      UNSPENT_KINDS,
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
/**
 * ⚠️ „N MORE UPDATES ARE WAITING" WITHOUT SAYING WHAT THEY ARE — row 250, and
 * the tester raised it THREE times on 25 September before I took it.
 *
 * The founder's rule: it should say what they are, or not appear. A bare
 * number is a demand on somebody's attention with nothing to weigh it
 * against — „9 more updates" could be nine search results or nine people
 * waiting on an answer, and those deserve very different amounts of worry.
 *
 * So the same rows, grouped. The two queries share their WHERE clause
 * literally, through the constant below, because a count that disagrees with
 * its own breakdown is the „due/held" fault this file already carries a scar
 * from — two numbers about one thing, and the reader believes the wrong one.
 */
const HELD_AND_STILL_REAL = `
     FROM pending_updates p
     LEFT JOIN tasks t ON t.id = p.task_id AND t.user_id = $1
     WHERE p.user_id = $1 AND p.status = 'held'
       AND (p.task_id IS NULL OR t.status <> 'closed')
       -- An answered introduction is not something still waiting on you, and
       -- this count is the „N more updates are waiting" line a real person
       -- read on her phone and could not make sense of. Same guard as the
       -- release query above.
       AND (p.kind <> 'intro_request' OR EXISTS (
             SELECT 1 FROM introduction_requests ir
              WHERE ir.id::text = p.payload->>'request_id'
                AND ir.status = 'pending'))`;

/** What is waiting, by kind — so the card can name them instead of counting them. */
export async function heldUpdatesByKind(userId: string): Promise<Record<string, number>> {
  const result = await query<{ kind: string; count: string }>(
    `SELECT p.kind, COUNT(*) AS count ${HELD_AND_STILL_REAL} GROUP BY p.kind`,
    [userId],
    QUERY_TIMEOUT_MS,
  );
  const out: Record<string, number> = {};
  for (const row of result.rows) out[row.kind] = Number(row.count);
  return out;
}

export async function countHeldUpdates(userId: string): Promise<number> {
  const result = await query<{ count: string }>(
    `SELECT COUNT(*) AS count ${HELD_AND_STILL_REAL}`,
    [userId],
    QUERY_TIMEOUT_MS,
  );
  return Number(result.rows[0]?.count ?? 0);
}

/**
 * The ONE identifier for a waiting update, shared by every surface that names
 * one — the connector and the REST route both import these rather than each
 * spelling `upd_` out for itself.
 *
 * This is not tidiness. `POST /requests/:ref/:action` takes a UUID while
 * `check_my_inbox` hands back `req_<id>`: two identifiers with one name, and
 * feeding one to the other is a 400. That has blocked the tester's seat since
 * the beginning and cost a route (`GET /requests`) to work around. The second
 * time a ref is invented in two places is a choice, not an accident.
 */
export const UPDATE_REF_PREFIX = 'upd_';

export function toUpdateRef(updateId: number): string {
  return UPDATE_REF_PREFIX + String(updateId);
}

/** The id, or null — never a guess, and never a NaN reaching a query. */
export function parseUpdateRef(ref: string): number | null {
  if (!ref.startsWith(UPDATE_REF_PREFIX)) return null;
  const id = Number(ref.slice(UPDATE_REF_PREFIX.length));
  return Number.isInteger(id) && id > 0 ? id : null;
}

/** „Later" means a day unless the person named one. Clamped so nothing is lost for a year. */
export const MIN_SNOOZE_DAYS = 1;
export const MAX_SNOOZE_DAYS = 30;
export const DEFAULT_SNOOZE_DAYS = 1;

/**
 * Row 73 — „Later" should postpone an update, not spend it.
 *
 * WHY IT COULD NOT WORK BEFORE, and it is not the reason the row gives.
 *
 * The row reads as a missing button. It is not: `getPendingUpdates` flips a
 * non-sticky row to `'seen'` AT THE MOMENT IT IS SHOWN, because most updates
 * are news and news is reported once. So by the time a person has read the
 * line and tapped „Later", the row is already spent — there is nothing left
 * to postpone, and the offer does not come back.
 *
 * And nothing could have addressed it anyway: **the update's id reached
 * neither the client nor the model.** `get_pending_updates` returned
 * `task_ref`, `kind` and the payload, and no identifier of its own, so no
 * surface — a route, a tool, a button — could have named which update to hold.
 * The frontend confirmed the other half on 21 September: their „Later" on a
 * pending update sends no call at all, because there was none to send.
 *
 * So this takes a spent row back: `'seen'` to `'held'`, with `release_at`
 * pushed to when the person asked for it. `release_at` already exists and
 * already gates the read — no migration, and the rest of the mechanism is
 * untouched.
 *
 * SCOPED TO THE OWNER, like every id-taking path in this codebase: the
 * `user_id = $2` is not decoration. An update id alone is never trusted.
 *
 * Returns false when the row is not theirs or does not exist — the caller says
 * so rather than reporting a postponement that never happened.
 */
export async function snoozeUpdate(
  userId: string,
  updateId: number,
  days: number = DEFAULT_SNOOZE_DAYS,
): Promise<boolean> {
  const clamped = Math.min(MAX_SNOOZE_DAYS, Math.max(MIN_SNOOZE_DAYS, Math.trunc(days)));
  const result = await query(
    `UPDATE pending_updates
     SET status = 'held', release_at = NOW() + ($3 || ' days')::INTERVAL
     WHERE id = $1 AND user_id = $2`,
    [updateId, userId, clamped],
    QUERY_TIMEOUT_MS,
  );
  return (result.rowCount ?? 0) > 0;
}

/**
 * ROW 230 (D462) — THE TAP, which is what „seen" was always supposed to mean.
 *
 * An UNSPENT kind is released by `getPendingUpdates` and left held, so the
 * card survives a person opening the screen and walking past it. This is the
 * other half: the card's own button spends it, once, and only then.
 *
 * Scoped to the owner, so another account's row is a no-op and not a write.
 * Idempotent by nature — a second tap sets 'seen' on a row that already says
 * it, which is the right answer to a double tap on a phone.
 */
export async function markUpdateSeen(userId: string, updateId: number): Promise<boolean> {
  const result = await query(
    `UPDATE pending_updates SET status = 'seen' WHERE id = $1 AND user_id = $2`,
    [updateId, userId],
    QUERY_TIMEOUT_MS,
  );
  return (result.rowCount ?? 0) > 0;
}
