import dotenv from 'dotenv';
import { Pool, PoolClient, QueryConfig, QueryResult, QueryResultRow } from 'pg';

dotenv.config();

const SSL_CONFIG =
  process.env.POSTGRES_SSL && process.env.POSTGRES_SSL.toLowerCase() !== 'false'
    ? { rejectUnauthorized: false }
    : false;

const DEFAULT_QUERY_TIMEOUT_MS = 8000;
// Background scans are allowed to be slow — they compete with nobody.
const BACKGROUND_QUERY_TIMEOUT_MS = 30_000;

const BASE_POOL_CONFIG = {
  host: process.env.POSTGRES_HOST,
  port: Number(process.env.POSTGRES_PORT ?? 5432),
  database: process.env.POSTGRES_DB ?? 'postgres',
  user: process.env.POSTGRES_NAME,
  password: process.env.POSTGRES_PASS,
  ssl: SSL_CONFIG,
};

const pool = new Pool({
  ...BASE_POOL_CONFIG,
  max: 10,
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
 * it somebody else's problem. Heavy work stays bounded at ten, exactly as it
 * is today; what changes is that a 50 ms lookup no longer stands behind it.
 * If the searches need more room after this, that is a separate decision with
 * its own measurement.
 *
 * The same argument, and nearly the same words, as the background pool below.
 */
const longQueryPool = new Pool({
  ...BASE_POOL_CONFIG,
  max: 10,
  connectionTimeoutMillis: 10_000,
  options: `-c statement_timeout=${DEFAULT_QUERY_TIMEOUT_MS}`,
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
    try {
      await client.query(`SET statement_timeout = ${defaultTimeoutMs}`);
      client.release();
    } catch {
      // The connection is in an unknown state — destroy it rather than
      // returning it to the pool with a foreign timeout.
      client.release(true);
    }
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
  const sourcePool = timeoutMs > DEFAULT_QUERY_TIMEOUT_MS ? longQueryPool : pool;
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
