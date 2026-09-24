import { query } from '../db/postgres/client';

/**
 * ROW 256 — THE PILOT'S RESULTS OVER TIME, IN ONE READ.
 *
 * The seat's line: „no admin screen with the pilot's results over time (goals
 * solved, questions answered or ignored, who pays after 20 days) → one screen
 * with these numbers per day and per week."
 *
 * ────────────────────────────────────────────────────────────────────────
 * WHICH PEOPLE, WRITTEN DOWN, BECAUSE TODAY IT WENT WRONG TWICE IN ONE EVENING.
 *
 * 14:37 — `attribution.sh` reported „6 registrations, none attributed" and was
 * one step from telling the frontend their fix had failed. All six were
 * fictional test seats I and the seat had made that afternoon.
 *
 * 18:37 — the same check reported „1 registration, not attributed". That
 * account was the LEGACY ALLY APP registering somebody into this same
 * database: 62,200 accounts carry `hasAccessToAlly = false` and four of them
 * arrived in the last seven days. Netai's own base is 33, of which 20 are
 * seats, and THIRTEEN people have ever registered through Netai — the newest
 * on 9 September.
 *
 * A screen of pilot numbers is exactly where that mistake would become a
 * sentence somebody says out loud to an investor. So this file has ONE
 * definition of a pilot person, it is two columns rather than a judgement, and
 * every number here is returned TWICE — once for real people and once for the
 * seats — because hiding the seat traffic would make the screen look broken on
 * the days when all the movement was ours.
 *
 *     real   `hasAccessToAlly` = true  AND no row in `test_seats`
 *     seat   a row in `test_seats`
 *
 * `hasAccessToAlly` is the honest discriminator and not a guess: `registerUser`
 * INSERTs it as a literal `true` on every path, with no branch, so nothing the
 * Netai registration creates can fall outside it and nothing the Ally app
 * creates can fall inside.
 * ────────────────────────────────────────────────────────────────────────
 *
 * AND „SOLVED" IS ONLY WHAT THE COLUMN SAYS. Of 422 closed goals, 20 read
 * `closed_as = 'finished'`, 202 read `'stopped'` and 200 READ NOTHING AT ALL —
 * closed before the column existed. Those 200 are reported as their own number
 * rather than shared out between the other two, because a pilot's success rate
 * assembled from rows that never recorded an outcome is a number that cannot
 * be defended when somebody asks where it came from.
 */

const PILOT_QUERY_TIMEOUT_MS = 8_000;

/** A month of days is what fits on a screen; more is a report, not a glance. */
const DEFAULT_DAYS = 28;
const MAX_DAYS = 120;

/**
 * WHEN A QUESTION COUNTS AS IGNORED, and this is a choice rather than a fact.
 *
 * Forty-eight hours: long enough that somebody who answers the next morning is
 * not filed as ignoring it, short enough to mean something inside a pilot that
 * has run for weeks. An ask younger than this is „waiting", which is a third
 * state and is reported as one — „sent minus answered" would call every
 * question asked this afternoon a failure.
 */
const IGNORED_AFTER_HOURS = 48;

export interface PilotDay {
  readonly day: string;
  readonly goals_opened: number;
  readonly goals_finished: number;
  readonly goals_stopped: number;
  readonly goals_closed_without_an_outcome: number;
  readonly asks_sent: number;
  readonly asks_answered: number;
}

export interface PilotAsks {
  readonly sent: number;
  readonly answered: number;
  /** Older than the window above, never answered, not cancelled. */
  readonly ignored: number;
  /** Too young to call either way. */
  readonly waiting: number;
  readonly cancelled: number;
}

/**
 * „Who pays after 20 days" (D125, the founder's day-20 call).
 *
 * `day` is days since registration, so `past_day_20` is who has actually
 * reached the question. Paying is a live subscription, which is the same
 * `PAYING_STATUSES` the cohort list uses — one definition, not two.
 */
