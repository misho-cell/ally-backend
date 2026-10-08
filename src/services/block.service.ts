import { query } from '../db/postgres/client';
import { normalizePhone, phoneDigits } from './phone';
import { boundaryExclusionsFor } from './askBoundary.service';

/**
 * „Pass the phone id from a search result." — the same words the other tools
 * that write against a contact use, because it is the same mistake.
 */
export const NO_CONTACT_IN_THE_CALL = 'Pass the phone id from a search result.';

/**
 * A BLOCK KEYED ON NOTHING BLOCKS NOBODY, AND SAYS IT WORKED.
 *
 * `normalizePhone` answers `''` for anything with no digits in it — an absent
 * argument, a name, „the one above". The insert then stores a row under `''`
 * that every read compares against real phones and never matches, and the
 * caller used to be told nothing at all (`Promise<void>` -> `{ ok: true }`).
 * A person asks for somebody to be blocked, is told they were, and they were
 * not. So the answer now carries what happened.
 */
export async function blockContact(
  userId: string,
  phone: string,
): Promise<{ blocked: boolean; error?: string }> {
  const canonical = normalizePhone(phone);
  if (!canonical) return { blocked: false, error: NO_CONTACT_IN_THE_CALL };
  await query(
    `INSERT INTO "UserBlock" ("blockerId", "blockedPhone", "createdAt", "updatedAt")
     VALUES ($1, $2, NOW(), NOW())
     ON CONFLICT ("blockerId", "blockedPhone") DO NOTHING`,
    [userId, canonical],
  );
  return { blocked: true };
}

export async function unblockContact(
  userId: string,
  phone: string,
): Promise<{ unblocked: boolean; error?: string }> {
  const canonical = normalizePhone(phone);
  if (!canonical) return { unblocked: false, error: NO_CONTACT_IN_THE_CALL };
  // Delete both the canonical row and any legacy raw-format row.
  await query(`DELETE FROM "UserBlock" WHERE "blockerId" = $1 AND "blockedPhone" IN ($2, $3)`, [
    userId,
    canonical,
    phone,
  ]);
  return { unblocked: true };
}

export interface BlockedContact {
  phone: string;
  name: string | null;
}

/**
 * Contacts THIS user has blocked (one-directional — does not include users who
 * blocked them). Resolves a display name: the user's own alias for the contact,
 * falling back to the registered user's name.
 */
export async function getBlockedByUser(userId: string): Promise<BlockedContact[]> {
  const result = await query<{ phone: string; name: string | null }>(
    `SELECT ub."blockedPhone"          AS phone,
            COALESCE(ua.alias, u.name) AS name
     FROM "UserBlock" ub
     LEFT JOIN "UserAlias" ua ON ua.phone = ub."blockedPhone" AND ua."contactId" = ub."blockerId"
     LEFT JOIN "UserPhone" up ON up.phone = ub."blockedPhone"
     LEFT JOIN "User"       u ON u.id     = up."userId"
     WHERE ub."blockerId" = $1`,
    [userId],
  );
  return result.rows.map((r) => ({ phone: r.phone, name: r.name ?? null }));
}

/**
 * Board #505 (Ninia): there was no list of blocked people in the app and no way
 * to unblock, only the assistant's tools. This is the list the screen draws.
 * Each row is referred to by the block row's own id, so no phone number ever
 * reaches the client; the name is the owner's own label or, failing that, the
 * registered name, as getBlockedByUser resolves it.
 */
export interface BlockedRowForScreen {
  readonly ref: number;
  readonly name: string | null;
  readonly blocked_at: string;
}

/** A person blocks a handful of people, not thousands. A ceiling, not an expectation. */
const MAX_BLOCKED_ROWS_SHOWN = 500;
const BLOCK_QUERY_TIMEOUT_MS = 5_000;

export async function blockedListForScreen(userId: string): Promise<BlockedRowForScreen[]> {
  // One row per block, newest first; a contact saved under two labels must not
  // appear twice, so DISTINCT ON keeps one name per block row.
  const result = await query<{ ref: number; name: string | null; blocked_at: Date | string }>(
    `SELECT DISTINCT ON (ub.id)
            ub.id AS ref,
            COALESCE(ua.alias, u.name) AS name,
            ub."createdAt" AS blocked_at
       FROM "UserBlock" ub
       LEFT JOIN "UserAlias" ua ON ua.phone = ub."blockedPhone" AND ua."contactId" = ub."blockerId"
       LEFT JOIN "UserPhone" up ON up.phone = ub."blockedPhone"
       LEFT JOIN "User" u ON u.id = up."userId"
      WHERE ub."blockerId" = $1::int
      ORDER BY ub.id DESC
      LIMIT $2`,
    [userId, MAX_BLOCKED_ROWS_SHOWN],
    BLOCK_QUERY_TIMEOUT_MS,
  );
  return result.rows.map((row) => ({
    ref: Number(row.ref),
    name: row.name ?? null,
    blocked_at: new Date(row.blocked_at).toISOString(),
  }));
}

