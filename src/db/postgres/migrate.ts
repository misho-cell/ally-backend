import { readdir, readFile } from 'fs/promises';
import { join } from 'path';
import { PoolClient } from 'pg';
import pool from './client';

const MIGRATIONS_DIR = join(__dirname, 'migrations');

async function ensureMigrationsTable(client: PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id         SERIAL PRIMARY KEY,
      filename   TEXT NOT NULL UNIQUE,
      applied_at TIMESTAMP DEFAULT NOW()
    )
  `);
}

async function getAppliedMigrations(client: PoolClient): Promise<Set<string>> {
  const result = await client.query<{ filename: string }>('SELECT filename FROM _migrations');
  return new Set(result.rows.map((r) => r.filename));
}

async function applyMigration(client: PoolClient, filename: string): Promise<void> {
  const sql = await readFile(join(MIGRATIONS_DIR, filename), 'utf8');
  // eslint-disable-next-line no-console
  console.log(`[migrate] applying: ${filename}`);
  await client.query(sql);
  await client.query('INSERT INTO _migrations (filename) VALUES ($1)', [filename]);
}

export async function runMigrations(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await ensureMigrationsTable(client);

    const applied = await getAppliedMigrations(client);
    const allFiles = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql')).sort();

    const pending = allFiles.filter((f) => !applied.has(f));

    for (const filename of pending) {
      await applyMigration(client, filename);
    }

    await client.query('COMMIT');

    if (pending.length > 0) {
      // eslint-disable-next-line no-console
      console.log(`[migrate] ${pending.length} migration(s) applied`);
    }
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
