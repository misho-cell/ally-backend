import { query, withTransaction } from '../db/postgres/client';
import { FICTIONAL_RANGES_TEXT, isFictionalNumber } from './fictionalNumbers';
import { ContactRefusal, isReadableTag, NOT_A_TEST_SEAT } from './seatContacts.service';

/**
 * §60 IN BULK — ROW 321 ON A SEAT, WITHOUT WAITING FOR GIORGI.
 *
 * Giorgi's lawyer search timed out on a 1,177-contact phonebook, and the fix
 * can only be proven on a phonebook that size. One contact per call is 1,100
 * calls from the seat's side, so this takes them in one: the same refusals as
 * `addSeatContact`, all asked BEFORE anything is written, and the whole batch
 * written in one transaction or not at all.
 *
 * Nothing here can reach a person: fictional numbers only, test seats only,
 * and a batch is refused whole if any number in it belongs to an account.
 */

const QUERY_TIMEOUT_MS = 8_000;
const MAX_NAME = 80;
/** Every reserved number there is (+1 202 555 0100–0199 and +44 7700 900000–900999). */
export const MAX_BULK_CONTACTS = 1_100;

export interface BulkContactIn {
  readonly phone: string;
  readonly name: string;
  readonly tag: string;
}

export type BulkRefusal = ContactRefusal | 'empty' | 'too_many' | 'duplicate_phone';

export type BulkResult =
  | { ok: true; seat: number; added: number }
  | { ok: false; refusal: BulkRefusal; index?: number; detail?: string };

interface Clean {
  readonly phone: string;
  readonly name: string;
  readonly tag: string;
}

/** The first entry that breaks a rule, or the cleaned batch. */
function validate(contacts: readonly BulkContactIn[]): Clean[] | Exclude<BulkResult, { ok: true }> {
  if (contacts.length === 0) return { ok: false, refusal: 'empty' };
  if (contacts.length > MAX_BULK_CONTACTS) return { ok: false, refusal: 'too_many' };
  const seen = new Set<string>();
  const clean: Clean[] = [];
  for (const [index, contact] of contacts.entries()) {
    const phone = String(contact.phone ?? '');
    const name = String(contact.name ?? '').trim();
    const tag = String(contact.tag ?? '').trim();
    if (!isFictionalNumber(phone)) {
      return { ok: false, refusal: 'not_a_fictional_number', index, detail: FICTIONAL_RANGES_TEXT };
    }
    if (name === '' || name.length > MAX_NAME) return { ok: false, refusal: 'bad_name', index };
    if (!isReadableTag(tag)) return { ok: false, refusal: 'bad_tag', index };
    if (seen.has(phone)) return { ok: false, refusal: 'duplicate_phone', index };
    seen.add(phone);
    clean.push({ phone, name, tag });
  }
  return clean;
}

async function isTestSeat(seatUserId: number): Promise<boolean> {
  const seat = await query<{ user_id: number }>(
    `SELECT user_id FROM test_seats WHERE user_id = $1 LIMIT 1`,
    [seatUserId],
    QUERY_TIMEOUT_MS,
  );
  return seat.rows.length > 0;
}

async function anyRegistered(phones: readonly string[]): Promise<boolean> {
  const registered = await query<{ id: number }>(
    // #1918: another test seat is nobody too (see seatContacts.service).
    `SELECT id FROM "UserPhone" WHERE phone = ANY($1::varchar[]) AND ${NOT_A_TEST_SEAT} LIMIT 1`,
    [phones],
    QUERY_TIMEOUT_MS,
  );
  return registered.rows.length > 0;
}

/** Adds every contact or none; refuses with the index of the first bad entry. */
export async function addSeatContactsBulk(
  seatUserId: number,
  contacts: readonly BulkContactIn[],
): Promise<BulkResult> {
  const clean = validate(contacts);
  if (!Array.isArray(clean)) return clean;
  if (!(await isTestSeat(seatUserId))) return { ok: false, refusal: 'not_a_test_seat' };
  const phones = clean.map((c) => c.phone);
  if (await anyRegistered(phones)) return { ok: false, refusal: 'somebody_is_registered_on_it' };

  const names = clean.map((c) => c.name);
  const tags = clean.map((c) => c.tag);
  await withTransaction(async (client) => {
    // Same no-duplicate rule as the single route: "UserAlias" has no unique
    // index, so the NOT EXISTS is the guard, not an ON CONFLICT.
    await client.query(
      `INSERT INTO "UserAlias" ("contactId", phone, alias)
       SELECT $1::int, x.phone, x.alias
         FROM unnest($2::varchar[], $3::varchar[]) AS x(phone, alias)
        WHERE NOT EXISTS (
          SELECT 1 FROM "UserAlias" ua
           WHERE ua."contactId" = $1::int AND ua.phone = x.phone AND ua.alias = x.alias)`,
      [seatUserId, phones, names],
    );
    await client.query(
      `INSERT INTO "UserTags" ("contactId", phone, tag, "weightCount", source)
       SELECT $1::int, x.phone, x.tag, 1, 'USER_CREATED'
         FROM unnest($2::varchar[], $3::varchar[]) AS x(phone, tag)
       ON CONFLICT DO NOTHING`,
      [seatUserId, phones, tags],
    );
  });
  return { ok: true, seat: seatUserId, added: clean.length };
}

/**
 * §72 — THE UNDO OF §71, IN PART: SEAT CONTACTS REMOVED IN BULK.
 *
 * §71 filled Test 73 with 1,031 contacts for row 321 — and because a new seat
 * may only be made on a fictional number NOBODY has saved, it also used up
 * every free number there was. Row 321 passed and came off the plate; the
 * seats that test everything else were then at their daily cap with no way
 * to make another. This gives numbers back.
 *
 * The same fences as §71: test seats only, reserved fictional numbers only.
 * One statement per table in one transaction, so a half-removed batch cannot
 * exist.
 */
export type BulkRemoveResult =
  | { ok: true; seat: number; removed: number }
  | { ok: false; refusal: BulkRefusal; index?: number; detail?: string };

function validatePhones(
  phones: readonly string[],
): string[] | Exclude<BulkRemoveResult, { ok: true }> {
  if (phones.length === 0) return { ok: false, refusal: 'empty' };
  if (phones.length > MAX_BULK_CONTACTS) return { ok: false, refusal: 'too_many' };
  for (const [index, phone] of phones.entries()) {
    if (!isFictionalNumber(String(phone ?? ''))) {
      return { ok: false, refusal: 'not_a_fictional_number', index, detail: FICTIONAL_RANGES_TEXT };
    }
  }
  return [...new Set(phones.map(String))];
}

/** Removes these numbers from a seat's phonebook; refuses the whole batch on any bad entry. */
export async function removeSeatContactsBulk(
  seatUserId: number,
  phones: readonly string[],
): Promise<BulkRemoveResult> {
  const clean = validatePhones(phones);
  if (!Array.isArray(clean)) return clean;
  if (!(await isTestSeat(seatUserId))) return { ok: false, refusal: 'not_a_test_seat' };
  const removed = await withTransaction(async (client) => {
    await client.query(
      `DELETE FROM "UserTags" WHERE "contactId" = $1 AND phone = ANY($2::varchar[])`,
      [seatUserId, clean],
    );
    const aliases = await client.query(
      `DELETE FROM "UserAlias" WHERE "contactId" = $1 AND phone = ANY($2::varchar[])`,
      [seatUserId, clean],
    );
    return aliases.rowCount ?? 0;
  });
  return { ok: true, seat: seatUserId, removed };
}
