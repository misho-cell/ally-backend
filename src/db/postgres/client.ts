import dotenv from 'dotenv';
import { Pool, PoolClient, QueryConfig, QueryResult, QueryResultRow } from 'pg';

dotenv.config();

const pool = new Pool({
  host: process.env.POSTGRES_HOST,
  port: Number(process.env.POSTGRES_PORT ?? 5432),
  database: process.env.POSTGRES_DB ?? 'postgres',
  user: process.env.POSTGRES_NAME,
  password: process.env.POSTGRES_PASS,
  max: 10,
  ssl:
    process.env.POSTGRES_SSL && process.env.POSTGRES_SSL.toLowerCase() !== 'false'
      ? { rejectUnauthorized: false }
      : false,
});

const DEFAULT_QUERY_TIMEOUT_MS = 5000;

export async function query<T extends QueryResultRow>(
  queryText: string,
  params?: unknown[],
  timeoutMs: number = DEFAULT_QUERY_TIMEOUT_MS,
): Promise<QueryResult<T>> {
  const client = await pool.connect();

  try {
    await client.query(`SET LOCAL statement_timeout = ${timeoutMs}`);
    return client.query<T>({ text: queryText, values: params });
  } finally {
    client.release();
  }
}

export async function queryConfig<T extends QueryResultRow>(
  queryConfig: QueryConfig<unknown[]>,
): Promise<QueryResult<T>> {
  const client = await pool.connect();

  try {
    await client.query(`SET LOCAL statement_timeout = ${DEFAULT_QUERY_TIMEOUT_MS}`);
    return client.query<T>(queryConfig);
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
