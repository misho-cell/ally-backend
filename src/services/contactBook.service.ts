import { query } from '../db/postgres/client';
import { encodeContactRef } from './mcp/contactRef';
import { fetchAccountStates, isMemberPhone } from './tools/membership';

/**
 * The frontend's 06:30Z item 4 (design 4.8, „ჩემი კონტაქტები"): the person's
 * own phonebook, searchable by name, a page at a time.
 *
 * What a row shows is the narrowest of the shapes put to Tornike (box 50854,
 * option ა): the name the person saved and whether that contact is on Netai.
 * No number leaves the server (D149) — a row's id is the same sealed,
 * per-user reference the connector uses. A wider shape, if Tornike picks one,
 * is a field added here.
 */
const QUERY_TIMEOUT_MS = 8_000;
export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 100;
/** The longest search text read; a longer one is cut, never refused. */
const MAX_QUERY_CHARS = 60;
const HAS_A_LETTER = /\p{L}/u;

export interface ContactRow {
  readonly id: string;
  readonly name: string | null;
  readonly on_netai: boolean;
}

export interface ContactPage {
  readonly contacts: readonly ContactRow[];
  readonly next_cursor: string | null;
}

export interface ContactPageRequest {
  readonly q: string | null;
  readonly limit: number;
  readonly cursor: string | null;
}

/** A cursor is the next row's position, sealed only by being opaque base64. */
export function encodeCursor(offset: number): string {
  return Buffer.from(String(offset), 'utf8').toString('base64url');
}

export function decodeCursor(cursor: string | null): number | null {
  if (cursor === null || cursor === '') return 0;
  const decoded = Buffer.from(cursor, 'base64url').toString('utf8');
  return /^\d{1,9}$/.test(decoded) ? Number(decoded) : null;
}

/** „50%_off" is searched as those characters, not as a pattern. */
export function likePattern(q: string | null): string | null {
  const trimmed = (q ?? '').trim().slice(0, MAX_QUERY_CHARS);
  if (trimmed === '') return null;
  return `%${trimmed.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

async function phonebookRows(
  userId: number,
  pattern: string | null,
  offset: number,
  limit: number,
): Promise<Array<{ phone: string; alias: string | null }>> {
  const result = await query<{ phone: string; alias: string | null }>(
    `WITH mine AS (
       SELECT DISTINCT ON (regexp_replace(ua.phone, '\\D', '', 'g')) ua.phone, ua.alias
         FROM "UserAlias" ua
        WHERE ua."contactId" = $1 AND ua.phone IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM "ContactDeceased" d
                           WHERE d."userId" = $1
                             AND regexp_replace(d.phone, '\\D', '', 'g')
                               = regexp_replace(ua.phone, '\\D', '', 'g'))
        ORDER BY regexp_replace(ua.phone, '\\D', '', 'g'), LENGTH(COALESCE(ua.alias, '')) DESC
     )
     SELECT phone, alias FROM mine
      WHERE $2::text IS NULL OR alias ILIKE $2
      ORDER BY LOWER(COALESCE(alias, '')), phone
      OFFSET $3 LIMIT $4`,
    [userId, pattern, offset, limit],
    QUERY_TIMEOUT_MS,
  );
  return result.rows;
}

function shownName(alias: string | null): string | null {
  const trimmed = (alias ?? '').trim();
  return HAS_A_LETTER.test(trimmed) ? trimmed : null;
}

/** One page of the person's contacts; null when the cursor is not one this route made. */
export async function contactPage(
  userId: number,
  request: ContactPageRequest,
): Promise<ContactPage | null> {
  const offset = decodeCursor(request.cursor);
  if (offset === null) return null;
  // One row more than asked says whether there is a next page.
  const rows = await phonebookRows(userId, likePattern(request.q), offset, request.limit + 1);
  const page = rows.slice(0, request.limit);
  const accounts = await fetchAccountStates(page.map((r) => r.phone));
  return {
    contacts: page.map((r) => ({
      id: encodeContactRef(String(userId), r.phone),
      name: shownName(r.alias),
      on_netai: isMemberPhone(accounts, r.phone),
    })),
    next_cursor: rows.length > request.limit ? encodeCursor(offset + request.limit) : null,
  };
}
