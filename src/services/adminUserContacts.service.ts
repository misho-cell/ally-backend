import { query } from '../db/postgres/client';
import { searchByTag } from './tools/searchByTag';
import { searchContactByName } from './tools/searchContactByName';

/**
 * #8285 (founder 28 Oct 15:58: „crucial — otherwise we operate only with my
 * contacts"; Misho's yes in the code chat, 28 Oct ~16:00Z): the desk searches
 * ONE user's own phonebook to help that same user — by name, by tag, by a
 * company — and reads what that user's own search would show them, with every
 * number taken out. Read only; nothing is sent and nothing is written.
 *
 * Both searches are the user's own tools (search_contact_by_name,
 * search_by_tag), run as that user, so the desk sees exactly the user's view:
 * their exclusions, their labels, their facts — never a third person's.
 */
const QUERY_TIMEOUT_MS = 5_000;
export const MAX_QUERY_CHARS = 80;
export const MAX_COMPANIES = 20;
export const MAX_ROWS_PER_SEARCH = 50;
/** Keys that carry a number in the search rows, at any depth. */
const NUMBER_KEY_RE = /phone|digits|number/iu;
/** A value that is a number written out, whatever key holds it. */
const NUMBER_VALUE_RE = /^\+?\d[\d\s().-]{6,}$/u;
/** A number inside other text (a source id can carry one): seven digits or more. */
const NUMBER_INSIDE_RE = /\+?\d[\d\s().-]{5,}\d/gu;
const NUMBER_MASK = '…';
const MIN_NUMBER_DIGITS = 7;
/** A date is not a number to hide, and must not join the number beside it. */
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/u;

export enum UserContactsOutcome {
  Found = 'found',
  NoSuchUser = 'no_such_user',
  BadInput = 'bad_input',
}

export interface UserContactsSearch {
  readonly query: string;
  readonly count: number;
  readonly results: readonly Record<string, unknown>[];
}

export type UserContactsResult =
  | {
      readonly outcome: UserContactsOutcome.Found;
      readonly searches: readonly UserContactsSearch[];
    }
  | { readonly outcome: UserContactsOutcome.NoSuchUser }
  | { readonly outcome: UserContactsOutcome.BadInput };

/** The same value with every number taken out, at any depth. */
export function withoutNumbers(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value
      .filter((v) => !(typeof v === 'string' && NUMBER_VALUE_RE.test(v)))
      .map(withoutNumbers);
  }
  if (value !== null && typeof value === 'object') {
    const kept: Record<string, unknown> = {};
    for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
      if (NUMBER_KEY_RE.test(key)) continue;
      if (typeof inner === 'string' && NUMBER_VALUE_RE.test(inner)) continue;
      kept[key] = withoutNumbers(inner);
    }
    return kept;
  }
  return typeof value === 'string' ? withNumbersMasked(value) : value;
}

/** Masks each number in the text, dates kept as they are. */
function withNumbersMasked(text: string): string {
  return text
    .split(/(\d{4}-\d{2}-\d{2})/u)
    .map((part) => (ISO_DATE_RE.test(part) ? part : part.replace(NUMBER_INSIDE_RE, maskLongDigits)))
    .join('');
}

function maskLongDigits(match: string): string {
  return match.replace(/\D/gu, '').length >= MIN_NUMBER_DIGITS ? NUMBER_MASK : match;
}

async function userExists(userId: number): Promise<boolean> {
  const result = await query<{ found: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM "User" WHERE id = $1 AND "deletedAt" IS NULL) AS found`,
    [userId],
    QUERY_TIMEOUT_MS,
  );
  return result.rows[0]?.found === true;
}

function rowsOf(payload: object): Record<string, unknown>[] {
  const results = (payload as { results?: unknown }).results;
  return Array.isArray(results) ? (results as Record<string, unknown>[]) : [];
}

/** Name and tag search together, one row per person (the name search's row first). */
export async function searchOneQuery(userId: string, text: string): Promise<UserContactsSearch> {
  const [byName, byTag] = await Promise.all([
    searchContactByName(userId, text),
    searchByTag(userId, text),
  ]);
  const seen = new Set<string>();
  const merged: Record<string, unknown>[] = [];
  for (const row of [...rowsOf(byName), ...rowsOf(byTag)]) {
    const key = typeof row.phone === 'string' ? row.phone : JSON.stringify(row);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(row);
  }
  const results = merged
    .slice(0, MAX_ROWS_PER_SEARCH)
    .map((row) => withoutNumbers(row) as Record<string, unknown>);
  return { query: text, count: results.length, results };
}

function cleanQueries(raw: readonly string[]): string[] | null {
  const queries = [...new Set(raw.map((q) => q.trim()).filter((q) => q !== ''))];
  if (queries.length === 0 || queries.length > MAX_COMPANIES) return null;
  return queries.some((q) => q.length > MAX_QUERY_CHARS) ? null : queries;
}

/** One search, or one per company in a list; each row stripped of numbers. */
export async function searchUserContacts(
  userId: number,
  raw: readonly string[],
): Promise<UserContactsResult> {
  const queries = cleanQueries(raw);
  if (queries === null) return { outcome: UserContactsOutcome.BadInput };
  if (!(await userExists(userId))) return { outcome: UserContactsOutcome.NoSuchUser };
  const searches: UserContactsSearch[] = [];
  for (const text of queries) searches.push(await searchOneQuery(String(userId), text));
  return { outcome: UserContactsOutcome.Found, searches };
}