export interface PilotPeople {
  readonly registered: number;
  readonly past_day_20: number;
  readonly past_day_20_paying: number;
  /** Has a live subscription AND a Stripe customer — somebody we actually bill. */
  readonly paying: number;
  /**
   * Status says active and there is no Stripe record at all: access given by
   * an admin. Eleven of the fifteen on 24 September. A person using the
   * product, and not revenue — reported beside `paying`, never inside it.
   */
  readonly access_granted_by_hand: number;
  readonly newest_registration: string | null;
}

export interface PilotSide {
  /**
   * HOW MANY PEOPLE THE WHOLE WINDOW'S MOVEMENT CAME FROM, and it is here
   * because the first live read of this report needed it within a minute.
   *
   *     real side, week of 17 September:   159 goals opened
   *     people they came from:             see this field
   *
   * „159 goals opened by real people last week" is a sentence somebody would
   * repeat, and on this pilot most of that is ONE account — the founder's own,
   * which is a real Netai account and belongs in the numbers. The count is not
   * a correction to them; it is the second number that stops the first from
   * being misread.
   *
   * ON THE WINDOW AND NOT ON EACH DAY OR WEEK, deliberately: distinct counts
   * do not add up. Summing „people active" across seven days would count the
   * same person seven times, and a field that means one thing in `days` and
   * another in `weeks` is the trap this whole file is written against.
   */
  readonly active_people_in_window: number;
  readonly days: readonly PilotDay[];
  readonly weeks: readonly PilotDay[];
  readonly asks: PilotAsks;
  readonly people: PilotPeople;
}

export interface PilotReport {
  readonly from: string;
  readonly to: string;
  /** The rule, carried WITH the numbers so a screen cannot show one without it. */
  readonly population: string;
  /**
   * WHEN CLOSURES BEGAN TO BE DATED AT ALL — null until the first one is
   * recorded, and it travels with the numbers for the same reason the
   * population rule does.
   *
   * `tasks.closed_at` was added on 23 September (migration 172). Before it, no
   * column recorded when a goal closed, and the 422 already-closed goals
   * cannot be dated from anything — a backfill from `updated_at` would
   * manufacture 422 dates indistinguishable from measured ones. So an empty
   * „solved" column on a day in the past means NOT RECORDED, and a screen that
   * does not say so is telling the reader the pilot solved nothing.
   */
  readonly payment_rule: string;
  readonly closures_dated_since: string | null;
  /**
   * Goals closed BEFORE the column existed, which can never be dated. The
   * „solved" columns exclude them, so a screen that does not say this is
   * reporting that the pilot solved nothing. Sent as a field rather than a
   * number in a message: a figure typed into a page is true on the day it is
   * typed.
   */
  readonly closures_without_a_date: number;
  readonly real: PilotSide;
  readonly seats: PilotSide;
}

/**
 * ⚠️ 21:31 — THE FIRST VERSION OF THIS RULE EXCLUDED THE SECOND MOST ACTIVE
 * PERSON IN THE PRODUCT, AND I SHIPPED IT AND HAD IT VERIFIED BEFORE I NOTICED.
 *
 * It said `hasAccessToAlly = true`, with a confident argument beside it:
 * `registerUser` writes that column as a literal `true`, so nothing the Netai
 * path creates can fall outside it. **Every word of that is true and it
 * answers a different question.** It identifies who REGISTERED THROUGH THE
 * NETAI SCREEN. It does not identify who USES NETAI.
 *
 * Lika Ose, account 160584: `hasAccessToAlly` FALSE, 321 threads, 51 goals,
 * typed today. Ninia Abramishvili: false, 35 threads, 27 goals. Salome
 * Parkosadze: false, 15 threads, typed today. They arrived before the Netai
 * registration path existed, or through the old app, and then used this one.
 *
 *     people who have actually used Netai        45
 *       of them carrying the flag                10
 *       of them NOT carrying it                  35
 *
 * **Thirty-five of forty-five were invisible to every number I produced
 * tonight** — the pilot report, the people list behind row 16, the push
 * finding for row 111, and „thirteen people have ever registered".
 *
 * So the rule is USE, not a flag: a thread in this product is a thing somebody
 * did here, and the 62,200 legacy accounts have none. The flag stays in the
 * OR because somebody who registered yesterday and has not opened a chat is
 * still one of the pilot's people.
 *
 * 📌 The lesson is not „that column was wrong". The column is exactly what it
 * says. I asked „who is a Netai account" and used the answer for „who is a
 * Netai person", and those are two questions. That is the fifth time today,
 * and the first one where the wrong answer reached shipped code.
 */
