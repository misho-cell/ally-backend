const dbQuery = jest.fn();
jest.mock('../../db/postgres/client', () => ({
  __esModule: true,
  query: (...args: unknown[]) => dbQuery(...args),
}));

import { readFileSync } from 'fs';
import { join } from 'path';
import { pilotPeople, pilotReport } from '../pilotReport.service';

/**
 * ROW 256 — THE PILOT'S RESULTS OVER TIME, AND THE TWO WAYS THAT SCREEN COULD
 * LIE BEFORE IT EVER RENDERED.
 *
 * Both happened TODAY, to the same script, four hours apart:
 *
 *   14:37  six fictional test seats counted as six registrations, one step
 *          from telling the frontend their fix had failed
 *   18:37  one LEGACY ALLY account counted as a Netai registration — 62,200
 *          of those exist and four arrived in the last seven days
 *
 * A screen of pilot numbers is where that becomes a sentence somebody says out
 * loud to an investor. So the population is two columns rather than a
 * judgement, it travels WITH the numbers, and the seats are reported beside
 * the real people instead of being hidden — on a day when all the movement was
 * ours, a screen showing zero looks broken rather than honest.
 */
beforeEach(() => {
  jest.clearAllMocks();
  dbQuery.mockResolvedValue({ rows: [], rowCount: 0 });
});

