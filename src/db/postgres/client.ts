import { AsyncLocalStorage } from 'async_hooks';
import dotenv from 'dotenv';
import { Pool, PoolClient, QueryConfig, QueryResult, QueryResultRow } from 'pg';

import { assertPlaceholdersMatchParams } from './placeholders';

dotenv.config();

const SSL_CONFIG =
  process.env.POSTGRES_SSL && process.env.POSTGRES_SSL.toLowerCase() !== 'false'
    ? { rejectUnauthorized: false }
    : false;

const DEFAULT_QUERY_TIMEOUT_MS = 8000;
// Background scans are allowed to be slow — they compete with nobody.
const BACKGROUND_QUERY_TIMEOUT_MS = 30_000;

/**
 * 958: how long an idle connection is kept. pg's own default is ten seconds,
 * so a chat turn after a short pause opened its connections afresh — TCP, TLS
 * and auth, about six round trips at ~145 ms each — before its first query.
 * The database counted 10–25 new sessions a minute on 10 October. Five
 * minutes keeps an ordinary conversation on warm connections; the pools' `max`
 * still bounds how many there are.
 */
const IDLE_CONNECTION_KEEP_MS = 5 * 60_000;

const BASE_POOL_CONFIG = {
  host: process.env.POSTGRES_HOST,
  port: Number(process.env.POSTGRES_PORT ?? 5432),
  database: process.env.POSTGRES_DB ?? 'postgres',
  user: process.env.POSTGRES_NAME,
  password: process.env.POSTGRES_PASS,
  ssl: SSL_CONFIG,
  idleTimeoutMillis: IDLE_CONNECTION_KEEP_MS,
  // A kept connection must notice a dropped network instead of sitting dead.
  keepAlive: true,
};

/**
 * 5320 (the tester's 200-seat load test, 15 Oct 16:44Z): ten connections for
 * every short query of every run. 73 of 200 runs failed and the send itself
 * took 61 s to accept: 950 „timeout exceeded when trying to connect" in two
 * minutes, the prompt's own lookups queued 73 s before the model was called.
 * The database allows 2,091 connections and held 54 at the time. The short
 * pool is the one that serves 50 ms lookups, so it is the one that grows; the
 * long and background pools stay bounded for the reason given at each.
 */
// 40 after 5320; 80 after the fourth 200 run (60530), where the prompt's own
// reads still queued 7 s and a contact search waited 6 s against 2 s alone.
const SHORT_POOL_MAX = 80;

const pool = new Pool({
  ...BASE_POOL_CONFIG,
  max: SHORT_POOL_MAX,
  // Fail fast instead of waiting forever when the pool is saturated, so a
  // stalled request surfaces an error rather than hanging until restart.
  connectionTimeoutMillis: 10_000,
  // The default statement timeout rides on the CONNECTION, not on each query:
  // every query used to spend a separate round trip on `SET statement_timeout`
  // first, doubling its network cost. With the DB ~100ms away that overhead
  // was the founder's "3 seconds to send a message" — ~10 queries on the send
  // path × 2 round trips each (ticket 4 PART C, measured: 2.4–3.1s of server
  // work for a 202). It also serialised concurrent requests behind pool
  // checkouts. Custom-timeout queries still SET explicitly — and RESET after,
  // so a pooled connection never leaks a long timeout to its next borrower.
  options: `-c statement_timeout=${DEFAULT_QUERY_TIMEOUT_MS}`,
});

