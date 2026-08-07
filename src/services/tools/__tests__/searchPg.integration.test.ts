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
  DROP TABLE IF EXISTS "UserAlias", "UserTags", "UserPhone", "User", "UserBlock",
    "ContactDeceased", contact_facts, contact_relationship_scores, contact_exclusions CASCADE;
  CREATE TABLE "UserAlias" (id serial primary key, phone text, "contactId" int, alias text);
  CREATE TABLE "UserTags"  (id serial primary key, phone text, "contactId" int, tag text, "weightCount" int default 1);
  CREATE TABLE "UserPhone" (id serial primary key, phone text, "userId" int);
  CREATE TABLE "User"      (id serial primary key, name text, employer text, "jobPosition" text, city text, "deletedAt" timestamptz);
  CREATE TABLE "UserBlock" (id serial primary key, "blockerId" int, "blockedPhone" text, "blockedName" text, created_at timestamptz default now());
  CREATE TABLE contact_facts (
    id serial primary key, neo4j_contact_id text, submitted_by_user_id integer,
    field_type text, value text, canonical_value text, is_public boolean default false,
    moderated_at timestamp, retracted_at timestamp,
    created_at timestamp default now(), updated_at timestamp default now());
  CREATE TABLE contact_relationship_scores (
    user_id int not null, contact_phone text not null, relationship_type text not null,
    strength_score float not null, signals jsonb not null default '{}',
    computed_at timestamp not null default now(),
    primary key (user_id, contact_phone));
  CREATE TABLE "ContactDeceased" (
    id serial primary key, "userId" int not null, phone text not null,
    "createdAt" timestamp not null default now());
  CREATE TABLE contact_exclusions (
    id serial primary key, user_id integer not null, contact_phone text not null,
    excluded_for text not null, reason text not null, revisit_if text,
    created_at timestamp not null default now(),
    unique (user_id, contact_phone, excluded_for));
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
    ('+995599000002', 501, 'გიორგი შენგელია'),
    ('+995599000777', 501, 'Avto Kasradze'),
    ('+995599000778', 501, 'Gita Beridze');
  INSERT INTO "User" (id, name, "jobPosition") VALUES (900, 'Avto Kasradze', 'Chairman, GITA');
  INSERT INTO "UserPhone" (phone, "userId") VALUES ('+995599000777', 900);
  INSERT INTO "UserTags" (phone, "contactId", tag) VALUES
    ('+995599000001', 777, 'babukhadia'),
    ('+995592922551', 501, 'dachi'),
    ('+995592922551', 501, 'axel'),
    ('+995597777897', 501, 'radiatori');
  INSERT INTO contact_relationship_scores (user_id, contact_phone, relationship_type, strength_score) VALUES
    (501, '+995599000001', 'professional', 0.72);
`;

interface SearchResult {
  found?: boolean;
  error?: string;
  results?: Array<{
    name: string | null;
    relationship?: string;
    relationship_strength?: number;
  }>;
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

  it('ranks a structured jobPosition match above raw name-token matches (GITA case)', async () => {
    // "gita" matches Gita Beridze by NAME and Avto Kasradze by his registered
    // jobPosition "Chairman, GITA" — the structured hit must come first.
    const r = (await searchContactByName('501', 'gita')) as SearchResult;
    expect(r.error).toBeUndefined();
    const resultNames = names(r);
    expect(resultNames).toContain('Avto Kasradze');
    expect(resultNames).toContain('Gita Beridze');
    expect(resultNames[0]).toBe('Avto Kasradze');
  });

  it('attaches the enrichment relationship score to a direct result', async () => {
    const r = (await searchContactByName('501', 'babukhadia')) as SearchResult;
    expect(r.error).toBeUndefined();
    const hit = (r.results ?? []).find((x) => x.name === 'Ilia Babuxadia');
    expect(hit?.relationship).toBe('professional');
    expect(hit?.relationship_strength).toBe(0.72);
  });

  it("does not leak another user's contacts (scoping)", async () => {
    const r = (await searchContactByName('999', 'babukhadia')) as SearchResult;
    expect(r.error).toBeUndefined();
    expect(r.found).toBe(false);
  });

  // The 6 Aug outage, as a permanent repro: the LIVE prod table predates the
  // migration runner and carries submitted_by_user_id as TEXT (migrations say
  // INTEGER) — an explicit ::int cast in the facts branch raised `operator
  // does not exist: text = integer` on every prod tag/name search, on both
  // the app and the connector. Keep this LAST — it mutates the schema.
  it('facts branch survives the prod column-type drift (submitted_by_user_id TEXT)', async () => {
    await query(
      `ALTER TABLE contact_facts
       ALTER COLUMN submitted_by_user_id TYPE text USING submitted_by_user_id::text`,
      [],
      30_000,
    );
    const byTag = (await searchByTag('501', 'gita')) as SearchResult;
    expect(byTag.error).toBeUndefined();
    expect(byTag.found).toBe(true);
    const byName = (await searchContactByName('501', 'gita')) as SearchResult;
    expect(byName.error).toBeUndefined();
    expect(names(byName)[0]).toBe('Avto Kasradze');
  });
});
