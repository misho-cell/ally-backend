// Message pagination against the PRODUCTION schema shape: conversations.id is
// a UUID (migration 002) and created_at is a bare TIMESTAMP. The first cut of
// the cursor compared id against a numeric placeholder — valid on every serial
// test schema, a parse error on prod, so a bare ?limit=30 broke every chat
// (12 Aug). This suite locks the class: paging must run on the UUID schema.
//
// Skipped unless PG_INTEGRATION=1. Local run:
//   PG_INTEGRATION=1 POSTGRES_HOST=localhost POSTGRES_PORT=5433 \
//     POSTGRES_NAME=postgres POSTGRES_DB=postgres npx jest threadMessages.integration

import pool, { query } from '../../db/postgres/client';
import { getThreadMessages } from '../threads.service';

const maybeDescribe = process.env.PG_INTEGRATION === '1' ? describe : describe.skip;

const SCHEMA_SQL = `
  DROP TABLE IF EXISTS conversations CASCADE;
  CREATE TABLE conversations (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    TEXT,
    thread_id  INT,
    role       VARCHAR(10) NOT NULL DEFAULT 'assistant',
    content    TEXT NOT NULL,
    content_json JSONB,
    kind       TEXT NOT NULL DEFAULT 'message',
    run_id     TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    choices    JSONB
  );
  CREATE INDEX idx_conv_pg_test ON conversations (thread_id, created_at DESC);
`;

// 45 visible messages; two of them share ONE timestamp so the tie-break is
// actually exercised; step/event rows salted in to prove the filter.
const SEED_SQL = `
  INSERT INTO conversations (thread_id, role, content, kind, created_at)
  SELECT 7, 'assistant', 'msg ' || g, 'message', TIMESTAMP '2026-08-01' + (g || ' minutes')::interval
  FROM generate_series(1, 45) g;
  INSERT INTO conversations (thread_id, role, content, kind, created_at) VALUES
    (7, 'assistant', 'tied A', 'message', TIMESTAMP '2026-08-01' + INTERVAL '20 minutes'),
    (7, 'assistant', 'step noise', 'step', TIMESTAMP '2026-08-01' + INTERVAL '30 minutes'),
    (7, 'user', '[მოვლენა] engine turn', 'event', TIMESTAMP '2026-08-01' + INTERVAL '31 minutes');
`;

maybeDescribe('thread message pagination (prod UUID schema)', () => {
  beforeAll(async () => {
    await query(SCHEMA_SQL, [], 30_000);
    await query(SEED_SQL, [], 30_000);
  });

  afterAll(async () => {
    await pool.end();
  });

  it('a bare limit returns the NEWEST page, oldest-first, steps and events filtered', async () => {
    const page = await getThreadMessages(7, { limit: 10 });

    expect(page).toHaveLength(10);
    expect(page[9].content).toBe('msg 45');
    expect(page[0].content).toBe('msg 36');
    expect(page.every((m) => m.kind === 'message')).toBe(true);
    expect(typeof page[0].id).toBe('string');
  });

  it('walks the whole history backwards with no skips and no duplicates, ties included', async () => {
    const seen: string[] = [];
    let cursor: { beforeCreatedAt: string; beforeId: string } | undefined;
    for (let hop = 0; hop < 20; hop++) {
      const page = await getThreadMessages(7, { limit: 7, ...cursor });
      if (page.length === 0) break;
      seen.push(...page.map((m) => m.content));
      const oldest = page[0];
      cursor = { beforeCreatedAt: oldest.created_at, beforeId: oldest.id };
      if (page.length < 7) break;
    }

    // 45 numbered + the tied row — every visible message exactly once.
    expect(seen).toHaveLength(46);
    expect(new Set(seen).size).toBe(46);
    expect(seen).toContain('tied A');
    expect(seen).toContain('msg 1');
  });

  it('without options returns the entire history, as before pagination existed', async () => {
    const all = await getThreadMessages(7);

    expect(all).toHaveLength(46);
    expect(all[0].content).toBe('msg 1');
  });
});
