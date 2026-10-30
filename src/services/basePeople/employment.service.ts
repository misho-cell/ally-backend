import { query, withTransaction } from '../../db/postgres/client';
import { nameKey } from '../tools/transliterate';
import { colleagueTies, EMPLOYMENT_BASIS, EmploymentRow, employmentRows } from './employmentPlan';

/**
 * #7758 (Misho's yes, 29 Oct, with his limits): loads a person's employment
 * history into the store and rebuilds the „former colleagues" ties from it.
 * Only people already in the store; every row with its public source; ties are
 * for routes only; a person's history is removed on request. A dry run
 * parses, checks and counts, and writes nothing.
 */
const QUERY_TIMEOUT_MS = 30_000;
const BATCH_ROWS = 1_000;
/** The store's whole history fits well under this; it is a ceiling, not a page. */
const MAX_HISTORY_ROWS = 50_000;
/** The person store's size, with room: a ceiling, not a page. */
const MAX_STORE_PEOPLE = 200_000;

export interface EmploymentReport {
  readonly dry_run: boolean;
  readonly rows_in_file: number;
  readonly rows_written: number;
  readonly colleague_ties: number;
  readonly skipped: Readonly<Record<string, number>>;
}

async function keysInStore(keys: readonly string[]): Promise<Set<string>> {
  const result = await query<{ person_key: string }>(
    'SELECT person_key FROM base_people WHERE person_key = ANY($1::text[])',
    [[...new Set(keys)]],
    QUERY_TIMEOUT_MS,
  );
  return new Set(result.rows.map((r) => r.person_key));
}

/** The store's own names, for the rows the file named by name only. */
async function storeNames(): Promise<{ person_key: string; name: string }[]> {
  const result = await query<{ person_key: string; name: string }>(
    'SELECT person_key, name FROM base_people WHERE name IS NOT NULL LIMIT $1',
    [MAX_STORE_PEOPLE],
    QUERY_TIMEOUT_MS,
  );
  return result.rows;
}

/** Pure: a keyless row gets the key of the one person in the store who carries its name. */
export function withKeysByName(
  rows: readonly EmploymentRow[],
  people: readonly { person_key: string; name: string }[],
): EmploymentRow[] {
  const byName = new Map<string, string[]>();
  for (const p of people) {
    const key = nameKey(p.name);
    byName.set(key, [...(byName.get(key) ?? []), p.person_key]);
  }
  return rows.map((r) => {
    if (r.personKey !== '') return r;
    const keys = byName.get(r.nameKey) ?? [];
    return keys.length === 1 ? { ...r, personKey: keys[0] } : r;
  });
}

async function writeRows(rows: readonly EmploymentRow[]): Promise<void> {
  for (let i = 0; i < rows.length; i += BATCH_ROWS) {
    const b = rows.slice(i, i + BATCH_ROWS);
    await query(
      `INSERT INTO base_person_employment
         (person_key, employer, employer_key, role, from_year, to_year, source_url)
       SELECT * FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::int[],
                            $6::int[], $7::text[])
       ON CONFLICT (person_key, employer_key, COALESCE(from_year, 0)) DO UPDATE SET
         employer = EXCLUDED.employer, role = EXCLUDED.role, to_year = EXCLUDED.to_year,
         source_url = EXCLUDED.source_url`,
      [
        b.map((r) => r.personKey),
        b.map((r) => r.employer),
        b.map((r) => r.employerKey),
        b.map((r) => r.role),
        b.map((r) => r.fromYear),
        b.map((r) => r.toYear),
        b.map((r) => r.sourceUrl),
      ],
      QUERY_TIMEOUT_MS,
    );
  }
}

async function wholeHistory(): Promise<EmploymentRow[]> {
  const result = await query<{
    person_key: string;
    employer: string;
    employer_key: string;
    role: string;
    from_year: number | null;
    to_year: number | null;
    source_url: string;
  }>(
    `SELECT person_key, employer, employer_key, role, from_year, to_year, source_url
       FROM base_person_employment ORDER BY person_key LIMIT $1`,
    [MAX_HISTORY_ROWS],
    QUERY_TIMEOUT_MS,
  );
  return result.rows.map((r) => ({
    personKey: r.person_key,
    nameKey: '',
    employer: r.employer,
    employerKey: r.employer_key,
    role: r.role,
    fromYear: r.from_year,
    toYear: r.to_year,
    sourceUrl: r.source_url,
  }));
}

/** Replaces every tie the history implied with the ones it implies now; returns their count. */
export async function rebuildColleagueTies(thisYear: number): Promise<number> {
  const ties = colleagueTies(await wholeHistory(), thisYear);
  await withTransaction(async (client) => {
    await client.query('DELETE FROM base_person_ties WHERE basis = $1', [EMPLOYMENT_BASIS]);
    for (let i = 0; i < ties.length; i += BATCH_ROWS) {
      const b = ties.slice(i, i + BATCH_ROWS);
      await client.query(
        `INSERT INTO base_person_ties (from_key, to_key, tie, basis)
         SELECT f, t, x, $4 FROM unnest($1::text[], $2::text[], $3::text[]) AS v(f, t, x)
         ON CONFLICT (from_key, to_key, tie) DO NOTHING`,
        [b.map((t) => t.fromKey), b.map((t) => t.toKey), b.map((t) => t.tie), EMPLOYMENT_BASIS],
      );
    }
  });
  return ties.length;
}

export async function loadEmployment(
  csv: string,
  dryRun: boolean,
  thisYear: number,
): Promise<EmploymentReport> {
  const parsed = employmentRows(csv);
  const skipped = parsed.skipped;
  const rows = parsed.rows.some((r) => r.personKey === '')
    ? withKeysByName(parsed.rows, await storeNames())
    : parsed.rows;
  const known = await keysInStore(rows.map((r) => r.personKey));
  const inStore = rows.filter((r) => known.has(r.personKey));
  const counts = { ...skipped };
  if (inStore.length < rows.length) counts.person_not_in_store = rows.length - inStore.length;
  const total = rows.length + Object.values(skipped).reduce((a, n) => a + n, 0);
  if (dryRun) {
    const ties = colleagueTies([...(await wholeHistory()), ...inStore], thisYear).length;
    return {
      dry_run: true,
      rows_in_file: total,
      rows_written: 0,
      colleague_ties: ties,
      skipped: counts,
    };
  }
  await writeRows(inStore);
  return {
    dry_run: false,
    rows_in_file: total,
    rows_written: inStore.length,
    colleague_ties: await rebuildColleagueTies(thisYear),
    skipped: counts,
  };
}

/** Removes one person's history and the ties it implied; false when there was none. */
export async function removeEmployment(personKey: string, thisYear: number): Promise<boolean> {
  const result = await query(
    'DELETE FROM base_person_employment WHERE person_key = $1',
    [personKey],
    QUERY_TIMEOUT_MS,
  );
  if ((result.rowCount ?? 0) === 0) return false;
  await rebuildColleagueTies(thisYear);
  return true;
}