/** Unblocks one row of THIS owner's list; another owner's row is never touched. */
export async function unblockByRef(userId: string, ref: number): Promise<boolean> {
  const result = await query(
    `DELETE FROM "UserBlock" WHERE id = $1 AND "blockerId" = $2::int`,
    [ref, userId],
    BLOCK_QUERY_TIMEOUT_MS,
  );
  return (result.rowCount ?? 0) > 0;
}

/**
 * Returns every phone that must be hidden from this user's search results:
 * phones the user has blocked + all phones of users who have blocked the user.
 */
export async function getBlockedPhones(userId: string): Promise<string[]> {
  const result = await query<{ phone: string }>(
    `SELECT "blockedPhone" AS phone
     FROM "UserBlock"
     WHERE "blockerId" = $1

     UNION

     SELECT up2.phone
     FROM "UserPhone"  up_me
     JOIN "UserBlock"  ub   ON ub."blockedPhone" = up_me.phone
     JOIN "UserPhone"  up2  ON up2."userId"      = ub."blockerId"
     WHERE up_me."userId" = $1`,
    [userId],
  );
  return result.rows.map((r) => r.phone);
}

/**
 * Every phone that must be hidden from this user's search results:
 * blocked phones (both directions), contacts the user marked as deceased, the
 * user's OWN phone numbers — a real prospect asked for a bridge into a company
 * and was recommended HERSELF (her own number saved in her phonebook); the
 * user must never appear in their own results, on any tool — and, when the
 * caller says what it is searching FOR, the people who have asked their own
 * assistant not to be involved in that subject.
 *
 * ROW 247 — WHY THE BOUNDARY BELONGS HERE AND NOWHERE ELSE.
 *
 * The founder's rule is that such a person is „not in the plan … because the
 * search system finds that she has asked her assistant not to bother her with
 * it" — absent, not named and refused later. So it has to act on the SEARCH,
 * and this function already IS the search's answer to „who must not appear":
 * seven tools call it and none of them has its own idea about exclusion.
 *
 * That is also the defence against this project's most frequent fault. Adding
 * the rule to each search in turn is precisely the shape — the rule on one
 * wire and the other one still running — that produced rows 103/104, 251 and
 * 252 in the last three days. One UNION branch cannot be half-applied.
 *
 * `aboutQuery` IS OPTIONAL AND ITS ABSENCE MEANS SOMETHING. Several callers of
 * this function are not searching for a subject at all — a warm path to one
 * named person, a country's channels — and for them there is nothing a
 * boundary could be about. Absent leaves the behaviour exactly as it was, so
 * this change cannot alter a caller that was not looked at.
 */
export async function getExcludedPhones(userId: string, aboutQuery?: string): Promise<string[]> {
  const [own, boundaries] = await Promise.all([
    excludedForUser(userId),
    aboutQuery === undefined || aboutQuery.trim() === ''
      ? Promise.resolve<string[]>([])
      : boundaryExclusionsFor(aboutQuery),
  ]);
  return [...new Set([...own, ...boundaries])];
}

/** 3268: one phone's exclusion read, before a question goes. */
const EXCLUSION_CHECK_TIMEOUT_MS = 4_000;

async function excludedForUser(userId: string): Promise<string[]> {
  const result = await query<{ phone: string }>(
    `SELECT "blockedPhone" AS phone
     FROM "UserBlock"
     WHERE "blockerId" = $1

     UNION

     SELECT up2.phone
     FROM "UserPhone"  up_me
     JOIN "UserBlock"  ub   ON ub."blockedPhone" = up_me.phone
     JOIN "UserPhone"  up2  ON up2."userId"      = ub."blockerId"
     WHERE up_me."userId" = $1

     UNION

     SELECT phone
     FROM "ContactDeceased"
     WHERE "userId" = $1

     UNION

     SELECT phone
     FROM "UserPhone"
     WHERE "userId" = $1`,
    [userId],
  );
  return result.rows.map((r) => r.phone);
}

/**
 * Excluded phones as a normalized Set, for format-independent comparison.
 * Callers normalize each candidate phone with normalizePhone() before checking
 * membership — so "+995…", "995…" and a bare local number all match.
 */
export async function getExcludedPhoneSet(
  userId: string,
  aboutQuery?: string,
): Promise<Set<string>> {
  const phones = await getExcludedPhones(userId, aboutQuery);
  return new Set(phones.map((p) => normalizePhone(p)));
}

/**
 * 3268 (MASTER TEST RUN ME-005, 2 of 2): a contact the owner marked deceased
 * was still asked on the server's own order-to-ask path. One read for one
 * phone: has this owner marked it deceased, or blocked it. Compared by digits,
 * so every saved form of the number matches.
 */
export async function isDeceasedOrBlockedFor(userId: string, phone: string): Promise<boolean> {
  const digits = phoneDigits(phone);
  if (digits === '') return false;
  const result = await query<{ hit: number }>(
    `SELECT 1 AS hit FROM "ContactDeceased"
      WHERE "userId" = $1 AND regexp_replace(phone, '\\D', '', 'g') = $2
     UNION ALL
     SELECT 1 FROM "UserBlock"
      WHERE "blockerId" = $1 AND regexp_replace("blockedPhone", '\\D', '', 'g') = $2
     LIMIT 1`,
    [userId, digits],
    EXCLUSION_CHECK_TIMEOUT_MS,
  );
  return result.rows.length > 0;
}
