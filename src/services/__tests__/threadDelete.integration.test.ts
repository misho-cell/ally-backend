// DELETE /threads against the REAL tasks schema: tasks.user_id is TEXT and
// status has a CHECK allowing only open/paused/closed (migration 040). The
// first cut cast user_id to int and wrote status 'cancelled' — both parse/
// constraint errors invisible to mocked tests, and every real delete 500ed
// (ticket 5 item A2). Locked here the way the UUID pagination bug was.
//
// Skipped unless PG_INTEGRATION=1.

import pool, { query } from '../../db/postgres/client';
import { deleteThread } from '../threads.service';

const maybeDescribe = process.env.PG_INTEGRATION === '1' ? describe : describe.skip;

const SCHEMA_SQL = `
  DROP TABLE IF EXISTS conversations, threads, tasks, run_prompt_stamps CASCADE;
  CREATE TABLE threads (id serial primary key, user_id int, title text,
                        updated_at timestamptz default now());
  CREATE TABLE conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    thread_id int, user_id text, content text, created_at timestamp default now());
  CREATE TABLE tasks (
    id serial primary key,
    user_id TEXT NOT NULL,
    thread_id int,
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'paused', 'closed')),
    closed_reason TEXT);
  CREATE TABLE run_prompt_stamps (run_id text primary key, thread_id int);
`;

const SEED_SQL = `
  INSERT INTO threads (id, user_id, title) VALUES (81, 501, 'mine'), (82, 777, 'theirs');
  INSERT INTO conversations (thread_id, user_id, content) VALUES (81, '501', 'hello');
  INSERT INTO tasks (user_id, thread_id, status) VALUES ('501', 81, 'open');
  INSERT INTO run_prompt_stamps (run_id, thread_id) VALUES ('r1', 81);
`;

async function count(sql: string): Promise<number> {
  const result = await query<{ count: string }>(sql, [], 10_000);
  return Number(result.rows[0]?.count ?? 0);
}

maybeDescribe('thread deletion (real tasks schema: TEXT user_id + status CHECK)', () => {
  beforeAll(async () => {
    await query(SCHEMA_SQL, [], 30_000);
    await query(SEED_SQL, [], 30_000);
  });

  afterAll(async () => {
    await pool.end();
  });

  it('deletes a thread with an open task: task closed with a reason, everything else gone', async () => {
    const result = await deleteThread('501', 81);

    expect(result.deleted).toBe(true);
    expect(result.cancelledTasks).toHaveLength(1);
    expect(await count('SELECT COUNT(*) AS count FROM threads WHERE id = 81')).toBe(0);
    expect(await count('SELECT COUNT(*) AS count FROM conversations WHERE thread_id = 81')).toBe(0);
    expect(
      await count('SELECT COUNT(*) AS count FROM run_prompt_stamps WHERE thread_id = 81'),
    ).toBe(0);
    const task = await query<{ status: string; closed_reason: string }>(
      `SELECT status, closed_reason FROM tasks WHERE thread_id = 81`,
      [],
      10_000,
    );
    expect(task.rows[0].status).toBe('closed');
    expect(task.rows[0].closed_reason).toBe('thread_deleted');
  });

  it("refuses to delete someone else's thread", async () => {
    const result = await deleteThread('501', 82);

    expect(result.deleted).toBe(false);
    expect(await count('SELECT COUNT(*) AS count FROM threads WHERE id = 82')).toBe(1);
  });
});
