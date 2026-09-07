/**
 * Is a role value talking about now, or about then?
 *
 * Ticket 10 Task 17. The 5 September import wrote „Partner, Audit Quality,
 * Nexia TA" as a CURRENT role for a man whose own record already said he left
 * Nexia in 2024, and „Head of Product Delivery / COO, De.Fi" for a 2020–2024
 * job. The assistant then listed both as current in an investor search. A
 * past role read as current is the same class of error as the sweep's (Ticket
 * 9 Task 18), arriving through the import instead.
 *
 * Two independent tells, either of which makes a role a past role:
 *   1. the value itself carries a date range that has ended;
 *   2. the person already carries a past_role at the same employer.
 *
 * This module is pure. It reads no database and writes no fact — the import
 * feeds it what the file says and what the record already holds.
 */

/** „(2019–2024)", „2020 - 2024", „(2023)"; „present" / „now" / „current" keep a range open. */
const YEAR_RANGE = /(\d{4})\s*(?:[–—-]|to)\s*(\d{4}|present|now|current|today)/i;
const LONE_YEAR = /\((\d{4})\)/;
const OPEN_ENDED = /\b(present|now|current|today)\b/i;

/** A name shorter than this, letters and digits only, identifies no company. */
const MIN_EMPLOYER_NAME_LEN = 3;
/** Single letters are noise; „De.Fi" is two two-letter tokens and a real company. */
const MIN_EMPLOYER_TOKEN_LEN = 2;

/**
 * Has the period this value describes already closed?
 *
 * A range ending before this year has. A lone bracketed year before this year
 * has — „Mentor, Techstars (2023)" is a past role in 2026. Anything open-ended
 * or undated is treated as current; the employer check is the second line.
 */
export function endedBeforeNow(value: string, now: Date = new Date()): boolean {
  const year = now.getFullYear();
  if (OPEN_ENDED.test(value)) return false;
  const range = YEAR_RANGE.exec(value);
  if (range?.[2] !== undefined) return Number(range[2]) < year;
  const lone = LONE_YEAR.exec(value);
  if (lone?.[1] !== undefined) return Number(lone[1]) < year;
  return false;
}

/**
 * The employer named in one role value, or null.
 *
 * Two shapes appear in the files: „Co-Founder & CEO @ KLIPY, San Francisco Bay
 * Area (2022–present)" and „Partner, Audit Quality, Nexia TA". The first names
 * the company after „@", up to a comma or a bracket. The second puts it last,
 * after the final comma. A value with neither shape names no employer we can
 * read, and the caller must not guess one.
 */
export function employerNamedIn(value: string): string | null {
  const at = value.indexOf('@');
  if (at !== -1) {
    const after = value.slice(at + 1).trim();
    const employer = after.split(/[,(]/)[0]?.trim() ?? '';
    return employer === '' ? null : employer;
  }
  const withoutDates = value.replace(/\(.*?\)/g, '').trim();
  const parts = withoutDates
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length < 2) return null;
  return parts[parts.length - 1] ?? null;
}

/**
 * Every employer a past_role value names. The older files join several jobs
 * with semicolons: „CEO @ FU Capital (2024–2026); COO @ De.Fi (2020–2024)".
 */
export function employersInPastRoles(pastRoles: readonly string[]): string[] {
  const out: string[] = [];
  for (const pastRole of pastRoles) {
    for (const segment of pastRole.split(';')) {
      const employer = employerNamedIn(segment.trim());
      if (employer) out.push(employer);
    }
  }
  return out;
}

function employerTokens(name: string): string[] {
  return name
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length >= MIN_EMPLOYER_TOKEN_LEN);
}

/**
 * Do two employer names point at the same company?
 *
 * „Nexia TA" against „NEXIA TA Georgia": the shorter name's tokens all appear
 * in the longer. Case and punctuation are ignored, so „De.Fi" and „de.fi" are
 * one company. A name of fewer than three letters and digits — „AI" — names
 * nothing and matches nothing, whatever it is compared with.
 */
export function sameEmployer(a: string, b: string): boolean {
  const ta = employerTokens(a);
  const tb = employerTokens(b);
  if (ta.length === 0 || tb.length === 0) return false;
  const [shorter, longer] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  if (shorter.join('').length < MIN_EMPLOYER_NAME_LEN) return false;
  return shorter.every((t) => longer.includes(t));
}

export interface RoleTenseVerdict {
  /** Values that still read as current. */
  current: string[];
  /** Values moved to past_role, each with the reason. */
  demoted: { value: string; reason: 'ended_range' | 'past_role_at_same_employer' }[];
}

/**
 * Sort a file's role values into current and past.
 *
 * `knownPastRoles` is everything the record already holds under past_role plus
 * the file's own past_role lines — a role is demoted when either says the
 * person already left that employer.
 */
export function sortRolesByTense(
  roles: readonly string[],
  knownPastRoles: readonly string[],
  now: Date = new Date(),
): RoleTenseVerdict {
  const pastEmployers = employersInPastRoles(knownPastRoles);
  const verdict: RoleTenseVerdict = { current: [], demoted: [] };
  for (const role of roles) {
    if (endedBeforeNow(role, now)) {
      verdict.demoted.push({ value: role, reason: 'ended_range' });
      continue;
    }
    const employer = employerNamedIn(role);
    const left = employer !== null && pastEmployers.some((past) => sameEmployer(past, employer));
    if (left) {
      verdict.demoted.push({ value: role, reason: 'past_role_at_same_employer' });
      continue;
    }
    verdict.current.push(role);
  }
  return verdict;
}
