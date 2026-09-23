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
  readonly paying: number;
  readonly newest_registration: string | null;
}

export interface PilotSide {
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
  readonly closures_dated_since: string | null;
  readonly real: PilotSide;
  readonly seats: PilotSide;
}

const REAL = `u."hasAccessToAlly" = true
              AND NOT EXISTS (SELECT 1 FROM test_seats ts WHERE ts.user_id = u.id)`;
const SEAT = `EXISTS (SELECT 1 FROM test_seats ts WHERE ts.user_id = u.id)`;

const POPULATION_RULE =
  'real = a Netai account (hasAccessToAlly, set as a literal by registerUser) that is not in ' +
  'test_seats; seats = the fictional accounts the seat route created. The 62,200 legacy Ally ' +
  'accounts are in neither: they have never opened Netai.';

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
  const [daily, asks, people] = await Promise.all([
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
      newest: string | null;
    }>(
      `SELECT COUNT(*)                                                   AS registered,
              COUNT(*) FILTER (WHERE u."createdAt" < NOW() - INTERVAL '20 days') AS past_day_20,
              COUNT(*) FILTER (WHERE u."createdAt" < NOW() - INTERVAL '20 days'
                                 AND u.subscription_status = ANY($1))    AS past_day_20_paying,
              COUNT(*) FILTER (WHERE u.subscription_status = ANY($1))    AS paying,
              MAX(u."createdAt")::text                                   AS newest
         FROM "User" u
        WHERE ${who}`,
      [['active', 'past_due']],
      PILOT_QUERY_TIMEOUT_MS,
    ),
  ]);

  const days = daily.rows.map(day);
  const a = asks.rows[0];
  const p = people.rows[0];
  return {
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
    query<{ first: string | null }>(
      `SELECT MIN(closed_at)::text AS first FROM tasks WHERE closed_at IS NOT NULL`,
      [],
      PILOT_QUERY_TIMEOUT_MS,
    ),
  ]);
  return {
    from: real.days[0]?.day ?? '',
    to: real.days[real.days.length - 1]?.day ?? '',
    population: POPULATION_RULE,
    closures_dated_since: dated.rows[0]?.first ?? null,
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
    threads: string;
    goals: string;
    last_active_at: string | null;
  }>(
    `SELECT u.id                                                        AS user_id,
            u.name,
            u."createdAt"::text                                         AS registered_at,
            FLOOR(EXTRACT(EPOCH FROM (NOW() - u."createdAt")) / 86400)   AS day,
            (u.subscription_status = ANY($1))                            AS paying,
            (SELECT COUNT(*) FROM threads t WHERE t.user_id = u.id)            AS threads,
            (SELECT COUNT(*) FROM tasks k WHERE k.user_id = u.id::text)        AS goals,
            (SELECT MAX(c.created_at)::text FROM conversations c
              WHERE c.user_id = u.id AND c.role = 'user')                AS last_active_at
       FROM "User" u
      WHERE ${REAL}
      ORDER BY u."createdAt" DESC
      LIMIT 200`,
    [['active', 'past_due']],
    PILOT_QUERY_TIMEOUT_MS,
  );
  return result.rows.map((r) => ({
    user_id: r.user_id,
    name: r.name,
    registered_at: r.registered_at,
    day: Number(r.day),
    paying: r.paying,
    threads: Number(r.threads),
    goals: Number(r.goals),
    last_active_at: r.last_active_at,
  }));
}
