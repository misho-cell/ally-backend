import { PoolClient } from 'pg';
import { query, withTransaction } from '../../db/postgres/client';
import { numbersByHash } from '../axelLoad/axelBaseLoad.service';
import { foldedLower } from '../tools/georgianCase';
import {
  BaseFactRow,
  BasePersonRow,
  BaseTieRow,
  factRows,
  numberLeads,
  personRows,
  tieRows,
} from './basePeoplePlan';

/**
 * 6997 — loads the person store one file at a time: people first (people.csv,
 * cela_people.csv), then the stated ties, then the facts. Every write is an
 * upsert by the row's own key, inside one transaction, so a reload doubles
 * nothing and a failed one leaves nothing half-written. A dry run parses and
 * counts and writes nothing.
 *
 * THE NUMBERS NEVER TRAVEL: a person's number is found the way the Axel load
 * finds it — the export token recomputed over the members' phonebooks — or
 * from the member's own account when the key names one.
 */
export enum BasePeoplePart {
  People = 'people',
  Ties = 'ties',
  Facts = 'facts',
}

export interface BasePeopleReport {
  readonly part: BasePeoplePart;
  readonly dry_run: boolean;
  readonly rows_in_file: number;
  readonly people_written: number;
  readonly people_with_number: number;
  readonly rows_written: number;
  readonly skipped: Readonly<Record<string, number>>;
}

const PHONE_QUERY_TIMEOUT_MS = 10_000;
/** Rows per statement: well under Postgres' parameter limits, few round trips. */
const BATCH_ROWS = 1_000;

function batches<T>(rows: readonly T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += BATCH_ROWS) out.push(rows.slice(i, i + BATCH_ROWS));
  return out;
}

async function memberPhones(memberIds: readonly number[]): Promise<Map<number, string>> {
  if (memberIds.length === 0) return new Map();
  const result = await query<{ user_id: number; phone: string }>(
    `SELECT DISTINCT ON (up."userId") up."userId" AS user_id, up.phone
       FROM "UserPhone" up JOIN "User" u ON u.id = up."userId" AND u."deletedAt" IS NULL
      WHERE up."userId" = ANY($1::int[])
      ORDER BY up."userId", up.id
      LIMIT $2`,
    [[...memberIds], memberIds.length],
    PHONE_QUERY_TIMEOUT_MS,
  );
  return new Map(result.rows.map((r) => [r.user_id, r.phone]));
}

/** person key → the number the server found for it; keys with no number are absent. */
export async function phonesForKeys(
  keys: readonly string[],
  personNumbersCsv: string,
): Promise<Map<string, string>> {
  const leads = numberLeads(keys, personNumbersCsv);
  const leadList = [...leads.values()];
  const byToken = leadList.some((l) => l.token !== null)
    ? await numbersByHash()
    : new Map<string, string>();
  const byMember = await memberPhones(
    leadList.map((l) => l.memberId).filter((id): id is number => id !== null),
  );
  const out = new Map<string, string>();
  for (const [key, lead] of leads) {
    const phone =
      (lead.token === null ? undefined : byToken.get(lead.token)) ??
      (lead.memberId === null ? undefined : byMember.get(lead.memberId));
    if (phone !== undefined && phone !== '') out.set(key, phone);
  }
  return out;
}

/** A person already loaded keeps their name; a number found now fills an empty one. */
async function writePeople(
  client: PoolClient,
  rows: readonly BasePersonRow[],
  phones: ReadonlyMap<string, string>,
): Promise<void> {
  for (const b of batches(rows)) {
    await client.query(
      `INSERT INTO base_people (person_key, name, phone)
       SELECT * FROM unnest($1::text[], $2::text[], $3::text[])
       ON CONFLICT (person_key) DO UPDATE
         SET phone = COALESCE(EXCLUDED.phone, base_people.phone), updated_at = NOW()`,
      [
        b.map((r) => r.personKey),
        b.map((r) => r.name),
        b.map((r) => phones.get(r.personKey) ?? null),
      ],
    );
  }
}