describe('the population is written into the query, not assumed', () => {
  it('asks for Netai accounts that are not seats, and for seats, separately', async () => {
    await pilotReport(7);

    const sql = dbQuery.mock.calls.map((c) => String(c[0])).join('\n---\n');
    // The real side: both halves of the definition.
    expect(sql).toContain('"hasAccessToAlly" = true');
    expect(sql).toContain('NOT EXISTS (SELECT 1 FROM test_seats');
    // And the seat side exists at all, rather than the seats simply vanishing.
    expect(sql).toMatch(/EXISTS \(SELECT 1 FROM test_seats ts WHERE ts\.user_id = u\.id\)/);
  });

  /**
   * ⚠️ THE ASSERTION THAT WAS MISSING, AND THE ONE THE TEST ABOVE LET THROUGH.
   *
   * The first version of the rule was `hasAccessToAlly = true` alone, and the
   * test above passed on it — it still passes now, because that column is
   * still named. What it never asked was whether the rule covers people who
   * USE the product without carrying the flag.
   *
   *     people who have used Netai     45
   *       carrying the flag            10
   *       NOT carrying it              35    ← invisible to every number
   *
   * Among the thirty-five: Lika Ose, 321 threads and 51 goals, typed the day
   * this shipped. A pilot report that hides the second most active person in
   * the product is worse than no pilot report.
   *
   * A source test is what is available here — the behavioural version needs an
   * account with threads and no flag, which is a database. So it pins the one
   * thing that cannot be true again: USE is in the rule.
   */
  it('counts people who USE Netai, not only those who carry the flag', async () => {
    await pilotReport(7);

    const sql = dbQuery.mock.calls.map((c) => String(c[0])).join('\n');
    expect(sql).toContain('EXISTS (SELECT 1 FROM threads th WHERE th.user_id = u.id)');
    expect(sql).toMatch(/hasAccessToAlly" = true\s*\n?\s*OR EXISTS/);
  });

  it('carries the rule in the payload, so a number cannot travel without it', async () => {
    const report = await pilotReport(7);

    expect(report.population).toContain('hasAccessToAlly');
    expect(report.population).toContain('test_seats');
    expect(report.population).toContain('legacy Ally');
    // And it says USE first, because that is what the flag alone got wrong.
    expect(report.population).toContain('USED Netai');
  });

  /**
   * THE LEGACY BASE IS IN NEITHER SIDE. 62,200 accounts that have never opened
   * Netai must not appear as pilot people, and must not appear as seats
   * either — they are somebody else's users.
   */
  it('never counts an account that is in neither list', async () => {
    await pilotReport(7);

    const sql = dbQuery.mock.calls.map((c) => String(c[0])).join('\n');
    const peopleReads = sql.split('FROM "User" u').slice(1);
    expect(peopleReads.length).toBeGreaterThan(0);
    for (const read of peopleReads) {
      expect(read).toMatch(/hasAccessToAlly|test_seats/);
    }
  });
});

/**
 * THE SECOND NUMBER THAT STOPS THE FIRST FROM BEING MISREAD.
 *
 * The first live read of this report, one minute after it deployed: „159 goals
 * opened by real people last week". True, and it came from THREE people in
 * twenty-eight days, most of it one account. „159 goals last week" is a
 * sentence somebody repeats; „from 3 people" is what makes it mean something.
 */
describe('how many people the movement came from', () => {
  it('counts the people, once, over the whole window', async () => {
    await pilotReport(7);

    const sql = dbQuery.mock.calls.map((c) => String(c[0])).join('\n');
    expect(sql).toContain('AS n FROM mine');
    expect(sql).toContain('a.from_user_id = mine.id');
  });

  /**
   * AND NOT PER DAY OR PER WEEK. Distinct counts do not add up — summing
   * „people active" across seven days counts one person seven times, and a
   * field meaning one thing in `days` and another in `weeks` is the trap this
   * file is written against.
   */
  it('is not on the day rows, where it could not be summed honestly', async () => {
    dbQuery.mockResolvedValue({
      rows: [
        {
          day: '2026-09-23',
          goals_opened: '1',
          goals_finished: '0',
          goals_stopped: '0',
          goals_closed_unknown: '0',
          asks_sent: '2',
          asks_answered: '1',
        },
      ],
      rowCount: 1,
    });

    const report = await pilotReport(7);

    expect(report.real).toHaveProperty('active_people_in_window');
    expect(report.real.days[0]).not.toHaveProperty('active_people_in_window');
    expect(report.real.weeks[0]).not.toHaveProperty('active_people_in_window');
  });
});

/**
 * „PAYING" MEANT „THE STATUS COLUMN SAYS ACTIVE", AND THAT COLUMN IS WRITTEN
 * BY THE ADMIN GRANT ROUTE AS WELL AS BY STRIPE.
 *
 * Measured on 24 September, among the pilot's real people:
 *
 *     status active                              15
 *       with a Stripe customer                    4
 *       WITH NO STRIPE RECORD AT ALL             11   ← granted by hand
 *
 * The screen being built answers „who pays after 20 days". It would have said
 * FIFTEEN, and at most four of those have ever been billed — on the single
 * most quotable number the pilot produces, found the morning the frontend
 * asked for the field names.
 *
 * Same shape as the two faults this file already guards: a number whose
 * DEFINITION nobody asked for. Both facts are real, so both are reported and
 * neither is folded into the other.
 */
describe('paying means somebody we bill', () => {
  it('requires a Stripe customer, not just an active status', async () => {
    await pilotReport(7);

    const sql = dbQuery.mock.calls.map((c) => String(c[0])).join('\n');
    const at = sql.indexOf('AS paying');
    expect(at).toBeGreaterThan(-1);
    expect(sql.slice(Math.max(0, at - 200), at)).toContain('"stripeCustomerId" IS NOT NULL');
  });

  it('counts the hand-granted accounts separately rather than hiding them', async () => {
    const report = await pilotReport(7);

    const sql = dbQuery.mock.calls.map((c) => String(c[0])).join('\n');
    expect(sql).toContain('AS access_granted_by_hand');
    // Paren count is not the point — the NULL test being the one attached to
    // THIS column is. The fragment is now shared, so it arrives wrapped in the
    // caller's FILTER and the old literal match counted brackets instead of
    // meaning.
    expect(sql).toMatch(/"stripeCustomerId" IS NULL\)+\s+AS access_granted_by_hand/);
    expect(report.real.people).toHaveProperty('access_granted_by_hand');
  });

  /**
   * ⚠️ AND THE LIST OF THE SAME PEOPLE HAS TO AGREE WITH THE SUMMARY.
   *
   * The first version of this fix changed the REPORT and not `pilotPeople`, so
   * for two hours the summary said 4 paying and the list of those same people
   * would have marked 15 of them as paying — on one screen. That is the fault
   * the fix was for, committed by the fix, in a file whose own comment already
   * said „one definition, not two".
   *
   * Both now build their SQL from one shared string, which is the only version
   * of this that cannot drift again.
   */
  it('the people list uses the same definition as the summary', async () => {
    await pilotPeople();

    const sql = String(dbQuery.mock.calls[0][0]);
    expect(sql).toContain('"stripeCustomerId" IS NOT NULL');
    expect(sql).toContain('AS paying');
    // And it carries the other half too, so a row can show which it is.
    expect(sql).toContain('AS granted_by_hand');
  });

  /** The definition travels with the numbers, like the population rule does. */
  it('carries what paying MEANS in the payload', async () => {
    const report = await pilotReport(7);

    expect(report.payment_rule).toContain('Stripe customer');
    expect(report.payment_rule).toContain('admin grant');
    expect(report.payment_rule).toContain('not revenue');
  });

  /** The 20-day cohort is the revenue question, so it takes the same rule. */
  it('applies the same rule to the day-20 cohort', async () => {
    await pilotReport(7);

    const sql = dbQuery.mock.calls.map((c) => String(c[0])).join('\n');
    const at = sql.indexOf('AS past_day_20_paying');
    expect(sql.slice(Math.max(0, at - 220), at)).toContain('"stripeCustomerId" IS NOT NULL');
  });
});

