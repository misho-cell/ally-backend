import { query } from '../db/postgres/client';
import { usedNetai } from './netaiMembership';

/**
 * ROW 274 — THE PILOT NUMBERS THE FOUNDER READS ON ONE PAGE.
 *
 * His words through the tester: „good and important — we need to build it."
 * Eight numbers, for any date range. `pilotReport` already had two of them
 * (paid after 20 days, and the asks split), so this file is the other six and
 * it sits beside that one rather than inside it — that file is about ACTIVITY
 * per day and this is about OUTCOMES per person, and merging them would make
 * one object whose fields mean different things depending on which half you
 * are reading.
 *
 * ⚠️ WHAT CANNOT BE BUILT, said here rather than quietly omitted.
 *
 * His fourth number is „asks: answered, declined, never answered — kept
 * apart". THERE IS NO DECLINE IN THE DATA. `task_asks.status` holds exactly
 * three values on the live base — `sent`, `answered`, `cancelled` — and a
 * person who says „no, I don't know anybody" is recorded as ANSWERED, because
 * they answered. Nothing anywhere distinguishes a refusal from a help.
 *
 * So „declined" is not a number this report is withholding; it is a fact the
 * product has never captured, and it needs a column and a path before it can
 * be counted. Reporting answered-minus-something, or guessing from the text,
 * would put a figure on a page that nobody could defend.
 */

const OUTCOMES_TIMEOUT_MS = 8_000;

/** Fictional seats are excluded everywhere here — the founder is asking about people. */
const NOT_A_SEAT = `NOT EXISTS (SELECT 1 FROM test_seats ts WHERE ts.user_id = u.id)`;

export interface PilotOutcomes {
  /** Every number below is about people who joined in this window. */
  readonly from: string;
  readonly to: string;
  /**
   * 1 — STARTED USING. Of those who joined, how many gave Netai a task of
   * their own. Helpers are counted apart, because somebody who has only ever
   * ANSWERED other people's questions has not started using it in the sense he
   * is asking about — and counting them in would make the number flattering
   * and useless.
   */
  readonly joined: number;
  readonly started_a_goal: number;
  readonly only_ever_helped: number;
  /**
   * ⚠️ WHAT THESE THREE ARE ABOUT, in the payload, because leaving it implicit
   * made a true number look impossible.
   *
   * The tester: „started_a_goal 0 is impossible (93 goals open)." It is not
   * impossible and it is not a bug — the two numbers are scoped differently
   * and nothing on the page said so. `started_a_goal` is about the people who
   * JOINED IN THIS WINDOW; `goals` below is about every real person's goals,
   * whenever they joined.
   *
   * Measured while fixing this: the 93 open goals belong to **12 real people**,
   * the earliest of whom joined in November 2023. Of the 32 who joined in the
   * last 28 days, **none** has started a goal.
   *
   * So the honest reading is not „the number is broken". It is that a month of
   * arrivals produced no goals, which is the founder's central question and the
   * answer is zero. Naming the scope is what lets that be read at all.
   */
  readonly scope: {
    readonly started_a_goal: string;
    readonly goals: string;
    /** Every real person with a goal, whenever they joined. The 93's owners. */
    readonly people_with_any_goal: number;
  };
  /**
   * 2 — SOLVED, beside the states it could have been in instead. Current
   * state, not per day: „how many are solved" is a question about now.
   */
  readonly goals: {
    readonly resolved: number;
    readonly stopped: number;
    readonly open: number;
    readonly paused: number;
    readonly waiting_on_a_reply: number;
  };
  /**
   * 3 — FIRST USEFUL PROGRESS, and the definition is carried WITH the number
   * because it is a choice and not a measurement.
   *
   * „The first useful answer or agreed action" is not a thing the database
   * knows. What it does know is when a goal opened and when the first question
   * asked on its behalf came BACK ANSWERED, and that is the closest honest
   * proxy. It will read LONGER than the founder means for goals solved by a
   * search rather than by a person, and those are simply absent from it.
   */
  readonly first_answer: {
    readonly definition: string;
    readonly goals_measured: number;
    readonly median_minutes: number | null;
  };
  /**
   * 5 and 6 — PAID AFTER 20 DAYS lives in `pilotReport`. This is PAID AGAIN:
   * the same people coming back a second and a third time, with the dates,
   * which is the number that separates a trial from a business.
   */
  readonly paid: {
    readonly people_who_paid_once: number;
    readonly people_who_paid_twice: number;
    readonly people_who_paid_three_times: number;
    readonly latest_payment: string | null;
  };
  /**
   * 7 — BROUGHT OTHERS, and of them who actually turned up. The same
   * three-way split the referral tree uses, for the same reason: 805 accounts
   * carry an inviter and 8 of them have ever opened Netai.
   */
  readonly brought_others: {
    readonly people_who_invited_somebody: number;
    readonly their_invitees: number;
    readonly invitees_who_opened_netai: number;
    readonly invitees_who_started_a_goal: number;
    readonly invitees_who_paid: number;
  };
  /**
   * 8 — THE COST CHECK. The whole chain is charged to the asker and helpers
   * are charged nothing. This is a line that proves it rather than a number
   * anybody has to trust: if `helpers_charged` is ever above zero, something
   * has broken that nobody would otherwise notice.
   */
  readonly chain_cost: {
    readonly askers_charged: number;
    /**
     * ⚠️ THIS NUMBER TOOK THREE WRONG QUERIES TO GET RIGHT, and each wrong one
     * would have put a false alarm on the founder's page.
     *
     * 1. Any spend by somebody who has received an ask → 11 „helpers charged".
     *    Wrong question: a helper chatting to Netai for THEMSELVES is charged,
     *    and should be. D123 is about the ask chain, not about the person.
     * 2. Spend on an ask THREAD, from `usage_events` → 529 rows, 18 helpers.
     *    Wrong TABLE. `usage_events` records cost against the conversation;
     *    the wallet debit goes to the payer. D123 is about the wallet, which
     *    is what the tester measured when they proved helper = 0.
     * 3. Wallet debits on ask runs over 28 days → 65, four helpers. Right
     *    question, right table, and still a false alarm: every one of them is
     *    dated 30 August to 4 September, BEFORE the fix. Reporting them would
     *    have shown a closed bug as live.
     *
     * Zero in the last fourteen days and the last seven. The most recent is
     * 4 September, and the field below says so rather than leaving a reader to
     * assume that zero has always been zero.
     */
    readonly helpers_charged: number;
    /** When a helper was last billed for a chain — null once nothing ever has been. */
    readonly helper_last_charged: string | null;
  };
  /**
   * 4 — THE ASKS, SPLIT, which is the number that was missing until today.
   *
   * ⚠️ `declined` COUNTS ONLY WHAT WAS RECORDED, AND RECORDING STARTED ON
   * 26 SEPTEMBER. Every ask answered before that carries no decline either
   * way, because there was nothing to carry it in — so a small number here
   * does NOT mean few people said no, it means few people have been asked
   * since the button existed. `declines_recorded_since` is on the object so a
   * reader cannot see the count without seeing that.
   */
  readonly asks: {
    readonly answered: number;
    readonly declined: number;
    readonly never_answered: number;
    readonly declines_recorded_since: string;
  };
  /** Named here too, so a screen cannot show the eight without the missing one. */
  readonly not_measurable: readonly string[];
}