/** Only ties whose both ends are loaded; the rest are counted by the caller. */
async function writeTies(client: PoolClient, rows: readonly BaseTieRow[]): Promise<number> {
  let written = 0;
  for (const b of batches(rows)) {
    const result = await client.query(
      `INSERT INTO base_person_ties (from_key, to_key, tie, basis)
       SELECT t.* FROM unnest($1::text[], $2::text[], $3::text[], $4::text[])
              AS t (from_key, to_key, tie, basis)
        WHERE EXISTS (SELECT 1 FROM base_people p WHERE p.person_key = t.from_key)
          AND EXISTS (SELECT 1 FROM base_people p WHERE p.person_key = t.to_key)
       ON CONFLICT (from_key, to_key, tie) DO UPDATE SET basis = EXCLUDED.basis`,
      [b.map((r) => r.fromKey), b.map((r) => r.toKey), b.map((r) => r.tie), b.map((r) => r.basis)],
    );
    written += result.rowCount ?? 0;
  }
  return written;
}

/** Only facts on a loaded person; the rest are counted by the caller. */
async function writeFacts(client: PoolClient, rows: readonly BaseFactRow[]): Promise<number> {
  let written = 0;
  for (const b of batches(rows)) {
    const result = await client.query(
      `INSERT INTO base_person_facts (person_key, key, value, source_url, fact_date)
       SELECT f.* FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::text[])
              AS f (person_key, key, value, source_url, fact_date)
        WHERE EXISTS (SELECT 1 FROM base_people p WHERE p.person_key = f.person_key)
       ON CONFLICT (person_key, key, value) DO UPDATE
         SET source_url = EXCLUDED.source_url, fact_date = EXCLUDED.fact_date`,
      [
        b.map((r) => r.personKey),
        b.map((r) => r.key),
        b.map((r) => r.value),
        b.map((r) => r.sourceUrl),
        b.map((r) => r.factDate),
      ],
    );
    written += result.rowCount ?? 0;
  }
  return written;
}

/** The name and every fact, as one text. */
const PERSON_TEXT = `p.name || ' ' || COALESCE((SELECT string_agg(f.value, ' · ')
  FROM base_person_facts f WHERE f.person_key = p.person_key), '')`;

/** The words a need is matched on, lower case with Georgian capitals folded (georgianCase). */
async function refreshSearchText(client: PoolClient, keys: readonly string[]): Promise<void> {
  for (const b of batches(keys)) {
    await client.query(
      `UPDATE base_people p SET search_text = ${foldedLower(PERSON_TEXT)}
        WHERE p.person_key = ANY($1::text[])`,
      [b],
    );
  }
}

interface PartRows {
  readonly inFile: number;
  readonly people: readonly BasePersonRow[];
  readonly ties: readonly BaseTieRow[];
  readonly facts: readonly BaseFactRow[];
}

function rowsOf(part: BasePeoplePart, csv: string): PartRows {
  switch (part) {
    case BasePeoplePart.People: {
      const people = personRows(csv);
      return { inFile: people.length, people, ties: [], facts: [] };
    }
    case BasePeoplePart.Ties: {
      const { ties, people } = tieRows(csv);
      return { inFile: ties.length, people, ties, facts: [] };
    }
    case BasePeoplePart.Facts: {
      const { facts, people } = factRows(csv);
      return { inFile: facts.length, people, ties: [], facts };
    }
  }
}

async function writePart(
  rows: PartRows,
  phones: ReadonlyMap<string, string>,
): Promise<{ ties: number; facts: number }> {
  return withTransaction(async (client) => {
    await writePeople(client, rows.people, phones);
    const ties = await writeTies(client, rows.ties);
    const facts = await writeFacts(client, rows.facts);
    const touched = new Set([
      ...rows.people.map((p) => p.personKey),
      ...rows.facts.map((f) => f.personKey),
    ]);
    await refreshSearchText(client, [...touched]);
    return { ties, facts };
  });
}

export async function loadBasePeoplePart(
  part: BasePeoplePart,
  csv: string,
  dryRun: boolean,
  personNumbersCsv = '',
): Promise<BasePeopleReport> {
  const rows = rowsOf(part, csv);
  const phones = await phonesForKeys(
    rows.people.map((p) => p.personKey),
    personNumbersCsv,
  );
  const planned = rows.ties.length + rows.facts.length;
  const written = dryRun
    ? { ties: rows.ties.length, facts: rows.facts.length }
    : await writePart(rows, phones);
  const writtenRows = written.ties + written.facts;
  return {
    part,
    dry_run: dryRun,
    rows_in_file: rows.inFile,
    people_written: rows.people.length,
    people_with_number: phones.size,
    rows_written: writtenRows,
    skipped: { end_or_person_not_loaded: planned - writtenRows },
  };
}