describe('a closed goal is dated by the column that records it', () => {
  it('counts closures by closed_at and not by updated_at', async () => {
    await pilotReport(7);

    const sql = dbQuery.mock.calls.map((c) => String(c[0])).join('\n');
    expect(sql).toContain('t.closed_at::date = d.day');
    expect(sql).not.toContain('t.updated_at::date = d.day');
  });

  /**
   * AND THE 422 GOALS THAT CANNOT BE DATED ARE ANNOUNCED RATHER THAN READ AS
   * ZERO. `closed_at` starts empty; a screen that shows an empty „solved"
   * column for last week without saying why is telling the reader the pilot
   * solved nothing.
   */
  it('says when closures began to be recorded at all', async () => {
    dbQuery.mockResolvedValue({ rows: [{ first: null }], rowCount: 1 });

    const report = await pilotReport(7);

    expect(report).toHaveProperty('closures_dated_since');
  });

  /**
   * „SOLVED" IS THE COLUMN'S WORD. 200 of the 422 closed goals carry no
   * outcome at all, and they are their own number — folded into either side
   * they would make a success rate nobody could defend.
   */
  it('keeps the outcome-less closures in a column of their own', async () => {
    await pilotReport(7);

    const sql = dbQuery.mock.calls.map((c) => String(c[0])).join('\n');
    expect(sql).toContain("t.closed_as = 'finished'");
    expect(sql).toContain('t.closed_as IS NULL');
  });
});

/**
 * BOTH WIRES THAT CLOSE A GOAL, NAMED BY FILENAME.
 *
 * `updateTask` is where every close route lands — except one. Deleting a
 * thread closes its goal in its own UPDATE, and a rule that lives in the
 * service is a rule that statement never sees. That is the one-wire fault this
 * project keeps finding, and it would have left a hole in the exact number
 * this row exists to produce.
 */
describe('every close records its day', () => {
  it('updateTask sets closed_at, and reopening clears it', () => {
    const store = readFileSync(join(__dirname, '..', 'taskStore.service.ts'), 'utf8');
    const at = store.indexOf('closed_at = CASE');

    expect(at).toBeGreaterThan(-1);
    const clause = store.slice(at, at + 200);
    expect(clause).toContain("WHEN $3 = 'closed' THEN NOW()");
    expect(clause).toContain("WHEN $3 = 'open'   THEN NULL");
  });

  it('deleting a thread closes its goal WITH the day', () => {
    const threads = readFileSync(join(__dirname, '..', 'threads.service.ts'), 'utf8');
    const at = threads.indexOf("closed_reason = 'thread_deleted'");

    expect(at).toBeGreaterThan(-1);
    expect(threads.slice(at, at + 120)).toContain('closed_at = NOW()');
  });

  it('the migration adds the column and says it cannot be backfilled', () => {
    const sql = readFileSync(
      join(__dirname, '..', '..', 'db', 'postgres', 'migrations', '172_goal_closed_at.sql'),
      'utf8',
    );

    expect(sql).toContain('ADD COLUMN IF NOT EXISTS closed_at');
    expect(sql).toMatch(/backfill/i);
  });
});

/**
 * AND A QUESTION ASKED THIS AFTERNOON IS NOT AN IGNORED ONE. „Sent minus
 * answered" would file every ask younger than the reply it is waiting for as a
 * failure, which is how a pilot's own numbers talk it out of a working
 * product.
 */
/**
 * ⚠️ THE asks BLOCK COUNTED EVERY ASK EVER, BESIDE A DATE RANGE.
 *
 * Found on 24 September by a cross-check between the route and the database,
 * a minute after that check first existed. The payload carries `from` and
 * `to`; the day rows and week rows are windowed; this block was not.
 *
 *     asks.sent as shipped          127    all time
 *     sum of days[].asks_sent        27    the seven days beside it
 *
 * One payload, two totals for the same thing. And I read the 127 out to the
 * tester as the week's figure and they repeated it in the PASS for row 256 —
 * so the wrong number had already travelled twice before anything caught it.
 */