/**
 * Ticket 20 row 108 — the long queries get their own connections, so they
 * cannot starve the short ones.
 *
 * MEASURED, 18 September 18:46, thirteen second-degree searches on a container
 * that had been up half an hour and had already served a 22-search sweep. The
 * pool at the END of every one of the thirteen, without exception:
 *
 *   total 10 / 0 idle / 3 to 24 waiting
 *
 * Ten is this pool's max. Zero idle. Up to twenty-four requests queued. That
 * is not a pool that keeps discarding its connections — it grew to its ceiling
 * and stopped there, which kills the idleTimeoutMillis theory I was holding an
 * hour earlier, and it is not a slow database either: Neo4j, which does not go
 * through here, sat flat at 1,180 to 1,235 ms across the whole burst.
 *
 * WHAT WAS ACTUALLY QUEUED is the point. In the sweep before it, sixty-one of
 * the sixty-two slow queries were small lookups — human_relationship_tiers,
 * contact_exclusions, person_identities — at 3.1 to 3.7 seconds each, against
 * the 150 to 700 ms the phase log measures for them all day. Dozens finished
 * on the same millisecond. They are not slow. They were behind a handful of
 * fifteen-second searches holding nine of the ten connections.
 *
 * So the split is by how long a query is ALLOWED to take, which is the only
 * thing we know about it before it runs. A query with a custom timeout has
 * asked for room the default cannot give it, and it is the one that holds a
 * client for its whole duration; everything else keeps the short pool to
 * itself and no longer waits behind it.
 *
 * DELIBERATELY NOT A BIGGER `max`. The searches themselves read gigabytes, so
 * letting thirty of them run at once moves the queue into the disk and makes
 * it somebody else's problem. Heavy work stayed bounded at ten, exactly as it
 * was then; what changes is that a 50 ms lookup no longer stands behind it.
 * If the searches need more room after this, that is a separate decision with
 * its own measurement.
 *
 * The same argument, and nearly the same words, as the background pool below.
 */
/**
 * THE MEASUREMENT THE NOTE ABOVE ASKED FOR — the tester's 5th 200-seat run, 15
 * October 21:34–21:42Z (box 60692). The short pool had just gone to 80, and the
 * searches did not get faster: every one of them still came through here. The
 * `[db slow]` lines of that window read this pool at 10 / 0 idle / up to 629
 * waiting. 1,009 country-channel and search_by_tag queries ended at exactly
 * ten seconds with „timeout exceeded when trying to connect" — they never
 * reached the database, which sat at 8% CPU between runs — and three
 * marketing runs told their owner both searches had failed.
 *
 * Alone, one search_by_tag takes 2.2 s; ten slots pass about four and a half
 * of them a second, against twelve hundred asked for in two minutes. The pool
 * goes to 24, not to 80: the searches are the heavy readers the note warns
 * about, and the next run reads the database's CPU beside it. A search that
 * finds the pool full waits up to 30 s for its turn instead of 10, since a
 * search that starts late still answers and one that gives up never does.
 */
/**
 * The 6th 200-seat run (16 Oct 07:09–07:13Z, box 61681) answered the question
 * the note above left open. With 24 connections a search spent about 0.8 s in
 * the database and a median 16.7 s waiting for one (up to 629 queued): the
 * database has room, the pool did not. 285 slow tools against 284 before.
 */
/**
 * And the 7th (16 Oct 09:00Z, box 61821) answered the 6th. At 64 a search spent
 * 2.1 s in the database and waited 10.9 s for a connection: 64 / 2.1 s and
 * 24 / 0.8 s are the same thirty searches a second. The database was already the
 * ceiling, so the extra forty connections bought no searches — they took the CPU
 * from everything short beside them. „Hello" went from 2.3 s after acceptance at
 * 24 to 4.2 s at 64. Back to 24: the same search throughput, and the short work
 * (a hello, an accept, a run's first reads) is not starved by it.
 */
/**
 * And run 10 (16 Oct 15:20Z, 200 at once) named the ceiling. 854 slow queries on
 * this pool: a median 10.4 s, 9.6 s of it waiting for a connection, ~0.8 s
 * holding one — and the short pool sat at 79 idle. A search with its own timeout
 * held its connection for three round trips of ~150 ms (SET, the query, the SET
 * that restores the default before release), so most of the 0.8 s was the road
 * to the database, not the database. This pool's connections now carry the
 * searches' longest timeout from the start: a long query up to it is one round
 * trip, and the 24 connections pass about half again as many searches.
 *
 * The price, stated: a search asked to stop at 12 or 15 s may run to 20 s inside
 * the database. A search that answers late still answers; one cut off does not.
 */
const LONG_POOL_STATEMENT_TIMEOUT_MS = 20_000;
const LONG_POOL_MAX = 24;
const LONG_POOL_CONNECT_WAIT_MS = 30_000;
const longQueryPool = new Pool({
  ...BASE_POOL_CONFIG,
  max: LONG_POOL_MAX,
  connectionTimeoutMillis: LONG_POOL_CONNECT_WAIT_MS,
  options: `-c statement_timeout=${LONG_POOL_STATEMENT_TIMEOUT_MS}`,
});

