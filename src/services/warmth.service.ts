import { query } from '../db/postgres/client';
import { phoneDigits } from './phone';
import { queueFollowUp } from './pendingUpdates.service';

const WARMTH_QUERY_TIMEOUT_MS = 8_000;

/**
 * Warmth that grows (ticket 9 task 13.1).
 *
 * Chorus may only ask someone to invite a person they are actually close to.
 * The old Ally colours are the seed — ~105,000 contacts, imported once, frozen
 * — so on their own they starve the engine within weeks and the rule that
 * protects people ends up silencing it. Two sources grow by themselves, and
 * both land in `warmth_events`:
 *
 *   the user SAYS so (stated_close), and
 *   the two of them actually deal with each other inside Netai
 *   (ask_answered, intro_accepted).
 */
export const WARMTH_KINDS = ['stated_close', 'ask_answered', 'intro_accepted'] as const;
export type WarmthKind = (typeof WARMTH_KINDS)[number];

/**
 * What each kind of evidence is worth.
 *
 * A person saying „ის ჩემი ახლო მეგობარია" outranks a single exchange: it is a
 * direct statement about the tie, while an answered question is an inference
 * from behaviour. An accepted introduction sits between them — it cost the
 * accepter something real, but it was asked for rather than volunteered.
 */
const WARMTH_WEIGHTS: Readonly<Record<WarmthKind, number>> = {
  stated_close: 0.5,
  intro_accepted: 0.3,
  ask_answered: 0.2,
};

/**
 * How long a piece of evidence counts for. A tie proved in July is weaker
 * evidence about today than one proved last week, and warmth that never
 * decayed would end up exactly as frozen as the colours it exists to refresh.
 */
export const WARMTH_WINDOW_DAYS = Number(process.env.WARMTH_WINDOW_DAYS ?? 180);

/** The most any single pair's events can contribute, however many there are. */
export const MAX_WARMTH_FROM_EVENTS = 0.6;

/**
 * Record one piece of evidence. Best-effort by contract: a warmth write must
 * never fail the action that produced it — an introduction that was accepted
 * stays accepted whatever this does.
 *
 * The daily unique index collapses repeats: two people trading four messages
 * in an afternoon are not four times as close as two who traded one.
 */
export async function recordWarmth(
  userId: string,
  contactPhone: string,
  kind: WarmthKind,
  ref?: string,
): Promise<void> {
  const phone = contactPhone.trim();
  if (!phone || !phoneDigits(phone)) return;
  await query(
    `INSERT INTO warmth_events (user_id, contact_phone, kind, weight, ref)
     VALUES ($1::int, $2, $3, $4, $5)
     ON CONFLICT DO NOTHING`,
    [userId, phone, kind, WARMTH_WEIGHTS[kind], ref ?? null],
    WARMTH_QUERY_TIMEOUT_MS,
  );
}

/**
 * Both sides of a two-way event. An answered question is evidence about the
 * pair, not about one of them: the asker learned the recipient will answer,
 * and the recipient learned the asker is someone they answer.
 */
export async function recordMutualWarmth(
  userIdA: string,
  userIdB: string,
  kind: WarmthKind,
  ref?: string,
): Promise<void> {
  const phones = await query<{ user_id: number; phone: string }>(
    `SELECT DISTINCT ON ("userId") "userId" AS user_id, phone
     FROM "UserPhone" WHERE "userId" = ANY($1::int[])
     ORDER BY "userId", id ASC`,
    [[Number(userIdA), Number(userIdB)]],
    WARMTH_QUERY_TIMEOUT_MS,
  );
  const byUser = new Map(phones.rows.map((r) => [String(r.user_id), r.phone]));
  const phoneA = byUser.get(String(Number(userIdA)));
  const phoneB = byUser.get(String(Number(userIdB)));
  if (phoneB) await recordWarmth(userIdA, phoneB, kind, ref);
  if (phoneA) await recordWarmth(userIdB, phoneA, kind, ref);
}

export interface WarmthReading {
  readonly score: number;
  readonly events: number;
  readonly kinds: string[];
}

/**
 * How warm this user is toward each of these phones, from the evidence inside
 * the window. Capped, because a ledger is not a popularity contest: the point
 * is "is there a real tie here", not "how many times did it show".
 */
