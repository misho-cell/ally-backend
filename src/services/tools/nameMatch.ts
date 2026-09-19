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

/**
 * Ticket 20 row 103/104 — does ANY word of this message name somebody in the
 * owner's own phonebook?
 *
 * Different question from `findContactPhonesByName` above, and the difference
 * is the whole point: that one asks „is there a contact matching this NAME",
 * so every word must match. This one asks „does this SENTENCE mention one of
 * my people", so any word may.
 *
 * Used only inside the contact-instruction guard, after the cheap half has
 * already found an un-negated contact verb — which is what keeps this query
 * off the vast majority of messages. On its own it is a poor signal: measured
 * against 56 real goals it caught all six instructions and called 34 ordinary
 * goals instructions too, because owner 501 has a contact saved as
 * „xatuna sologashvili tbilisi" and every „I need a X in Tbilisi" matches it.
 * With the verb and the negation test in front of it, the same 56 gave six of
 * six and nothing wrong.
 *
 * FAILS TOWARDS FALSE. A timeout, an unreadable phonebook, an empty message —
 * all return false, which means the goal is still created. A goal that quietly
 * does not appear is the mirror image of the bug this serves, and the harder
 * one to notice.
 */
export async function messageNamesOwnContact(userId: string, message: string): Promise<boolean> {
  const groups = buildRawWordGroups(message);
  // One-and-two-character terms match half a phonebook; the measurement used
  // the same floor.
  const terms = groups.flat().filter((term) => term.length >= 3);
  if (terms.length === 0) return false;

  const alternatives = terms.map((_, i) => `(LOWER(label) || '') ~ $${i + 2}`).join(' OR ');
  try {
    const found = await query<{ hit: number }>(
      `SELECT 1 AS hit
       FROM (
         SELECT ua.alias AS label FROM "UserAlias" ua WHERE ua."contactId" = $1::int
         UNION ALL
         SELECT ut.tag AS label FROM "UserTags" ut WHERE ut."contactId" = $1::int
       ) labels
       WHERE ${alternatives}
       LIMIT 1`,
      [userId, ...terms.map(toWordStartPattern)],
      NAME_MATCH_TIMEOUT_MS,
    );
    return (found.rowCount ?? 0) > 0;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(
      '[goal-intent] phonebook check failed — treating as not a name:',
      (err as Error).message,
    );
    return false;
  }
}