// Background jobs (enrichment, backfills) draw from their OWN tiny pool so a
// heavy job can mathematically never starve a user-facing query of a
// connection. The 30 Jul search outage was exactly this: the enrichment
// backlog run saturated the shared pool and every search timed out.
const backgroundPool = new Pool({
  ...BASE_POOL_CONFIG,
  max: 2,
  connectionTimeoutMillis: 30_000,
  options: `-c statement_timeout=${BACKGROUND_QUERY_TIMEOUT_MS}`,
});

/**
 * 5321 (the tester's 200-seat re-run, 15 Oct 17:38Z): with 0349 every run
 * answered, but a send still took 14.6 s to be accepted — its five lookups
 * stood in the same queue as 200 runs' (pool 40, 0 idle, ~550 waiting).
 * Accepting a message is the one request a person stares at, so it gets its
 * own small lane: queries made while a send is being accepted draw from this
 * pool, and the run it starts leaves the lane (`leaveIntakeLane`).
 */
/**
 * Run 6: 200 sends at once queued up to 190 deep on ten connections, and the
 * browser saw a median 31.8 s to the 202 (1.4–1.6 s for one sender alone).
 *
 * 5321 (the tester's 200 run, 18 Oct 04:16Z): on forty, the server's own
 * accept was 2.23 s median, and no single accept query was slow. Each send
 * makes about four trips of ~145 ms, so 200 at once wait for a free
 * connection. The database allows 2,091 connections and had 61 in use; with
 * this pool at 100, this process opens at most 206 (80 + 24 + 2 + 100).
 */
const INTAKE_POOL_MAX = 100;
const intakePool = new Pool({
  ...BASE_POOL_CONFIG,
  max: INTAKE_POOL_MAX,
  connectionTimeoutMillis: 10_000,
  options: `-c statement_timeout=${DEFAULT_QUERY_TIMEOUT_MS}`,
});
const intakeLane = new AsyncLocalStorage<true>();

/** Run `work` — and everything it starts — on the intake lane. */
export function onIntakeLane<T>(work: () => T): T {
  return intakeLane.run(true, work);
}

/** Run `work` — and everything it starts — off the intake lane, on the ordinary pools. */
export function leaveIntakeLane<T>(work: () => T): T {
  return intakeLane.exit(work);
}

/**
 * 958: an idle connection the database or the network drops is emitted as an
 * `error` on its pool, and an `error` event with no listener ends the process.
 * The pool has already discarded that connection; the next query opens another.
 */
for (const eachPool of [pool, longQueryPool, backgroundPool, intakePool]) {
  eachPool.on('error', (error: Error) => {
    // eslint-disable-next-line no-console
    console.warn(`[db] idle connection dropped: ${error.message}`);
  });
}

/**
 * A query slower than this is named in the log with how long it took. A
 * timeout is always named, whatever the threshold.
 *
 * On 5 September one config change turned a route into a 500 and the log said
 * only "canceling statement due to statement timeout" — nothing about WHICH
 * of the route's fifteen queries had died. Finding it took an hour of timing
 * candidates by hand against the read replica.
 *
 * Only a prefix of the SQL is logged, never the parameters: they carry phone
 * numbers and names.
 */
const SLOW_QUERY_LOG_MS = Number(process.env.SLOW_QUERY_LOG_MS ?? 3000);
const SQL_LOG_PREFIX_CHARS = 160;

function sqlForLog(queryText: string): string {
  const oneLine = queryText.replace(/\s+/g, ' ').trim();
  return oneLine.length > SQL_LOG_PREFIX_CHARS
    ? `${oneLine.slice(0, SQL_LOG_PREFIX_CHARS)}…`
    : oneLine;
}