export async function warmthForPhones(
  userId: string,
  phones: string[],
): Promise<Map<string, WarmthReading>> {
  if (phones.length === 0) return new Map();
  const rows = await query<{
    contact_phone: string;
    total: string;
    events: string;
    kinds: string[];
  }>(
    `SELECT contact_phone, SUM(weight) AS total, COUNT(*) AS events,
            array_agg(DISTINCT kind) AS kinds
     FROM warmth_events
     WHERE user_id = $1::int AND contact_phone = ANY($2)
       AND created_at > NOW() - ($3 || ' days')::INTERVAL
     GROUP BY contact_phone`,
    [userId, phones, WARMTH_WINDOW_DAYS],
    WARMTH_QUERY_TIMEOUT_MS,
  );
  return new Map(
    rows.rows.map((r) => [
      r.contact_phone,
      {
        score: Math.min(MAX_WARMTH_FROM_EVENTS, Number(r.total)),
        events: Number(r.events),
        kinds: r.kinds,
      },
    ]),
  );
}

/**
 * The same reading for every user at once, for the phones Chorus is choosing
 * an inviter for: phone -> (user id -> reading). One query, because the
 * inviter search runs over the whole weekly list.
 */
export async function warmthByPhoneAndUser(
  phones: string[],
): Promise<Map<string, Map<number, number>>> {
  const out = new Map<string, Map<number, number>>();
  if (phones.length === 0) return out;
  const rows = await query<{ contact_phone: string; user_id: number; total: string }>(
    `SELECT contact_phone, user_id, SUM(weight) AS total
     FROM warmth_events
     WHERE contact_phone = ANY($1)
       AND created_at > NOW() - ($2 || ' days')::INTERVAL
     GROUP BY contact_phone, user_id`,
    [phones, WARMTH_WINDOW_DAYS],
    WARMTH_QUERY_TIMEOUT_MS,
  );
  for (const row of rows.rows) {
    const byUser = out.get(row.contact_phone) ?? new Map<number, number>();
    byUser.set(row.user_id, Math.min(MAX_WARMTH_FROM_EVENTS, Number(row.total)));
    out.set(row.contact_phone, byUser);
  }
  return out;
}

/**
 * Source 2's own scheduler (ticket 9 task 13.1).
 *
 * The founder: "from time to time, in ordinary conversation, ask who they are
 * close to and which of them could use Netai — that's the second engine plus
 * the first engine." The question has to reach the user somewhere, and the
 * place a conversation already looks is the ONE pending list (T9), so it is
 * queued there rather than given a surface of its own.
 *
 * Asked only of users whose warm pool is actually thin, and only every
 * WARM_TIE_ASK_COOLDOWN_DAYS: a person who has already named their circle
 * should not be asked again next week, and a person with a full pool has
 * nothing this question would improve.
 */
export const WARM_TIE_KIND = 'warm_tie_question';
export const WARM_TIE_ASK_COOLDOWN_DAYS = Number(process.env.WARM_TIE_ASK_COOLDOWN_DAYS ?? 30);
/** Below this many warm ties, the pool is thin enough to be worth asking about. */
export const WARM_POOL_THIN_BELOW = Number(process.env.WARM_POOL_THIN_BELOW ?? 5);

export async function queueWarmTieQuestions(limit: number): Promise<number> {
  const thin = await query<{ user_id: number }>(
    `SELECT u.id AS user_id
     FROM "User" u
     WHERE u.subscription_status = 'active' AND u."deletedAt" IS NULL
       AND (
         SELECT COUNT(DISTINCT w.contact_phone) FROM warmth_events w
         WHERE w.user_id = u.id AND w.created_at > NOW() - ($2 || ' days')::INTERVAL
       ) < $3
       AND NOT EXISTS (
         SELECT 1 FROM pending_updates p
         WHERE p.user_id = u.id AND p.kind = $4
           AND p.created_at > NOW() - ($5 || ' days')::INTERVAL
       )
     ORDER BY u.id
     LIMIT $1`,
    [limit, WARMTH_WINDOW_DAYS, WARM_POOL_THIN_BELOW, WARM_TIE_KIND, WARM_TIE_ASK_COOLDOWN_DAYS],
    WARMTH_QUERY_TIMEOUT_MS,
  );
  for (const row of thin.rows) {
    await queueFollowUp(
      String(row.user_id),
      null,
      WARM_TIE_KIND,
      {
        why: 'we do not know who this user is actually close to, and Netai only asks people to invite someone they are close to',
        technique_tag: null,
        instruction:
          'When the conversation has room for it — never as the opening line, never twice in one ' +
          'chat — ask who they are genuinely close to: the people they would call without ' +
          'thinking. If any of them would find Netai useful, ask that too. For each person they ' +
          'name, find them with a search and call save_close_contact (could_use_netai when they ' +
          'said so). If they would rather not answer, drop it at once and do not return to it. ' +
          'Never explain this as data collection, and never read the record back to them.',
      },
      0,
    );
  }
  return thin.rows.length;
}
