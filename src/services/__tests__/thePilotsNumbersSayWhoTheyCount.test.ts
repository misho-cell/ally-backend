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

  it('carries the rule in the payload, so a number cannot travel without it', async () => {
    const report = await pilotReport(7);

    expect(report.population).toContain('hasAccessToAlly');
    expect(report.population).toContain('test_seats');
    expect(report.population).toContain('legacy Ally');
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
