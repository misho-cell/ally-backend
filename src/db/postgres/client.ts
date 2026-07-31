import dotenv from 'dotenv';
import { Pool, PoolClient, QueryConfig, QueryResult, QueryResultRow } from 'pg';

dotenv.config();

const SSL_CONFIG =
  process.env.POSTGRES_SSL && process.env.POSTGRES_SSL.toLowerCase() !== 'false'
    ? { rejectUnauthorized: false }
    : false;

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
});

// Background jobs (enrichment, backfills) draw from their OWN tiny pool so a
// heavy job can mathematically never starve a user-facing query of a
// connection. The 30 Jul search outage was exactly this: the enrichment
// backlog run saturated the shared pool and every search timed out.
const backgroundPool = new Pool({
  ...BASE_POOL_CONFIG,
  max: 2,
  connectionTimeoutMillis: 30_000,
});

const DEFAULT_QUERY_TIMEOUT_MS = 8000;
// Background scans are allowed to be slow — they compete with nobody.
const BACKGROUND_QUERY_TIMEOUT_MS = 30_000;

async function runOnPool<T extends QueryResultRow>(
  sourcePool: Pool,
  queryText: string,
  params: unknown[] | undefined,
  timeoutMs: number,
): Promise<QueryResult<T>> {
  const client = await sourcePool.connect();
  try {
    // SET LOCAL only applies inside a transaction; this path is autocommit,
    // so use a session-level SET (re-applied on every borrow of the connection).
    await client.query(`SET statement_timeout = ${Math.floor(timeoutMs)}`);
    // Must await before release — returning the promise unawaited releases the
    // connection while the query is still in flight, corrupting the pool.
    return await client.query<T>({ text: queryText, values: params });
  } finally {
    client.release();
  }
}

export async function query<T extends QueryResultRow>(
  queryText: string,
  params?: unknown[],
  timeoutMs: number = DEFAULT_QUERY_TIMEOUT_MS,
): Promise<QueryResult<T>> {
  return runOnPool<T>(pool, queryText, params, timeoutMs);
}

/** Same contract as query(), but on the isolated background pool — use for jobs, never for request handling. */
export async function backgroundQuery<T extends QueryResultRow>(
  queryText: string,
  params?: unknown[],
  timeoutMs: number = BACKGROUND_QUERY_TIMEOUT_MS,
): Promise<QueryResult<T>> {
  return runOnPool<T>(backgroundPool, queryText, params, timeoutMs);
}

export async function queryConfig<T extends QueryResultRow>(
  queryConfig: QueryConfig<unknown[]>,
): Promise<QueryResult<T>> {
  const client = await pool.connect();

  try {
    await client.query(`SET statement_timeout = ${DEFAULT_QUERY_TIMEOUT_MS}`);
    return await client.query<T>(queryConfig);
  } finally {
    client.release();
  }
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