const REAL = `NOT EXISTS (SELECT 1 FROM test_seats ts WHERE ts.user_id = u.id)
              AND (u."hasAccessToAlly" = true
                   OR EXISTS (SELECT 1 FROM threads th WHERE th.user_id = u.id))`;
const SEAT = `EXISTS (SELECT 1 FROM test_seats ts WHERE ts.user_id = u.id)`;

/**
 * WHO WE ACTUALLY BILL, AND WHO WAS SIMPLY LET IN — as SQL fragments, for the
 * same reason `REAL` is one: so there cannot be two readings of it.
 *
 * ⚠️ AND THERE WERE TWO, FOR TWO HOURS THIS MORNING, BECAUSE OF THIS FIX.
 *
 * At 09:20 I found that `paying` meant „the status column says active", and
 * that column is written by the admin GRANT route as well as by Stripe — 15
 * accounts, of which 11 have no Stripe record at all. I fixed it in the report
 * and NOT in `pilotPeople`, so the summary said 4 and the list of the same
 * people would have marked 15 of them as paying, on one screen.
 *
 * That is the exact fault the fix was for, committed by the fix, in a file
 * whose own comment already said „one definition, not two". A shared string is
 * the only version of this that cannot drift again.
 */
const PAYS_US = `(u.subscription_status = ANY($PAYING$) AND u."stripeCustomerId" IS NOT NULL)`;
const GRANTED_BY_HAND = `(u.subscription_status = ANY($PAYING$) AND u."stripeCustomerId" IS NULL)`;
const PAYING_STATUSES = ['active', 'past_due'];

/** The fragments carry a placeholder so each query can bind its own parameter number. */
function withParam(fragment: string, n: number): string {
  return fragment.replace('$PAYING$', `$${n}`);
}

const PAYMENT_RULE =
  'paying = a live subscription AND a Stripe customer — somebody we actually bill. ' +
  'access_granted_by_hand = the status says active and there is no Stripe record at ' +
  'all, which is an admin grant. On 24 September that was 4 and 11: reading the status ' +
  'column alone would call all 15 paying. Both are real and they are not the same ' +
  'fact — a hand-granted account is a person using the product, and it is not revenue.';

const POPULATION_RULE =
  'real = somebody who has USED Netai (has a thread here) or registered through it ' +
  '(hasAccessToAlly), and is not in test_seats. USE and not the flag: 35 of the 45 real ' +
  'people who have used this product do not carry it, including the second most active ' +
  'account. seats = the fictional accounts the seat route created. The 62,200 legacy Ally ' +
  'accounts are in neither: they have no thread here.';

interface DayRow {
  day: Date | string;
  goals_opened: string;
  goals_finished: string;
  goals_stopped: string;
  goals_closed_unknown: string;
  asks_sent: string;
  asks_answered: string;
}

function day(row: DayRow): PilotDay {
  const iso = row.day instanceof Date ? row.day.toISOString() : String(row.day);
  return {
    day: iso.slice(0, 10),
    goals_opened: Number(row.goals_opened),
    goals_finished: Number(row.goals_finished),
    goals_stopped: Number(row.goals_stopped),
    goals_closed_without_an_outcome: Number(row.goals_closed_unknown),
    asks_sent: Number(row.asks_sent),
    asks_answered: Number(row.asks_answered),
  };
}

/**
 * Seven-day buckets, newest week first, labelled by the day each week STARTS.
 *
 * Built from the days rather than asked of the database again: two queries
 * that count the same thing differently is how a screen ends up arguing with
 * itself, and the day rows are already in hand.
 */
