// Integration test against a REAL Postgres — the only place SQL-shape bugs
// surface: unreferenced bind parameters ("could not determine data type of
// parameter $4"), planner regressions, malformed CTEs. Both prod-only search
// outages slipped past the mocked unit tests; this suite locks the class.
//
// Skipped unless PG_INTEGRATION=1 (needs POSTGRES_HOST/PORT/NAME/DB pointing at
// a scratch database — the suite DROPS and recreates the search tables).
// Local run:
//   PG_INTEGRATION=1 POSTGRES_HOST=... POSTGRES_PORT=5433 POSTGRES_NAME=postgres \
//     POSTGRES_DB=postgres npx jest searchPg.integration

import pool, { query } from '../../../db/postgres/client';
import { searchContactByName } from '../searchContactByName';
import { searchByTag } from '../searchByTag';

const maybeDescribe = process.env.PG_INTEGRATION === '1' ? describe : describe.skip;

const SCHEMA_SQL = `
  CREATE EXTENSION IF NOT EXISTS pg_trgm;
  DROP TABLE IF EXISTS "UserAlias", "UserTags", "UserPhone", "User", "UserBlock", contact_facts CASCADE;
  CREATE TABLE "UserAlias" (id serial primary key, phone text, "contactId" int, alias text);
  CREATE TABLE "UserTags"  (id serial primary key, phone text, "contactId" int, tag text, "weightCount" int default 1);
  CREATE TABLE "UserPhone" (id serial primary key, phone text, "userId" int);
  CREATE TABLE "User"      (id serial primary key, name text, employer text, "jobPosition" text, city text, "deletedAt" timestamptz);
  CREATE TABLE "UserBlock" (id serial primary key, "blockerId" int, "blockedPhone" text, "blockedName" text, created_at timestamptz default now());
  CREATE TABLE contact_facts (
    id serial primary key, neo4j_contact_id text, submitted_by_user_id text,
    field_type text, value text, canonical_value text, is_public boolean default false,
    created_at timestamp default now(), updated_at timestamp default now());
  CREATE INDEX idx_user_alias_trgm ON "UserAlias" USING GIN (LOWER(alias) gin_trgm_ops);
  CREATE OR REPLACE FUNCTION normalize_search_token(input text)
  RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $fn$
    SELECT replace(replace(replace(replace(replace(replace(
      translate(lower(coalesce(input, '')),
        'აბგდევზთიკლმნოპჟრსტუფქღყშჩცძწჭხჯჰ',
        'abgdevztiklmnopjrstufkgkscczcckjh'),
      'gh', 'g'), 'kh', 'k'), 'zh', 'j'), 'ts', 'c'), 'x', 'k'), 'q', 'k');
  $fn$;
  CREATE INDEX idx_user_tags_norm_trgm ON "UserTags" USING GIN (normalize_search_token(tag) gin_trgm_ops);
  CREATE INDEX idx_user_alias_norm_trgm ON "UserAlias" USING GIN (normalize_search_token(alias) gin_trgm_ops);
`;

// The three production repros: alias-only contact with a spelling variant,
// tag+alias two-word intersection, and a short numeric token.
const SEED_SQL = `
  INSERT INTO "UserAlias" (phone, "contactId", alias) VALUES
    ('+995599000001', 501, 'Ilia Babuxadia'),
    ('+995597777897', 501, 'Radiatori 2'),
    ('+995592922551', 501, 'Davit Tsitskishvili. Axel'),
    ('+995599000002', 501, 'გიორგი შენგელია');
  INSERT INTO "UserTags" (phone, "contactId", tag) VALUES
    ('+995599000001', 777, 'babukhadia'),
    ('+995592922551', 501, 'dachi'),
    ('+995592922551', 501, 'axel'),
    ('+995597777897', 501, 'radiatori');
`;

interface SearchResult {
  found?: boolean;
  error?: string;
  results?: Array<{ name: string | null }>;
}

function names(r: SearchResult): Array<string | null> {
  return (r.results ?? []).map((x) => x.name);
}

maybeDescribe('search against real Postgres (prod repro cases)', () => {
  beforeAll(async () => {
    await query(SCHEMA_SQL, [], 30_000);
    await query(SEED_SQL, [], 30_000);
  });

  afterAll(async () => {
    await pool.end();
  });

  it('name search finds an alias-only contact through a spelling variant (babukhadia→Babuxadia)', async () => {
    const r = (await searchContactByName('501', 'babukhadia')) as SearchResult;
    expect(r.error).toBeUndefined();
    expect(names(r)).toContain('Ilia Babuxadia');
  });

  it('name search ranks the two-word intersection (Dachi Axel)', async () => {
    const r = (await searchContactByName('501', 'Dachi Axel')) as SearchResult;
    expect(r.error).toBeUndefined();
    expect(names(r)[0]).toBe('Davit Tsitskishvili. Axel');
  });

  it('name search survives a sub-trigram token (Radiatori 2)', async () => {
    const r = (await searchContactByName('501', 'Radiatori 2')) as SearchResult;
    expect(r.error).toBeUndefined();
    expect(names(r)).toContain('Radiatori 2');
  });

  it('tag search matches aggregated tags and aliases without SQL errors', async () => {
    for (const q of ['radiatori', 'dachi axel', 'babukhadia']) {
      const r = (await searchByTag('501', q)) as SearchResult;
      expect(r.error).toBeUndefined();
      expect(r.found).toBe(true);
    }
  });

  it('name search finds a Georgian-script alias by a Georgian query (შენგელია)', async () => {
    const r = (await searchContactByName('501', 'შენგელია')) as SearchResult;
    expect(r.error).toBeUndefined();
    expect(names(r)).toContain('გიორგი შენგელია');
  });

  it("does not leak another user's contacts (scoping)", async () => {
    const r = (await searchContactByName('999', 'babukhadia')) as SearchResult;
    expect(r.error).toBeUndefined();
    expect(r.found).toBe(false);
  });
});
