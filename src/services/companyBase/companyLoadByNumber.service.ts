import { query, withTransaction } from '../../db/postgres/client';
import { normalizePhone } from '../phone';

/**
 * Misho, 17 Nov: „ამ ადამიანებთან დაკავშირებული კომპანიები … ბაზაში ჩავწეროთ".
 *
 * The package loader places a link by a number token the package carries. A link
 * found by research on one of OUR people already sits on a number we hold, so it
 * is written on that number directly. Every row carries its load's source tag, and
 * the same tag takes the whole load back out (undoLoad).
 */

export enum LinkStatus {
  Confirmed = 'confirmed',
  Possible = 'possible',
}

export interface NumberLink {
  readonly phone: string;
  readonly companyId: string;
  readonly personName: string;
  readonly role: string;
  readonly evidence: string;
  readonly status: LinkStatus;
}

export interface NumberLinkReport {
  readonly dry_run: boolean;
  readonly rows_in_request: number;
  readonly rows_written: number;
  readonly skipped: Readonly<Record<string, number>>;
}

export interface UndoReport {
  readonly dry_run: boolean;
  readonly source: string;
  readonly research_runs: number;
  readonly facts: number;
  readonly links: number;
  readonly public_people: number;
  readonly names: number;
  readonly companies: number;
}

/** A load's tag: lower-case words and digits, so it can never be a real source like "label". */
const SOURCE_RE = /^load-[a-z0-9-]{3,40}$/u;
/** Companies a load creates carry this prefix, so an undo can never delete a package company. */
export const LOADED_COMPANY_PREFIX = 'W-';
export const MAX_LINKS_PER_REQUEST = 5_000;
const MAX_TEXT_CHARS = 500;
const LOAD_QUERY_TIMEOUT_MS = 60_000;
const STATUSES: ReadonlySet<string> = new Set(Object.values(LinkStatus));

export function isLoadSource(value: unknown): value is string {
  return typeof value === 'string' && SOURCE_RE.test(value);
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim().slice(0, MAX_TEXT_CHARS) : '';
}

function bump(skipped: Record<string, number>, reason: string): void {
  skipped[reason] = (skipped[reason] ?? 0) + 1;
}

/** One request row, or the reason it is left out. */
function parseLink(raw: unknown): NumberLink | string {
  if (typeof raw !== 'object' || raw === null) return 'not_an_object';
  const r = raw as Record<string, unknown>;
  const phone = normalizePhone(text(r.phone));
  const companyId = text(r.company_id);
  const status = text(r.status);
  if (phone.length < 8) return 'bad_phone';
  if (companyId === '') return 'no_company_id';
  if (!STATUSES.has(status)) return 'bad_status';
  return {
    phone,
    companyId,
    personName: text(r.person_name),
    role: text(r.role),
    evidence: text(r.evidence),
    status: status as LinkStatus,
  };
}

/** The upsert's own key: the same tie twice in one statement is refused by Postgres. */
function linkKey(link: NumberLink): string {
  return [link.phone, link.companyId, link.evidence, link.role].join('\u0000');
}

export function parseLinks(rows: readonly unknown[]): {
  links: NumberLink[];
  skipped: Record<string, number>;
} {
  const skipped: Record<string, number> = {};
  const links: NumberLink[] = [];
  const seen = new Set<string>();
  for (const raw of rows) {
    const parsed = parseLink(raw);
    if (typeof parsed === 'string') bump(skipped, parsed);
    else if (seen.has(linkKey(parsed))) bump(skipped, 'duplicate');
    else {
      seen.add(linkKey(parsed));
      links.push(parsed);
    }
  }
  return { links, skipped };
}

async function existing(sql: string, values: readonly string[]): Promise<Set<string>> {
  const result = await query<{ v: string }>(sql, [[...new Set(values)]], LOAD_QUERY_TIMEOUT_MS);
  return new Set(result.rows.map((r) => r.v));
}

