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

async function runOnPool<T extends QueryResultRow>(
  sourcePool: Pool,
  defaultTimeoutMs: number,
  queryText: string,
  params: unknown[] | undefined,
  timeoutMs: number,
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
  const client = await sourcePool.connect();
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
  return runOnPool<T>(pool, DEFAULT_QUERY_TIMEOUT_MS, queryText, params, timeoutMs);
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

export default pool;
