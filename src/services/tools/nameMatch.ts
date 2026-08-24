import { query } from '../../db/postgres/client';
import { buildRawWordGroups, toWordStartPattern } from './transliterate';

const NAME_MATCH_TIMEOUT_MS = 8_000;
// Callers only need to distinguish "none" / "exactly one" / "several" — never
// a list — so a small cap is enough and keeps the query cheap.
const DEFAULT_MATCH_LIMIT = 5;

/**
 * Find phones in ONE user's own phonebook (UserAlias + UserTags) whose saved
 * label matches every word of a name query — transliteration and drift folds
 * included, so a name said in Georgian resolves a contact saved in Latin
 * script (same matching standard as search_contacts). Returns raw digit
 * strings; the caller decides what "0 / 1 / many" means for its own use —
 * this function makes no ambiguity judgment itself.
 */
export async function findContactPhonesByName(
  userId: string,
  nameQuery: string,
  limit: number = DEFAULT_MATCH_LIMIT,
): Promise<string[]> {
  const groups = buildRawWordGroups(nameQuery);
  if (groups.length === 0) return [];

  let cursor = 2; // $1 = userId
  const conds = groups
    .map((group) => {
      const alternatives = group
        .map((_, i) => `(LOWER(label) || '') ~ $${cursor + i}`)
        .join(' OR ');
      cursor += group.length;
      return `(${alternatives})`;
    })
    .join(' AND ');
  const patterns = groups.flat().map(toWordStartPattern);

  const matches = await query<{ digits: string }>(
    `SELECT DISTINCT regexp_replace(phone, '\\D', '', 'g') AS digits
     FROM (
       SELECT ua.phone, ua.alias AS label FROM "UserAlias" ua WHERE ua."contactId" = $1::int
       UNION ALL
       SELECT ut.phone, ut.tag AS label FROM "UserTags" ut WHERE ut."contactId" = $1::int
     ) labels
     WHERE ${conds}
     LIMIT ${limit}`,
    [userId, ...patterns],
    NAME_MATCH_TIMEOUT_MS,
  );
  return matches.rows.map((r) => r.digits);
}
