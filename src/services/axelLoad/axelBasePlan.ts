import { csvCells } from '../listFile';

/**
 * 4225 — the Axel base load (the founder's 46072 with 47191; Misho's yes,
 * 9 Oct, §119). Pure: the package's two files become the rows to write.
 *
 * Only the ties the package itself calls loadable go in: `roster`,
 * `roster — likely` and `strong`. A `weak` tie is a candidate, never a fact
 * about the number (README: „Not for loading").
 */
export const LOADABLE_TIES: ReadonlySet<string> = new Set(['roster', 'roster — likely', 'strong']);

export enum ResearchStatus {
  Confirmed = 'confirmed',
  Possible = 'possible',
  Rough = 'rough',
  Unknown = 'unknown',
}

const STATUSES: ReadonlySet<string> = new Set(Object.values(ResearchStatus));

/** contact_facts.value is short text; the package's longest is 500. */
export const MAX_VALUE_CHARS = 500;
const MAX_SOURCE_CHARS = 1_000;
const DATE_RE = /\d{4}-\d{2}-\d{2}/u;
const KEY_RE = /^[a-z_]{2,40}$/u;
const HASH_RE = /^[0-9a-f]{24}$/u;
/** Far above the package's 4,805 facts; a bound, so a wrong file cannot run unbounded. */
const MAX_CSV_ROWS = 50_000;

export interface ResearchFact {
  readonly key: string;
  readonly value: string;
  readonly status: ResearchStatus;
  readonly sourceUrl: string;
  readonly factDate: string | null;
}

export interface BasePlan {
  /** number hash → the facts to write on that number. */
  readonly byHash: ReadonlyMap<string, readonly ResearchFact[]>;
  readonly skipped: Readonly<Record<string, number>>;
}

type Row = Readonly<Record<string, string>>;

/** A CSV file as rows keyed by its header; a leading byte-order mark is not a column name. */
export function csvRecords(raw: string): Row[] {
  const [header, ...rows] = csvCells(raw.replace(/^\uFEFF/u, ''), MAX_CSV_ROWS);
  if (header === undefined) return [];
  const names = header.map((h) => h.trim());
  return rows
    .filter((cells) => cells.some((c) => c.trim() !== ''))
    .map((cells) => Object.fromEntries(names.map((n, i) => [n, (cells[i] ?? '').trim()])));
}

function factOf(row: Row): ResearchFact | null {
  const key = row.key ?? '';
  const value = (row.value ?? '').slice(0, MAX_VALUE_CHARS);
  const status = row.status ?? '';
  if (!KEY_RE.test(key) || value === '' || !STATUSES.has(status)) return null;
  return {
    key,
    value,
    status: status as ResearchStatus,
    sourceUrl: (row.source ?? '').slice(0, MAX_SOURCE_CHARS),
    factDate: DATE_RE.exec(row.date ?? '')?.[0] ?? null,
  };
}

function bump(counts: Record<string, number>, reason: string): void {
  counts[reason] = (counts[reason] ?? 0) + 1;
}

/** person → loadable number hashes. */
function hashesByPerson(
  numbers: readonly Row[],
  skipped: Record<string, number>,
): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const row of numbers) {
    const hash = (row.number_hash ?? '').toLowerCase();
    if (!LOADABLE_TIES.has(row.tie ?? '')) bump(skipped, 'tie_not_loadable');
    else if (!HASH_RE.test(hash)) bump(skipped, 'bad_hash');
    else out.set(row.person_key, [...(out.get(row.person_key) ?? []), hash]);
  }
  return out;
}

/** The rows to write, grouped by number; everything left out is counted by reason. */
export function basePlan(personNumbersCsv: string, factsCsv: string): BasePlan {
  const skipped: Record<string, number> = {};
  const hashes = hashesByPerson(csvRecords(personNumbersCsv), skipped);
  const byHash = new Map<string, ResearchFact[]>();
  for (const row of csvRecords(factsCsv)) {
    const targets = hashes.get(row.person_key ?? '');
    if (targets === undefined) {
      bump(skipped, 'fact_without_loadable_number');
      continue;
    }
    const fact = factOf(row);
    if (fact === null) {
      bump(skipped, 'bad_fact_row');
      continue;
    }
    for (const hash of targets) byHash.set(hash, [...(byHash.get(hash) ?? []), fact]);
  }
  return { byHash, skipped };
}