function intoWeeks(days: readonly PilotDay[]): PilotDay[] {
  const weeks: PilotDay[] = [];
  for (let end = days.length; end > 0; end -= 7) {
    const slice = days.slice(Math.max(0, end - 7), end);
    if (slice.length === 0) continue;
    weeks.push(
      slice.reduce<PilotDay>(
        (sum, d) => ({
          day: slice[0].day,
          goals_opened: sum.goals_opened + d.goals_opened,
          goals_finished: sum.goals_finished + d.goals_finished,
          goals_stopped: sum.goals_stopped + d.goals_stopped,
          goals_closed_without_an_outcome:
            sum.goals_closed_without_an_outcome + d.goals_closed_without_an_outcome,
          asks_sent: sum.asks_sent + d.asks_sent,
          asks_answered: sum.asks_answered + d.asks_answered,
        }),
        {
          day: slice[0].day,
          goals_opened: 0,
          goals_finished: 0,
          goals_stopped: 0,
          goals_closed_without_an_outcome: 0,
          asks_sent: 0,
          asks_answered: 0,
        },
      ),
    );
  }
  return weeks;
}

async function sideFor(who: string, span: number): Promise<PilotSide> {
  const [daily, asks, people, active] = await Promise.all([
    query<DayRow>(
      `WITH d AS (
         SELECT generate_series(
           (CURRENT_DATE - ($1::int - 1))::date, CURRENT_DATE, INTERVAL '1 day')::date AS day
       ),
       mine AS (SELECT u.id FROM "User" u WHERE ${who})
       SELECT d.day,
              (SELECT COUNT(*) FROM tasks t JOIN mine ON mine.id = t.user_id::int
                WHERE t.created_at::date = d.day)                        AS goals_opened,
              (SELECT COUNT(*) FROM tasks t JOIN mine ON mine.id = t.user_id::int
                WHERE t.closed_at::date = d.day AND t.closed_as = 'finished') AS goals_finished,
              (SELECT COUNT(*) FROM tasks t JOIN mine ON mine.id = t.user_id::int
                WHERE t.closed_at::date = d.day AND t.closed_as = 'stopped')  AS goals_stopped,
              (SELECT COUNT(*) FROM tasks t JOIN mine ON mine.id = t.user_id::int
                WHERE t.closed_at::date = d.day AND t.closed_as IS NULL)  AS goals_closed_unknown,
              (SELECT COUNT(*) FROM task_asks a JOIN mine ON mine.id = a.from_user_id
                WHERE a.created_at::date = d.day)                        AS asks_sent,
              (SELECT COUNT(*) FROM task_asks a JOIN mine ON mine.id = a.from_user_id
                WHERE a.answered_at::date = d.day)                       AS asks_answered
         FROM d ORDER BY d.day`,
      [span],
      PILOT_QUERY_TIMEOUT_MS,
    ),
    query<{ sent: string; answered: string; ignored: string; waiting: string; cancelled: string }>(
      `SELECT COUNT(*)                                            AS sent,
              COUNT(*) FILTER (WHERE a.answered_at IS NOT NULL)    AS answered,
              COUNT(*) FILTER (WHERE a.answered_at IS NULL
                                 AND a.status <> 'cancelled'
                                 AND a.created_at < NOW() - INTERVAL '${IGNORED_AFTER_HOURS} hours')
                                                                   AS ignored,
              COUNT(*) FILTER (WHERE a.answered_at IS NULL
                                 AND a.status <> 'cancelled'
                                 AND a.created_at >= NOW() - INTERVAL '${IGNORED_AFTER_HOURS} hours')
                                                                   AS waiting,
              COUNT(*) FILTER (WHERE a.status = 'cancelled')       AS cancelled
         FROM task_asks a
         JOIN "User" u ON u.id = a.from_user_id
        WHERE ${who}`,
      [],
      PILOT_QUERY_TIMEOUT_MS,
    ),
    query<{
      registered: string;
      past_day_20: string;
      past_day_20_paying: string;
      paying: string;
      access_granted_by_hand: string;
      newest: string | null;
    }>(
      // ⚠️ „PAYING" USED TO MEAN „THE STATUS COLUMN SAYS ACTIVE", AND THAT
      // COLUMN IS SET BY THE ADMIN GRANT ROUTE AS WELL AS BY STRIPE.
      //
      // Measured on 24 September, among the pilot's real people:
      //
      //     status active                              15
      //       with a Stripe customer                    4
      //       WITH NO STRIPE RECORD AT ALL             11   ← granted by hand
      //
      // So the screen that answers „who pays after 20 days" would have said
      // FIFTEEN, and at most four of them have ever been billed. That is the
      // sentence somebody repeats to an investor, and it is the same fault
      // this file already carries two warnings about: a number whose
      // DEFINITION nobody asked for.
      //
      // Both are real and they are not the same fact, so both are reported and
      // neither is folded into the other. A hand-granted account is a person
      // using the product; it is not revenue.
      `SELECT COUNT(*)                                                   AS registered,
              COUNT(*) FILTER (WHERE u."createdAt" < NOW() - INTERVAL '20 days') AS past_day_20,
              COUNT(*) FILTER (WHERE u."createdAt" < NOW() - INTERVAL '20 days'
                                 AND ${withParam(PAYS_US, 1)})            AS past_day_20_paying,
              COUNT(*) FILTER (WHERE ${withParam(PAYS_US, 1)})            AS paying,
              COUNT(*) FILTER (WHERE ${withParam(GRANTED_BY_HAND, 1)})    AS access_granted_by_hand,
              MAX(u."createdAt")::text                                   AS newest
         FROM "User" u
        WHERE ${who}`,
      [PAYING_STATUSES],
      PILOT_QUERY_TIMEOUT_MS,
    ),
    query<{ n: string }>(
      `WITH mine AS (SELECT u.id FROM "User" u WHERE ${who}),
            since AS (SELECT (CURRENT_DATE - ($1::int - 1))::date AS d)
       SELECT COUNT(*) AS n FROM mine
        WHERE EXISTS (SELECT 1 FROM tasks t, since
                       WHERE t.user_id = mine.id::text AND t.created_at::date >= since.d)
           OR EXISTS (SELECT 1 FROM task_asks a, since
                       WHERE a.from_user_id = mine.id AND a.created_at::date >= since.d)`,
      [span],
      PILOT_QUERY_TIMEOUT_MS,
    ),
  ]);

  const days = daily.rows.map(day);
  const a = asks.rows[0];
  const p = people.rows[0];
  return {
    active_people_in_window: Number(active.rows[0]?.n ?? 0),
    days,
    weeks: intoWeeks(days),
    asks: {
      sent: Number(a?.sent ?? 0),
      answered: Number(a?.answered ?? 0),
      ignored: Number(a?.ignored ?? 0),
      waiting: Number(a?.waiting ?? 0),
      cancelled: Number(a?.cancelled ?? 0),
    },
    people: {
      registered: Number(p?.registered ?? 0),
      past_day_20: Number(p?.past_day_20 ?? 0),
      past_day_20_paying: Number(p?.past_day_20_paying ?? 0),
      paying: Number(p?.paying ?? 0),
      access_granted_by_hand: Number(p?.access_granted_by_hand ?? 0),
      newest_registration: p?.newest ?? null,
    },
  };
}