/** Only a known company, and only a number somebody in Netai holds or owns. */
async function placeable(
  links: readonly NumberLink[],
  skipped: Record<string, number>,
): Promise<NumberLink[]> {
  const companies = await existing(
    'SELECT company_id AS v FROM companies WHERE company_id = ANY($1::text[])',
    links.map((l) => l.companyId),
  );
  const numbers = await existing(
    `SELECT phone AS v FROM "UserPhone" WHERE phone = ANY($1::text[])
     UNION SELECT DISTINCT phone FROM "UserAlias" WHERE phone = ANY($1::text[])`,
    links.map((l) => l.phone),
  );
  return links.filter((l) => {
    if (!companies.has(l.companyId)) bump(skipped, 'company_not_loaded');
    else if (!numbers.has(l.phone)) bump(skipped, 'number_unknown');
    else return true;
    return false;
  });
}

async function writeLinks(links: readonly NumberLink[], source: string): Promise<number> {
  await query(
    `INSERT INTO person_company_links
       (phone, company_id, person_name, role, tie, evidence, status, savers, source)
     SELECT p, c, n, r, 'research', e, s, 0, $7
       FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[])
         AS t(p, c, n, r, e, s)
     ON CONFLICT (phone, company_id, evidence, role) DO UPDATE SET
       person_name = EXCLUDED.person_name, status = EXCLUDED.status, source = EXCLUDED.source`,
    [
      links.map((l) => l.phone),
      links.map((l) => l.companyId),
      links.map((l) => l.personName),
      links.map((l) => l.role),
      links.map((l) => l.evidence),
      links.map((l) => l.status),
      source,
    ],
    LOAD_QUERY_TIMEOUT_MS,
  );
  return links.length;
}

export async function linkByNumber(
  rows: readonly unknown[],
  source: string,
  dryRun: boolean,
): Promise<NumberLinkReport> {
  const { links, skipped } = parseLinks(rows);
  const kept = await placeable(links, skipped);
  return {
    dry_run: dryRun,
    rows_in_request: rows.length,
    rows_written: dryRun ? kept.length : await writeLinks(kept, source),
    skipped,
  };
}

/**
 * What one load tag wrote, table by table. Names carry the tag as their kind;
 * research facts carry it in research_load (researchFactsByNumber.service), and
 * so does a deep-research run's record (deepResearch.service).
 */
const LOAD_PARTS = {
  research_runs: 'FROM deep_research_runs WHERE research_load = $1',
  facts: `FROM contact_facts WHERE research_load = $1 AND source = 'public_research'`,
  links: 'FROM person_company_links WHERE source = $1',
  public_people: 'FROM company_public_people WHERE source = $1',
  names: 'FROM company_names WHERE kind = $1',
  companies: `FROM companies WHERE confidence = $1 AND company_id LIKE '${LOADED_COMPANY_PREFIX}%'`,
} as const;
type LoadPart = keyof typeof LOAD_PARTS;
const PART_ORDER: readonly LoadPart[] = [
  'research_runs',
  'facts',
  'links',
  'public_people',
  'names',
  'companies',
];

/**
 * Takes one load back out, in one transaction: its research facts, links,
 * public people and names, then the companies it created. A package company is never deleted —
 * an updated package row is restored by loading its saved copy again.
 */
export async function undoLoad(source: string, dryRun: boolean): Promise<UndoReport> {
  const counts = await withTransaction(async (client) => {
    const out: Record<LoadPart, number> = {
      research_runs: 0,
      facts: 0,
      links: 0,
      public_people: 0,
      names: 0,
      companies: 0,
    };
    for (const part of PART_ORDER) {
      const sql = dryRun
        ? `SELECT COUNT(*)::int AS n ${LOAD_PARTS[part]}`
        : `WITH gone AS (DELETE ${LOAD_PARTS[part]} RETURNING 1) SELECT COUNT(*)::int AS n FROM gone`;
      const result = await client.query<{ n: number }>(sql, [source]);
      out[part] = result.rows[0]?.n ?? 0;
    }
    return out;
  });
  return { dry_run: dryRun, source, ...counts };
}