async function runOnPool<T extends QueryResultRow>(
  sourcePool: Pool,
  defaultTimeoutMs: number,
  queryText: string,
  params: unknown[] | undefined,
  timeoutMs: number,
): Promise<QueryResult<T>> {
  const startedAt = Date.now();
  const borrow: Borrow = {};
  try {
    // Before the round trip, and INSIDE this try so it is reported through the
    // same `[db failed]` line as everything else that goes wrong with a query.
    // See placeholders.ts: the reaper threw every twenty seconds for four hours
    // on a `$3` with one parameter behind it, and the database's own account of
    // that names the wrong parameter and no query at all.
    assertPlaceholdersMatchParams(queryText, params);
    return await runOnPoolUntimed<T>(
      sourcePool,
      defaultTimeoutMs,
      queryText,
      params,
      timeoutMs,
      borrow,
    );
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(
      `[db failed] ${Date.now() - startedAt}ms :: ${sqlForLog(queryText)} :: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    throw error;
  } finally {
    const elapsed = Date.now() - startedAt;
    if (elapsed >= SLOW_QUERY_LOG_MS) {
      // eslint-disable-next-line no-console
      console.warn(
        `[db slow] ${elapsed}ms${waitWord(borrow)} ${poolWord(sourcePool)} :: ${sqlForLog(queryText)}`,
      );
    }
  }
}

/**
 * Ticket 20 row 108 — separating „the database was slow" from „there was no
 * connection to ask it with".
 *
 * On 18 September, 18:19:49-18:20:00, sixty-two queries crossed the slow
 * threshold in eleven seconds. The heavy second-degree scan is one of them at
 * 5,699 ms. The other sixty-one are these:
 *
 *   SELECT contact_phone, tier FROM human_relationship_tiers …   3,700 ms
 *   SELECT contact_phone, excluded_for, reason, revision …       3,653 ms
 *   SELECT phone, person_id FROM person_identities …             3,211 ms
 *
 * Small lookups on small tables, which cost 150 to 700 ms in the phase log all
 * day. Dozens of them finished on the SAME MILLISECOND — .225, .224, .262 —
 * which is not what slow queries look like. It is what a queue looks like when
 * it drains.
 *
 * The `waiting` field says the same from the pool's side, and both of them
 * stop one question short: a request can wait because every connection is BUSY
 * (the pool is too small) or because its connection is still being ESTABLISHED
 * (the pool keeps throwing them away — `idleTimeoutMillis` defaults to ten
 * seconds and is not set here). Those have different one-line fixes and the
 * numbers so far cannot tell them apart, which is why I have not touched the
 * config.
 *
 * So the slow line now carries the pool's own state, and — on the custom-
 * timeout path, which is the one that BORROWS a client — how long the borrow
 * took. A borrow of three seconds is the queue; a fast borrow under a slow
 * query is the database. One busy minute answers it.
 *
 * The hot path is left exactly as it was. It is a single round trip through
 * pool.query for a reason, and a diagnostic is not worth restructuring it.
 */
function poolWord(sourcePool: Pool): string {
  return `pool ${sourcePool.totalCount}/${sourcePool.idleCount}idle/${sourcePool.waitingCount}waiting`;
}

/**
 * How long this one call waited for a connection, when it borrowed one.
 *
 * Passed down rather than stashed in a module-level map. My first version
 * keyed it by the query TEXT, which is wrong the moment two copies of the same
 * query are in flight — and a burst of identical searches is precisely the
 * case this exists to measure. A per-call holder cannot cross-talk.
 */
interface Borrow {
  ms?: number;
}

function waitWord(borrow: Borrow): string {
  return borrow.ms === undefined ? '' : ` (${borrow.ms}ms waiting for a connection)`;
}

async function runOnPoolUntimed<T extends QueryResultRow>(
  sourcePool: Pool,
  defaultTimeoutMs: number,
  queryText: string,
  params: unknown[] | undefined,
  timeoutMs: number,
  borrow: Borrow,
): Promise<QueryResult<T>> {
  // The hot path: the pool's connections already carry the default
  // statement_timeout (see the Pool options), so a default-timeout query is a
  // SINGLE round trip via pool.query — no checkout, no SET.
  if (timeoutMs === defaultTimeoutMs) {
    return sourcePool.query<T>({ text: queryText, values: params });
  }
  // Custom timeout: borrow a client, widen the timeout for this query only,
  // and ALWAYS restore the default before releasing — a pooled connection must
  // never hand a long timeout to its next borrower.
  const borrowStartedAt = Date.now();
  const client = await sourcePool.connect();
  borrow.ms = Date.now() - borrowStartedAt;
  try {
    await client.query(`SET statement_timeout = ${Math.floor(timeoutMs)}`);
    // Must await before the finally — releasing with the query still in
    // flight corrupts the pool.
    return await client.query<T>({ text: queryText, values: params });
  } finally {
    void restoreThenRelease(client, defaultTimeoutMs);
  }
}

/**
 * 958: the restore is the connection's business, not the caller's. With the
 * database ~145 ms away the caller used to wait one more round trip for it
 * after its rows had arrived. The connection still goes back to the pool only
 * once the default is restored, so no borrower ever gets a foreign timeout.
 */
async function restoreThenRelease(client: PoolClient, defaultTimeoutMs: number): Promise<void> {
  try {
    await client.query(`SET statement_timeout = ${defaultTimeoutMs}`);
    client.release();
  } catch (error) {
    // The connection is in an unknown state — destroy it rather than
    // returning it to the pool with a foreign timeout.
    // eslint-disable-next-line no-console
    console.warn(
      `[db] default timeout not restored, connection dropped: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    client.release(true);
  }
}

export async function query<T extends QueryResultRow>(
  queryText: string,
  params?: unknown[],
  timeoutMs: number = DEFAULT_QUERY_TIMEOUT_MS,
): Promise<QueryResult<T>> {
  /**
   * Row 108, second pass — LONGER than the default, not merely DIFFERENT.
   *
   * My first version sent every custom timeout to the long pool, and I wrote a
   * test saying a short one going there was fine. The next burst said it was
   * not. `touched` and `states`, which take the default, fell from 544-5,395
   * and 696-5,701 ms to 144-152 and 195-257 — every one. `excl` went on
   * climbing to 3,408 ms, and `excl` is a 5,000 ms lookup on a small table,
   * which my rule had just filed as a long query and parked behind fourteen
   * fifteen-second searches.
   *
   * A timeout BELOW the default is a query saying „I should be quick" — the
   * exact opposite of what the long pool is for. Every custom timeout in this
   * codebase reads that way: 3s and 5s on small lookups, 10s to 15s on the
   * searches and the analytics.
   */
  if (timeoutMs > DEFAULT_QUERY_TIMEOUT_MS) {
    // Run 10: up to the long pool's own timeout the query is one round trip.
    return runOnPool<T>(
      longQueryPool,
      LONG_POOL_STATEMENT_TIMEOUT_MS,
      queryText,
      params,
      Math.max(timeoutMs, LONG_POOL_STATEMENT_TIMEOUT_MS),
    );
  }
  const sourcePool = intakeLane.getStore() === true ? intakePool : pool;
  return runOnPool<T>(sourcePool, DEFAULT_QUERY_TIMEOUT_MS, queryText, params, timeoutMs);
}

/** Same contract as query(), but on the isolated background pool — use for jobs, never for request handling. */
export async function backgroundQuery<T extends QueryResultRow>(
  queryText: string,
  params?: unknown[],
  timeoutMs: number = BACKGROUND_QUERY_TIMEOUT_MS,
): Promise<QueryResult<T>> {
  return runOnPool<T>(backgroundPool, BACKGROUND_QUERY_TIMEOUT_MS, queryText, params, timeoutMs);
}

export async function queryConfig<T extends QueryResultRow>(
  queryConfig: QueryConfig<unknown[]>,
): Promise<QueryResult<T>> {
  // The pool's connections carry the default timeout already — single trip.
  return pool.query<T>(queryConfig);
}

export async function withTransaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SET LOCAL statement_timeout = ${DEFAULT_QUERY_TIMEOUT_MS}`);
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * What the pool is doing right now — total, idle, and WAITING.
 *
 * The seat, 18 September, reading six searches issued inside two seconds that
 * all finished within a five-second band with wildly different row counts:
 * „they are not six queries each taking twelve seconds of work, they are six
 * queries sharing one queue." They were right to ask whether it is this pool,
 * and right that they could not tell from outside: a wait for a CONNECTION is
 * inside the awaited call, so it is counted as query time by every timer we
 * have.
 *
 * `waitingCount` is the answer and it costs nothing to read. Above zero means
 * a caller is queueing for one of the ten connections; zero across a slow run
 * means the queue is somewhere else — the disk, which reads 424,541 blocks for
 * one second-degree search at about a millisecond each.
 *
 * Reported rather than reasoned about, because three of my four theories on
 * that row were wrong today and every one of them died to a measurement.
 */
export function poolPressure(): { total: number; idle: number; waiting: number } {
  // Row 108: the LONG pool, because that is the one a search borrows from and
  // the one whose queue the second-degree line exists to report. Reading the
  // short pool here would answer a question nobody asked.
  return {
    total: longQueryPool.totalCount,
    idle: longQueryPool.idleCount,
    waiting: longQueryPool.waitingCount,
  };
}

export default pool;
