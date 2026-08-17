// Erasure against a REAL Postgres: a deletion that half-works is worse than
// none, because the person is told they are gone and they are not. Mocks
// cannot prove a cascade — only a live schema can.
//
// Skipped unless PG_INTEGRATION=1. Local run:
//   PG_INTEGRATION=1 POSTGRES_HOST=localhost POSTGRES_PORT=5433 \
//     POSTGRES_NAME=postgres POSTGRES_DB=postgres npx jest privacyRights.integration

jest.mock('../../db/neo4j/client', () => ({
  __esModule: true,
  getSession: () => ({
    run: jest.fn().mockResolvedValue({ records: [] }),
    close: jest.fn().mockResolvedValue(undefined),
  }),
}));

import pool, { query } from '../../db/postgres/client';
import { deleteMyAccount, getMyDataSummary, isPhoneOptedOut } from '../privacyRights.service';

const maybeDescribe = process.env.PG_INTEGRATION === '1' ? describe : describe.skip;

const SCHEMA_SQL = `
  DROP TABLE IF EXISTS "UserAlias", "UserTags", "UserPhone", "User", "UserBlock",
    conversations, threads, tasks, task_asks, user_notes, contact_facts,
    run_prompt_stamps, phone_optouts, ask_optouts, erasure_log CASCADE;
  CREATE TABLE "User"      (id serial primary key, name text, employer text,
                            "jobPosition" text, city text, "deletedAt" timestamptz);
  CREATE TABLE "UserPhone" (id serial primary key, phone text, "userId" int);
  CREATE TABLE "UserAlias" (id serial primary key, phone text, "contactId" int, alias text);
  CREATE TABLE "UserTags"  (id serial primary key, phone text, "contactId" int, tag text);
  CREATE TABLE "UserBlock" (id serial primary key, "blockerId" int, "blockedPhone" text);
  CREATE TABLE conversations (id serial primary key, user_id int, thread_id int, content text);
  CREATE TABLE threads (id serial primary key, user_id int, title text);
  -- Prod truth: tasks.user_id and contact_facts.submitted_by_user_id are TEXT
  -- (schema drift, migrations 040/–) — the ::int summary bug only reproduces here.
  CREATE TABLE tasks (id serial primary key, user_id text, thread_id int, status text);
  CREATE TABLE task_asks (id serial primary key, task_id int, from_user_id int,
                          to_user_id int, question text, answer text, status text);
  CREATE TABLE user_notes (id serial primary key, user_id int, text text);
  -- Prod shape (migration 052): a sibling suite creates a user_id-less variant
  -- in the shared test DB — this suite must own the prod-true one.
  CREATE TABLE run_prompt_stamps (run_id text primary key, user_id integer not null,
                                  thread_id integer, mode text not null default 'quick_answer');
  CREATE TABLE contact_facts (id serial primary key, submitted_by_user_id text, value text);
  CREATE TABLE phone_optouts (phone_digits text primary key, reason text,
                              created_at timestamptz not null default now());
  CREATE TABLE ask_optouts (user_id integer primary key, reason text,
                            created_at timestamptz not null default now());
  CREATE TABLE erasure_log (id serial primary key, user_id integer not null,
                            rows_deleted jsonb not null default '{}',
                            created_at timestamptz not null default now());
`;

// 501 is being erased; 777 is a bystander whose data must survive intact.
const SEED_SQL = `
  INSERT INTO "User" (id, name, employer, city) VALUES
    (501, 'Tornike Abuladze', 'Ally', 'Tbilisi'),
    (777, 'Bystander', 'Elsewhere', 'Batumi');
  INSERT INTO "UserPhone" (phone, "userId") VALUES ('+995599992878', 501), ('+995599000777', 777);
  INSERT INTO "UserAlias" (phone, "contactId", alias) VALUES
    ('+995111', 501, 'Gia'), ('+995222', 501, 'Nino'), ('+995333', 777, 'Keep Me');
  INSERT INTO "UserTags" (phone, "contactId", tag) VALUES ('+995111', 501, 'lawyer'), ('+995333', 777, 'keep');
  INSERT INTO "UserBlock" ("blockerId", "blockedPhone") VALUES (501, '+995444');
  INSERT INTO threads (id, user_id, title) VALUES (1, 501, 'mine'), (2, 777, 'theirs');
  INSERT INTO conversations (user_id, thread_id, content) VALUES (501, 1, 'private'), (777, 2, 'keep');
  INSERT INTO tasks (id, user_id, thread_id, status) VALUES (10, '501', 1, 'open'), (11, '777', 2, 'open');
  INSERT INTO user_notes (user_id, text) VALUES (501, 'secret'), (777, 'keep');
  INSERT INTO run_prompt_stamps (run_id, user_id, thread_id) VALUES ('run-501', 501, 1), ('run-777', 777, 2);
  INSERT INTO contact_facts (submitted_by_user_id, value) VALUES ('501', 'fact'), ('777', 'keep');
  -- An ask 777 sent to 501: their record, her words.
  INSERT INTO task_asks (task_id, from_user_id, to_user_id, question, answer, status) VALUES
    (11, 777, 501, 'do you know a dentist?', 'yes, Tatia', 'answered');
  -- An ask 501 sent to 777: entirely 501's, goes away.
  INSERT INTO task_asks (task_id, from_user_id, to_user_id, question, answer, status) VALUES
    (10, 501, 777, 'mine', NULL, 'sent');
`;

