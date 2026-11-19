import { query } from '../../db/postgres/client';
import { PUBLIC_RESEARCH, SYSTEM_SAVER_ID } from '../axelLoad/axelBaseLoad.service';
import { normalizePhone } from '../phone';

/**
 * Misho, 18 Nov: „LinkedIn-ის სია ვნახე, ბაზაში ჩაწერე".
 *
 * What research found about one of OUR people — the headline, schooling, past
 * roles, the profile's own link — is written on the number their facts already
 * sit on, as the Axel load writes its facts: one system saver, private, source
 * „public_research", each row with the page it was read on. Every row carries
 * its load's tag, so the same tag takes the whole load back out (undoLoad), and
 * a later Axel reload, which replaces a number's untagged research rows, leaves
 * it alone.
 */

export enum ResearchStatus {
  Confirmed = 'confirmed',
  Possible = 'possible',
}

export interface NumberFact {
  readonly phone: string;
  readonly key: string;
  readonly value: string;
  readonly sourceUrl: string;
  readonly status: ResearchStatus;
}

export interface NumberFactReport {
  readonly dry_run: boolean;
  readonly rows_in_request: number;
  readonly rows_written: number;
  readonly skipped: Readonly<Record<string, number>>;
}

/**
 * Work, study and public professional activity only: never family, health,
 * politics, an address or a contact. The last five are the deep-research
 * brief's (19 Nov): projects, awards, publications, talks and interviews, and
 * the person's own professional site.
 */
export const RESEARCH_FACT_KEYS: ReadonlySet<string> = new Set([
  'linkedin',
  'headline',
  'occupation',
  'employer',
  'past_roles',
  'education',
  'expertise',
  'certification',
  'language',
  'project',
  'award',
  'publication',
  'public_activity',
  'website',
]);
export const MAX_FACTS_PER_REQUEST = 5_000;
const MAX_VALUE_CHARS = 300;
const MAX_URL_CHARS = 500;
const MIN_PHONE_CHARS = 8;
const URL_RE = /^https?:\/\/\S+$/u;
const LOAD_QUERY_TIMEOUT_MS = 60_000;
const STATUSES: ReadonlySet<string> = new Set(Object.values(ResearchStatus));

function text(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function bump(skipped: Record<string, number>, reason: string): void {
  skipped[reason] = (skipped[reason] ?? 0) + 1;
}

/** One request row, or the reason it is left out. */
function parseFact(raw: unknown): NumberFact | string {
  if (typeof raw !== 'object' || raw === null) return 'not_an_object';
  const r = raw as Record<string, unknown>;
  const phone = normalizePhone(text(r.phone, MAX_URL_CHARS));
  const key = text(r.key, MAX_VALUE_CHARS);
  const value = text(r.value, MAX_VALUE_CHARS);
  const sourceUrl = text(r.source_url, MAX_URL_CHARS);
  const status = text(r.status, MAX_VALUE_CHARS);
  if (phone.length < MIN_PHONE_CHARS) return 'bad_phone';
  if (!RESEARCH_FACT_KEYS.has(key)) return 'key_not_allowed';
  if (value === '') return 'no_value';
  if (!URL_RE.test(sourceUrl)) return 'no_source_url';
  if (!STATUSES.has(status)) return 'bad_status';
  return { phone, key, value, sourceUrl, status: status as ResearchStatus };
}

export function parseFacts(rows: readonly unknown[]): {
  facts: NumberFact[];
  skipped: Record<string, number>;
} {
  const skipped: Record<string, number> = {};
  const facts: NumberFact[] = [];
  const seen = new Set<string>();
  for (const raw of rows) {
    const parsed = parseFact(raw);
    if (typeof parsed === 'string') {
      bump(skipped, parsed);
      continue;
    }
    const key = [parsed.phone, parsed.key, parsed.value].join('\u0000');
    if (seen.has(key)) bump(skipped, 'duplicate');
    else {
      seen.add(key);
      facts.push(parsed);
    }
  }
  return { facts, skipped };
}

/** Only a number somebody in Netai holds or has saved. */
async function heldNumbers(facts: readonly NumberFact[]): Promise<Set<string>> {
  const result = await query<{ v: string }>(
    `SELECT phone AS v FROM "UserPhone" WHERE phone = ANY($1::text[])
     UNION SELECT DISTINCT phone FROM "UserAlias" WHERE phone = ANY($1::text[])`,
    [[...new Set(facts.map((f) => f.phone))]],
    LOAD_QUERY_TIMEOUT_MS,
  );
  return new Set(result.rows.map((r) => r.v));
}

/**
 * One statement. A key held once per saver (employer, occupation) that the
 * number already carries keeps its value: ON CONFLICT DO NOTHING. The same row
 * loaded twice is not doubled: NOT EXISTS on number, key, value and saver.
 */
async function writeFacts(facts: readonly NumberFact[], load: string): Promise<number> {
  const result = await query(
    `INSERT INTO contact_facts
       (neo4j_contact_id, submitted_by_user_id, field_type, value, is_public, source,
        confidence, is_matchable, source_url, research_status, research_load)
     SELECT p, $6, k, v, false, $7, 'mentioned', false, u, s, $8
       FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::text[]) AS t(p, k, v, u, s)
      WHERE NOT EXISTS (
              SELECT 1 FROM contact_facts f
               WHERE f.neo4j_contact_id = t.p AND f.submitted_by_user_id = $6
                 AND f.field_type = t.k AND f.value = t.v AND f.source = $7)
     ON CONFLICT DO NOTHING`,
    [
      facts.map((f) => f.phone),
      facts.map((f) => f.key),
      facts.map((f) => f.value),
      facts.map((f) => f.sourceUrl),
      facts.map((f) => f.status),
      SYSTEM_SAVER_ID,
      PUBLIC_RESEARCH,
      load,
    ],
    LOAD_QUERY_TIMEOUT_MS,
  );
  return result.rowCount ?? 0;
}

export async function factsByNumber(
  rows: readonly unknown[],
  load: string,
  dryRun: boolean,
): Promise<NumberFactReport> {
  const { facts, skipped } = parseFacts(rows);
  const held = facts.length === 0 ? new Set<string>() : await heldNumbers(facts);
  const kept = facts.filter((f) => {
    if (held.has(f.phone)) return true;
    bump(skipped, 'number_unknown');
    return false;
  });
  const written = dryRun || kept.length === 0 ? kept.length : await writeFacts(kept, load);
  if (!dryRun && written < kept.length) skipped.already_there = kept.length - written;
  return { dry_run: dryRun, rows_in_request: rows.length, rows_written: written, skipped };
}