describe('the asks summary covers the same window as the days beside it', () => {
  it('is bounded, and by the SAME expression the day rows use', async () => {
    await pilotReport(7);

    const sql = dbQuery.mock.calls.map((c) => String(c[0])).join('\n---\n');
    const asksQuery = sql.split('---').find((q) => q.includes('AS cancelled')) ?? '';
    expect(asksQuery).toContain('FROM task_asks');
    expect(asksQuery).toContain('(CURRENT_DATE - ($1::int - 1))::date');
  });

  /**
   * Two date bounds that mean to agree and are typed separately are the next
   * version of this bug, so the day rows must use the identical expression.
   */
  it('the day rows use that same expression, so the two cannot drift', async () => {
    await pilotReport(7);

    const sql = dbQuery.mock.calls.map((c) => String(c[0])).join('\n');
    const occurrences = sql.split('(CURRENT_DATE - ($1::int - 1))::date').length - 1;
    expect(occurrences).toBeGreaterThanOrEqual(2);
  });
});

describe('ignored, waiting and cancelled are three different things', () => {
  it('counts them apart', async () => {
    await pilotReport(7);

    const sql = dbQuery.mock.calls.map((c) => String(c[0])).join('\n');
    expect(sql).toContain('AS ignored');
    expect(sql).toContain('AS waiting');
    expect(sql).toContain('AS cancelled');
    expect(sql).toContain("a.status <> 'cancelled'");
  });
});

/**
 * ROW 16 — „the founder can open and read a real conversation", and the step
 * that was missing is WHOSE.
 *
 * The reading routes need a `user_id`; nothing answered „who are the pilot's
 * people". I probed the gate without touching anybody's data — `GET
 * /admin/pilot/threads` with no `user_id` answers 400 where a closed gate
 * would answer 403, because the gate is checked before the parameter — so the
 * reader is on and the list was the whole of what was missing.
 */
describe('the list of people to read', () => {
  it('asks only for the pilot’s real people, by the same rule as the report', async () => {
    await pilotPeople();

    const sql = String(dbQuery.mock.calls[0][0]);
    expect(sql).toContain('"hasAccessToAlly" = true');
    expect(sql).toContain('NOT EXISTS (SELECT 1 FROM test_seats');
  });

  /** D149: a screen needs a name and an id. A number would ride along for nothing. */
  it('carries no phone number, not even the last four', async () => {
    await pilotPeople();

    const sql = String(dbQuery.mock.calls[0][0]);
    expect(sql).not.toMatch(/phone/i);
    expect(sql).not.toContain('UserPhone');
  });

  /** The same gate as reading the conversations themselves — see the route. */
  it('is behind the pilot reader gate', () => {
    const routes = readFileSync(
      join(__dirname, '..', '..', 'api', 'routes', 'admin.routes.ts'),
      'utf8',
    );
    const at = routes.indexOf("adminRouter.get('/pilot/people'");

    expect(at).toBeGreaterThan(-1);
    expect(routes.slice(at, at + 400)).toContain('pilotReaderAllowed(req)');
  });
});

/**
 * ⚠️ ROW 274 — „started_a_goal 0 is impossible (93 goals open)."
 *
 * The tester was right to disbelieve it and it is not a bug. The two numbers
 * are scoped differently and nothing on the page said so:
 *
 *   started_a_goal   the people who JOINED IN THIS WINDOW
 *   goals            every real person's goals, whenever they joined
 *
 * Measured while fixing it: the 93 open goals belong to **12 real people**,
 * the earliest of whom joined in November 2023, and of the 32 who joined in
 * the last 28 days **none** has started a goal.
 *
 * So the honest reading is not „the number is broken" — it is that a month of
 * arrivals produced no goals at all. That is the founder's central question
 * and the answer is zero. Naming the scope is what lets it be read as an
 * answer instead of an error, which is the same fault as row 264 one page
 * over: a true number that nobody could interpret.
 */
describe('a number says who it counts', () => {
  const source = readFileSync(join(__dirname, '..', 'pilotOutcomes.service.ts'), 'utf8');

  it('says started_a_goal is about this window only', () => {
    expect(source).toContain('JOINED IN THIS WINDOW only');
  });

  it('says the goals block is not scoped to the window', () => {
    // Asserted on the words, not on where prettier decided to wrap them.
    const flat = source.replace(/\s+/g, ' ');

    expect(flat).toContain('whenever they joined');
    expect(flat).toContain('is why this can be large while started_a_goal is zero');
  });

  /** The fact that makes the gap readable: who the 93 actually belong to. */
  it('reports how many real people have a goal at all', () => {
    expect(source).toContain('people_with_any_goal');
    expect(source).toContain('COUNT(DISTINCT t.user_id)');
  });

  /** Seats stay excluded — the founder is asking about people. */
  it('still counts people and not seats', () => {
    const block = source.slice(source.indexOf('people_with_goals'));

    expect(block.slice(0, 300)).toContain('${NOT_A_SEAT}');
  });
});