/**
 * ⚠️ THIS WAS „NOT MEASURABLE" UNTIL 26 SEPTEMBER, and the replacement note
 * has to be as careful as the old one was.
 *
 * The old text said a refusal could not be told from a help, which was true:
 * `task_asks.status` held three values and somebody saying „no, I don't know
 * anybody" was stored as ANSWERED. Row 274 gave it a column and a button.
 *
 * What it did NOT do is go back. Every ask answered before today carries no
 * decline either way — not „was not a decline", but „nobody recorded it" —
 * and a count that omitted to say so would read as „almost nobody refuses",
 * which is a claim about people rather than about the data.
 */
const DECLINES_RECORDED_SINCE = '2026-09-26';

const DECLINE_COUNT_IS_YOUNG =
  `asks declined: recorded only since ${DECLINES_RECORDED_SINCE}, when the decline button ` +
  'shipped (row 274). Asks answered before that carry no record either way, so a small ' +
  'number here means few people have been asked since — not that few people say no.';

export async function pilotOutcomes(days = 28): Promise<PilotOutcomes> {
  const span = Math.min(Math.max(1, Math.floor(days)), 365);

  const [people, goals, firstAnswer, paid, brought, cost, asks] = await Promise.all([
    query<{ joined: string; started: string; helped_only: string; people_with_goals: string }>(
      `WITH joined AS (
         SELECT u.id FROM "User" u
          WHERE u."deletedAt" IS NULL AND ${NOT_A_SEAT}
            AND u."createdAt" >= NOW() - ($1 || ' days')::interval
       )
       SELECT COUNT(*)::text AS joined,
              COUNT(*) FILTER (
                WHERE EXISTS (SELECT 1 FROM tasks t WHERE t.user_id = j.id::text)
              )::text AS started,
              COUNT(*) FILTER (
                WHERE NOT EXISTS (SELECT 1 FROM tasks t WHERE t.user_id = j.id::text)
                  AND EXISTS (SELECT 1 FROM task_asks a WHERE a.to_user_id = j.id)
              )::text AS helped_only
              ,
              (SELECT COUNT(DISTINCT t.user_id)
                 FROM tasks t JOIN "User" u ON u.id::text = t.user_id
                WHERE ${NOT_A_SEAT})::text AS people_with_goals
         FROM joined j`,
      [span],
      OUTCOMES_TIMEOUT_MS,
    ),
    query<Record<string, string>>(
      `SELECT
         COUNT(*) FILTER (WHERE t.status = 'closed' AND t.closed_as = 'finished')::text AS resolved,
         COUNT(*) FILTER (WHERE t.status = 'closed' AND t.closed_as <> 'finished')::text AS stopped,
         COUNT(*) FILTER (WHERE t.status = 'open')::text   AS still_open,
         COUNT(*) FILTER (WHERE t.status = 'paused')::text AS paused,
         COUNT(*) FILTER (
           WHERE t.status = 'open'
             AND EXISTS (SELECT 1 FROM task_asks a WHERE a.task_id = t.id AND a.status = 'sent')
         )::text AS waiting
       FROM tasks t
       JOIN "User" u ON u.id::text = t.user_id
      WHERE ${NOT_A_SEAT}`,
      [],
      OUTCOMES_TIMEOUT_MS,
    ),
    query<{ measured: string; median: string | null }>(
      `WITH first_back AS (
         SELECT t.id,
                EXTRACT(EPOCH FROM (MIN(a.answered_at) - t.created_at)) / 60 AS minutes
           FROM tasks t
           JOIN "User" u ON u.id::text = t.user_id
           JOIN task_asks a ON a.task_id = t.id AND a.answered_at IS NOT NULL
          WHERE ${NOT_A_SEAT} AND a.answered_at >= t.created_at
          GROUP BY t.id, t.created_at
       )
       SELECT COUNT(*)::text AS measured,
              PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY minutes)::text AS median
         FROM first_back`,
      [],
      OUTCOMES_TIMEOUT_MS,
    ),
    query<Record<string, string | null>>(
      `WITH per_person AS (
         SELECT p.user_id, COUNT(*) AS payments
           FROM payment_events p
           JOIN "User" u ON u.id = p.user_id
          WHERE ${NOT_A_SEAT} AND p.paid_at IS NOT NULL
          GROUP BY p.user_id
       )
       SELECT COUNT(*) FILTER (WHERE payments >= 1)::text AS once,
              COUNT(*) FILTER (WHERE payments >= 2)::text AS twice,
              COUNT(*) FILTER (WHERE payments >= 3)::text AS thrice,
              (SELECT MAX(paid_at)::text FROM payment_events)   AS latest
         FROM per_person`,
      [],
      OUTCOMES_TIMEOUT_MS,
    ),
    query<Record<string, string>>(
      `WITH invitee AS (
         SELECT u.id, u."inviterReferralUserId" AS inviter
           FROM "User" u
          WHERE u."deletedAt" IS NULL AND ${NOT_A_SEAT}
            AND u."inviterReferralUserId" IS NOT NULL
       )
       SELECT COUNT(DISTINCT inviter)::text AS inviters,
              COUNT(*)::text                AS invitees,
              COUNT(*) FILTER (
                WHERE ${usedNetai('invitee')}
              )::text AS opened,
              COUNT(*) FILTER (
                WHERE EXISTS (SELECT 1 FROM tasks t WHERE t.user_id = invitee.id::text)
              )::text AS started,
              COUNT(*) FILTER (
                WHERE EXISTS (SELECT 1 FROM payment_events p
                               WHERE p.user_id = invitee.id AND p.paid_at IS NOT NULL)
              )::text AS paid
         FROM invitee`,
      [],
      OUTCOMES_TIMEOUT_MS,
    ),
    /**
     * The check line, measured on the WALLET — who actually paid — because
     * that is what D123 promises and what the tester measured when they proved
     * it. See the note on `helpers_charged` for the two wrong tables I tried
     * first.
     */
    query<{ askers: string; helpers: string; last_charged: string | null }>(
      `WITH helper_debits AS (
         SELECT tt.user_id, tt.created_at
           FROM token_transactions tt
           JOIN usage_events e ON e.run_id = tt.run_id
           JOIN task_asks a ON a.ask_thread_id = e.thread_id
          WHERE tt.amount < 0 AND a.to_user_id::text = tt.user_id
       )
       SELECT (SELECT COUNT(DISTINCT tt.user_id)::text
                 FROM token_transactions tt
                WHERE tt.amount < 0
                  AND tt.created_at >= NOW() - ($1 || ' days')::interval
                  AND EXISTS (SELECT 1 FROM tasks t WHERE t.user_id = tt.user_id)) AS askers,
              (SELECT COUNT(DISTINCT user_id)::text FROM helper_debits
                WHERE created_at >= NOW() - ($1 || ' days')::interval)            AS helpers,
              (SELECT MAX(created_at)::text FROM helper_debits)                   AS last_charged`,
      [span],
      OUTCOMES_TIMEOUT_MS,
    ),
    /**
     * 4 — THE ASKS, SPLIT THREE WAYS. Seats excluded like every other number
     * here, and `cancelled` deliberately absent: an ask the ASKER withdrew is
     * not something the recipient did, and putting it beside their answers
     * would read as a third thing they chose.
     */
    query<{ answered: string; declined: string; never_answered: string }>(
      /**
       * ⚠️ THE THREE COLUMNS MUST NOT OVERLAP, and they did until a live test
       * produced the row that proves it.
       *
       * A decline is recorded when the person's own message ARRIVES, which is
       * before the run that would relay it. If that run is then refused — a
       * walled wallet, a rate limit, a crash — the ask keeps `status = 'sent'`
       * and carries `declined_at` anyway. That is the right outcome: they said
       * no, and the refusal of a later step must not unsay it.
       *
       * But it meant such a row was counted in BOTH `declined` and
       * `never_answered`, so adding the three numbers double-counted it.
       * Somebody who declined has not „never answered" — they answered with a
       * no. `never_answered` now means exactly that: no answer and no refusal.
       */
      `SELECT COUNT(*) FILTER (WHERE ta.status = 'answered')::text AS answered,
              COUNT(*) FILTER (WHERE ta.declined_at IS NOT NULL)::text AS declined,
              COUNT(*) FILTER (WHERE ta.status = 'sent' AND ta.declined_at IS NULL)::text
                AS never_answered
         FROM task_asks ta
         JOIN "User" u ON u.id = ta.to_user_id
        WHERE ta.created_at >= NOW() - ($1 || ' days')::interval
          AND u."deletedAt" IS NULL AND ${NOT_A_SEAT}`,
      [span],
      OUTCOMES_TIMEOUT_MS,
    ),
  ]);

  const p = people.rows[0];
  const a = asks.rows[0];
  const g = goals.rows[0];
  const f = firstAnswer.rows[0];
  const m = paid.rows[0];
  const b = brought.rows[0];
  const c = cost.rows[0];

  return {
    from: new Date(Date.now() - span * 86_400_000).toISOString().slice(0, 10),
    to: new Date().toISOString().slice(0, 10),
    joined: Number(p?.joined ?? 0),
    started_a_goal: Number(p?.started ?? 0),
    only_ever_helped: Number(p?.helped_only ?? 0),
    scope: {
      started_a_goal:
        'Of the people who JOINED IN THIS WINDOW only. Somebody who joined earlier and ' +
        'started a goal this week is not counted here — see goals and people_with_any_goal.',
      goals:
        "Every real person's goals, whenever they joined. Not scoped to this window, which " +
        'is why this can be large while started_a_goal is zero.',
      people_with_any_goal: Number(p?.people_with_goals ?? 0),
    },
    goals: {
      resolved: Number(g?.resolved ?? 0),
      stopped: Number(g?.stopped ?? 0),
      open: Number(g?.still_open ?? 0),
      paused: Number(g?.paused ?? 0),
      waiting_on_a_reply: Number(g?.waiting ?? 0),
    },
    first_answer: {
      definition:
        'minutes from a goal opening to the FIRST question asked on its behalf coming back ' +
        'answered. Not "the first useful answer" — the database does not know what was useful. ' +
        'Goals solved by a search rather than by a person are absent from this number.',
      goals_measured: Number(f?.measured ?? 0),
      median_minutes: f?.median == null ? null : Math.round(Number(f.median)),
    },
    paid: {
      people_who_paid_once: Number(m?.once ?? 0),
      people_who_paid_twice: Number(m?.twice ?? 0),
      people_who_paid_three_times: Number(m?.thrice ?? 0),
      latest_payment: (m?.latest as string | null) ?? null,
    },
    brought_others: {
      people_who_invited_somebody: Number(b?.inviters ?? 0),
      their_invitees: Number(b?.invitees ?? 0),
      invitees_who_opened_netai: Number(b?.opened ?? 0),
      invitees_who_started_a_goal: Number(b?.started ?? 0),
      invitees_who_paid: Number(b?.paid ?? 0),
    },
    chain_cost: {
      askers_charged: Number(c?.askers ?? 0),
      helpers_charged: Number(c?.helpers ?? 0),
      helper_last_charged: (c?.last_charged as string | null) ?? null,
    },
    asks: {
      answered: Number(a?.answered ?? 0),
      declined: Number(a?.declined ?? 0),
      never_answered: Number(a?.never_answered ?? 0),
      declines_recorded_since: DECLINES_RECORDED_SINCE,
    },
    not_measurable: [DECLINE_COUNT_IS_YOUNG],
  };
}
