import { csvRecords } from '../axelLoad/axelBasePlan';
import { nameKey } from '../tools/transliterate';

/**
 * #7758 (the founder's word via the tester, 29 Oct; Misho's yes, with his
 * limits): a person's employment history — employer, years, source — and the
 * „former colleagues" ties it implies. Pure: rows in, rows and ties out.
 *
 * The limits, each held here or in the loader:
 *   - only people already in the store (the loader checks the key);
 *   - only public pages: every row carries the page it came from — or, on
 *     Misho's yes of 30 Oct, the founder's own word with its date
 *     („founder, 2026-10-29"), for what no page says;
 *   - ties are for finding a route, never a profile shown to anyone;
 *   - a person's history is removed on request (DELETE route).
 */
const MAX_FIELD_CHARS = 200;
const MIN_YEAR = 1950;
const MAX_YEAR = 2100;
const SOURCE_RE = /^https?:\/\/\S+$/iu;
/** The founder's word as a source: who said it and when („founder, 2026-10-29"). */
const FOUNDER_SOURCE_RE = /^founder,\s*\d{4}-\d{2}-\d{2}$/iu;

/** Pure: a row's source is a public page, or the founder's dated word. */
export function isEmploymentSource(source: string): boolean {
  return SOURCE_RE.test(source) || FOUNDER_SOURCE_RE.test(source);
}
/**
 * An employer with more people than this in the store is too big for „worked
 * there at the same time" to mean they know each other (a bank of thousands).
 */
export const MAX_PEOPLE_PER_EMPLOYER = 40;
export const EMPLOYMENT_BASIS = 'employment overlap';

export interface EmploymentRow {
  /** Empty when the file named the person only; the loader finds the key by a unique name. */
  readonly personKey: string;
  /** The person's name as compared (tester 78937: „an empty key loads by name"). */
  readonly nameKey: string;
  readonly employer: string;
  readonly employerKey: string;
  readonly role: string;
  readonly fromYear: number | null;
  readonly toYear: number | null;
  readonly sourceUrl: string;
}

export interface ColleagueTie {
  readonly fromKey: string;
  readonly toKey: string;
  readonly tie: string;
}

/** Pure: the employer as it is compared. */
export function employerKey(employer: string): string {
  return employer.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
}

function year(raw: string | undefined): number | null | 'bad' {
  const text = (raw ?? '').trim();
  if (text === '') return null;
  const n = Number.parseInt(text, 10);
  return Number.isInteger(n) && n >= MIN_YEAR && n <= MAX_YEAR && String(n) === text ? n : 'bad';
}

/** Pure: the file's rows, and how many were left out and why. */
export function employmentRows(csv: string): {
  rows: EmploymentRow[];
  skipped: Record<string, number>;
} {
  const rows: EmploymentRow[] = [];
  const skipped: Record<string, number> = {};
  const skip = (reason: string): void => {
    skipped[reason] = (skipped[reason] ?? 0) + 1;
  };
  for (const r of csvRecords(csv)) {
    const personKey = (r.person_key ?? '').trim();
    const name = nameKey(r.name ?? '');
    const employer = (r.employer ?? '').replace(/\s+/gu, ' ').trim().slice(0, MAX_FIELD_CHARS);
    const sourceUrl = (r.source_url ?? '').trim();
    const from = year(r.from_year);
    const to = year(r.to_year);
    if ((personKey === '' && name === '') || employerKey(employer) === '')
      skip('no_person_or_employer');
    else if (!isEmploymentSource(sourceUrl)) skip('no_source');
    else if (from === 'bad' || to === 'bad' || (from !== null && to !== null && to < from))
      skip('bad_years');
    else
      rows.push({
        personKey,
        nameKey: name,
        employer,
        employerKey: employerKey(employer),
        role: (r.role ?? '').trim().slice(0, MAX_FIELD_CHARS),
        fromYear: from,
        toYear: to,
        sourceUrl,
      });
  }
  return { rows, skipped };
}

/** The years two stints share, or null; a stint with no start year shares none. */
function overlap(a: EmploymentRow, b: EmploymentRow, thisYear: number): [number, number] | null {
  if (a.fromYear === null || b.fromYear === null) return null;
  const start = Math.max(a.fromYear, b.fromYear);
  const end = Math.min(a.toYear ?? thisYear, b.toYear ?? thisYear);
  return start <= end ? [start, end] : null;
}

/** The employer as most of its stints spell it. */
function shownName(stints: readonly EmploymentRow[]): string {
  const counts = new Map<string, number>();
  for (const s of stints) counts.set(s.employer, (counts.get(s.employer) ?? 0) + 1);
  return [...counts].reduce((best, next) => (next[1] > best[1] ? next : best))[0];
}

function tieText(
  employer: string,
  a: EmploymentRow,
  b: EmploymentRow,
  years: [number, number],
): string {
  const span = years[0] === years[1] ? `${years[0]}` : `${years[0]}–${years[1]}`;
  const still = a.toYear === null && b.toYear === null;
  return still
    ? `colleagues at ${employer}, since ${years[0]}`
    : `former colleagues at ${employer}, ${span}`;
}

/**
 * Pure: one tie per pair of people whose stints at one employer overlap, in
 * both directions as the store keeps them, the longest shared span kept.
 */
export function colleagueTies(rows: readonly EmploymentRow[], thisYear: number): ColleagueTie[] {
  const byEmployer = new Map<string, EmploymentRow[]>();
  for (const row of rows)
    byEmployer.set(row.employerKey, [...(byEmployer.get(row.employerKey) ?? []), row]);
  const ties = new Map<string, ColleagueTie & { span: number }>();
  for (const stints of byEmployer.values()) {
    if (new Set(stints.map((s) => s.personKey)).size > MAX_PEOPLE_PER_EMPLOYER) continue;
    const employer = shownName(stints);
    for (let i = 0; i < stints.length; i += 1) {
      for (let j = i + 1; j < stints.length; j += 1) {
        const [a, b] = [stints[i], stints[j]];
        if (a.personKey === b.personKey) continue;
        const years = overlap(a, b, thisYear);
        if (years === null) continue;
        const [from, to] = [a.personKey, b.personKey].sort();
        const key = `${from}\u0000${to}\u0000${a.employerKey}`;
        const span = years[1] - years[0];
        if ((ties.get(key)?.span ?? -1) >= span) continue;
        ties.set(key, { fromKey: from, toKey: to, tie: tieText(employer, a, b, years), span });
      }
    }
  }
  return [...ties.values()].map(({ fromKey, toKey, tie }) => ({ fromKey, toKey, tie }));
}
