import { query, withTransaction } from '../db/postgres/client';
import { FICTIONAL_RANGES_TEXT, isFictionalNumber } from './fictionalNumbers';
import { ContactRefusal, isReadableTag } from './seatContacts.service';

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
    `SELECT id FROM "UserPhone" WHERE phone = ANY($1::varchar[]) LIMIT 1`,
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