/** The whole screen in one call. Real and seats side by side, never merged. */
export async function pilotReport(days = DEFAULT_DAYS): Promise<PilotReport> {
  const span = Math.min(Math.max(1, Math.floor(days)), MAX_DAYS);
  const [real, seats, dated] = await Promise.all([
    sideFor(REAL, span),
    sideFor(SEAT, span),
    /**
     * The date closures began to be recorded, AND how many are older than it.
     *
     * The app team asked for the count as a field rather than taking the „422"
     * from a message, and they were right to: a number typed into a screen is
     * true on the day it is typed and silently wrong afterwards. It falls as
     * nothing and rises only if closures happen while the column is absent,
     * which cannot happen again — so it is a shrinking share of a fixed past,
     * and a hard-coded 422 would have aged badly in exactly the quiet way this
     * report exists to prevent.
     */
    query<{ first: string | null; undated: string }>(
      `SELECT MIN(closed_at)::text                                   AS first,
              COUNT(*) FILTER (WHERE status = 'closed'
                                 AND closed_at IS NULL)::text        AS undated
         FROM tasks`,
      [],
      PILOT_QUERY_TIMEOUT_MS,
    ),
  ]);
  return {
    from: real.days[0]?.day ?? '',
    to: real.days[real.days.length - 1]?.day ?? '',
    population: POPULATION_RULE,
    payment_rule: PAYMENT_RULE,
    closures_dated_since: dated.rows[0]?.first ?? null,
    closures_without_a_date: Number(dated.rows[0]?.undated ?? 0),
    real,
    seats,
  };
}