async function count(sql: string): Promise<number> {
  const result = await query<{ count: string }>(sql, [], 10_000);
  return Number(result.rows[0]?.count ?? 0);
}

maybeDescribe('right to erasure (real Postgres cascade)', () => {
  beforeAll(async () => {
    await query(SCHEMA_SQL, [], 30_000);
    await query(SEED_SQL, [], 30_000);
  });

  afterAll(async () => {
    await pool.end();
  });

  it('previews exactly what would go, changing nothing (dry run)', async () => {
    const report = await deleteMyAccount('501', true);

    expect(report.dryRun).toBe(true);
    expect(report.rowsDeleted['UserAlias']).toBe(2);
    expect(report.rowsDeleted['user_notes']).toBe(1);
    // Nothing moved.
    expect(await count('SELECT COUNT(*) AS count FROM user_notes WHERE user_id = 501')).toBe(1);
    expect(
      await count(`SELECT COUNT(*) AS count FROM "User" WHERE id = 501 AND "deletedAt" IS NULL`),
    ).toBe(1);
  });

  it('summarises the account by category', async () => {
    const summary = await getMyDataSummary('501');

    expect(summary['UserAlias']).toBe(2);
    expect(summary['threads']).toBe(1);
    expect(summary['UserPhone']).toBe(1);
    // TEXT-typed id columns must be counted too — the $1::int cast made these
    // two comparisons throw and the tables silently vanish from the summary.
    expect(summary['tasks']).toBe(1);
    expect(summary['contact_facts']).toBe(1);
  });

  it('erases the account: own data gone, identity scrubbed, number on the do-not-contact list', async () => {
    const report = await deleteMyAccount('501', false);

    expect(report.dryRun).toBe(false);
    // Everything this account owned.
    for (const sql of [
      'SELECT COUNT(*) AS count FROM conversations WHERE user_id = 501',
      'SELECT COUNT(*) AS count FROM threads WHERE user_id = 501',
      "SELECT COUNT(*) AS count FROM tasks WHERE user_id = '501'",
      'SELECT COUNT(*) AS count FROM user_notes WHERE user_id = 501',
      "SELECT COUNT(*) AS count FROM contact_facts WHERE submitted_by_user_id = '501'",
      'SELECT COUNT(*) AS count FROM task_asks WHERE from_user_id = 501',
      'SELECT COUNT(*) AS count FROM "UserAlias" WHERE "contactId" = 501',
      'SELECT COUNT(*) AS count FROM "UserTags" WHERE "contactId" = 501',
      'SELECT COUNT(*) AS count FROM "UserBlock" WHERE "blockerId" = 501',
      'SELECT COUNT(*) AS count FROM "UserPhone" WHERE "userId" = 501',
    ]) {
      expect({ sql, n: await count(sql) }).toEqual({ sql, n: 0 });
    }

    // The person: every personal column emptied, the row kept so other
    // people's references stay valid, deletedAt set.
    const user = await query<{ name: string | null; employer: string | null; deletedAt: string }>(
      `SELECT name, employer, "deletedAt" FROM "User" WHERE id = 501`,
      [],
      10_000,
    );
    expect(user.rows[0].name).toBeNull();
    expect(user.rows[0].employer).toBeNull();
    expect(user.rows[0].deletedAt).not.toBeNull();

    // The number outlives the account ONLY as a do-not-contact record.
    expect(await isPhoneOptedOut('+995 599 99 28 78')).toBe(true);
    // And the erasure is provable 30 days later.
    expect(await count('SELECT COUNT(*) AS count FROM erasure_log WHERE user_id = 501')).toBe(1);
  });

  it("erases her words from another user's ask but leaves his record standing", async () => {
    const ask = await query<{ answer: string | null; question: string; status: string }>(
      'SELECT answer, question, status FROM task_asks WHERE from_user_id = 777',
      [],
      10_000,
    );

    expect(ask.rows).toHaveLength(1);
    expect(ask.rows[0].answer).toBeNull();
    expect(ask.rows[0].question).toBe('do you know a dentist?');
  });

  it('touches nothing belonging to anyone else', async () => {
    expect(await count('SELECT COUNT(*) AS count FROM conversations WHERE user_id = 777')).toBe(1);
    expect(await count('SELECT COUNT(*) AS count FROM user_notes WHERE user_id = 777')).toBe(1);
    expect(await count('SELECT COUNT(*) AS count FROM "UserAlias" WHERE "contactId" = 777')).toBe(
      1,
    );
    expect(
      await count(`SELECT COUNT(*) AS count FROM "User" WHERE id = 777 AND name = 'Bystander'`),
    ).toBe(1);
  });
});