/**
 * ROW 16 — „no screen to read pilot users' conversations → the founder can open
 * and read a real conversation."
 *
 * THE READING ROUTES ALREADY EXIST and the gate is OPEN — I probed it without
 * touching anybody's data by calling `GET /admin/pilot/threads` with no
 * `user_id`: the gate is checked before the parameter, so a 400 („user_id is
 * required") proves the reader is on where a 403 would have proved it off.
 *
 * WHAT WAS MISSING IS THE FIRST STEP. Both routes need a `user_id`, and
 * nothing anywhere answers „whose conversation is worth opening". The founder
 * cannot type an id he has never seen, and the pilot's people are thirteen
 * accounts hidden inside 62,233.
 *
 * So this is that list, behind the SAME gate as the reading itself — a
 * capability that names the pilot's members is not a lesser one than reading
 * them, and putting it behind a weaker door would be the whole point of the
 * door lost.
 *
 * NO PHONE NUMBER, NOT EVEN THE LAST DIGITS (D149). The screen needs a name to
 * show and an id to fetch with; a number would be carried through a browser
 * for nothing.
 */
export interface PilotPerson {
  readonly user_id: number;
  readonly name: string | null;
  readonly registered_at: string;
  /** Days since registration — the founder's day-20 call reads this. */
  readonly day: number;
  readonly paying: boolean;
  /** Let in by an admin, never billed. Shown beside `paying`, never inside it. */
  readonly granted_by_hand: boolean;
  readonly threads: number;
  readonly goals: number;
  readonly last_active_at: string | null;
}

/** The pilot's real people, newest first. Seats and the Ally base are not here. */
export async function pilotPeople(): Promise<readonly PilotPerson[]> {
  const result = await query<{
    user_id: number;
    name: string | null;
    registered_at: string;
    day: string;
    paying: boolean;
    granted_by_hand: boolean;
    threads: string;
    goals: string;
    last_active_at: string | null;
  }>(
    `SELECT u.id                                                        AS user_id,
            u.name,
            u."createdAt"::text                                         AS registered_at,
            FLOOR(EXTRACT(EPOCH FROM (NOW() - u."createdAt")) / 86400)   AS day,
            ${withParam(PAYS_US, 1)}                                     AS paying,
            ${withParam(GRANTED_BY_HAND, 1)}                              AS granted_by_hand,
            (SELECT COUNT(*) FROM threads t WHERE t.user_id = u.id)            AS threads,
            (SELECT COUNT(*) FROM tasks k WHERE k.user_id = u.id::text)        AS goals,
            (SELECT MAX(c.created_at)::text FROM conversations c
              WHERE c.user_id = u.id AND c.role = 'user')                AS last_active_at
       FROM "User" u
      WHERE ${REAL}
      ORDER BY u."createdAt" DESC
      LIMIT 200`,
    [PAYING_STATUSES],
    PILOT_QUERY_TIMEOUT_MS,
  );
  return result.rows.map((r) => ({
    user_id: r.user_id,
    name: r.name,
    registered_at: r.registered_at,
    day: Number(r.day),
    paying: r.paying,
    granted_by_hand: r.granted_by_hand,
    threads: Number(r.threads),
    goals: Number(r.goals),
    last_active_at: r.last_active_at,
  }));
}
