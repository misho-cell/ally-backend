import { query } from '../db/postgres/client';

/**
 * §60 — PUT A MADE-UP, TAGGED CONTACT INTO A TEST SEAT'S PHONEBOOK.
 *
 * Rows 269 and 262(b). D495, the founder: „row 269 uses a made-up outsider on
 * one test seat (not on Netai, number reaches nobody). Not a real phone."
 *
 * ⚠️ WHY THIS EXISTS WHEN `POST /admin/test-accounts` ALREADY TAKES `holds`.
 * That route writes a `UserAlias` — the contact's NAME — and its
 * `resolvePhonebook` already admits a fictional number nobody is registered
 * on, so the OUTSIDER half was solved. Row 262 matches on `UserTags`, the
 * contact's TAG, and nothing in the product writes one for a seat. Without it
 * the feature cannot be exercised at all, which is the tester's whole point:
 * its only trigger is a real registration.
 *
 * ⚠️ AND IT WRITES THE TAG THE MATCHER CAN READ. `newMemberForGoal` accepts a
 * tag of letters, digits and spaces and ignores anything else, so a tag this
 * route would write and that matcher would refuse is a test that fails for a
 * reason nobody would find. The same shape is required here.
 */

/** The same block every seat already lives in: 202-555-0100 … 0199. */
const FICTIONAL_PREFIX = '+1202555';
const FIRST_SLOT = 100;
const LAST_SLOT = 199;
const QUERY_TIMEOUT_MS = 8_000;
const MAX_NAME = 80;
const MAX_TAG = 40;

export type ContactRefusal =
  | 'not_a_fictional_number'
  | 'somebody_is_registered_on_it'
  | 'not_a_test_seat'
  | 'bad_name'
  | 'bad_tag';

export interface SeatContact {
  readonly seat: number;
  readonly phone: string;
  readonly name: string;
  readonly tag: string;
}

export type AddContactResult =
  | { ok: true; contact: SeatContact }
  | { ok: false; refusal: ContactRefusal; detail?: string };

/**
 * ⚠️ THE RANGE CHECK IS THE LINE THAT KEEPS A REAL PERSON OUT, so it is exact
 * rather than a prefix test: „+1202555" alone would admit +12025551234, which
 * is somebody's number somewhere. The slot has to be in 100–199.
 */
export function isFictionalNumber(phone: string): boolean {
  if (!phone.startsWith(FICTIONAL_PREFIX)) return false;
  const slot = phone.slice(FICTIONAL_PREFIX.length);
  if (!/^\d{4}$/.test(slot)) return false;
  const n = Number(slot);
  return n >= FIRST_SLOT && n <= LAST_SLOT;
}

/** Letters, digits and spaces — the shape `newMemberForGoal` will actually read. */
export function isReadableTag(tag: string): boolean {
  const trimmed = tag.trim();
  return trimmed.length >= 1 && trimmed.length <= MAX_TAG && /^[\p{L}\p{N} ]+$/u.test(trimmed);
}

/**
 * ⚠️ EVERYTHING THAT CAN REFUSE IS ASKED BEFORE ANYTHING IS WRITTEN, which is
 * this file's inheritance rather than its caution: a seat route refused
 * `invited_by` correctly AFTER creating the account and left Netai Test 22
 * behind, and a week later the same shape produced Netai Test 42 TWICE. A
 * refusal that has already written something has not refused.
 */
export async function addSeatContact(
  seatUserId: number,
  phone: string,
  name: string,
  tag: string,
): Promise<AddContactResult> {
  const cleanName = (name ?? '').trim();
  const cleanTag = (tag ?? '').trim();

  if (!isFictionalNumber(phone)) {
    return { ok: false, refusal: 'not_a_fictional_number', detail: `${FICTIONAL_PREFIX}0100-0199` };
  }
  if (cleanName === '' || cleanName.length > MAX_NAME) return { ok: false, refusal: 'bad_name' };
  if (!isReadableTag(cleanTag)) return { ok: false, refusal: 'bad_tag' };

  const seat = await query<{ user_id: number }>(
    `SELECT user_id FROM test_seats WHERE user_id = $1 LIMIT 1`,
    [seatUserId],
    QUERY_TIMEOUT_MS,
  );
  if (seat.rows.length === 0) return { ok: false, refusal: 'not_a_test_seat' };

  /**
   * A made-up outsider is by definition NOBODY. A number with an account
   * behind it is somebody, and putting it in a seat's phonebook would be
   * putting a person there — inside the fiction range or not.
   */
  const registered = await query<{ id: number }>(
    `SELECT id FROM "UserPhone" WHERE phone = $1 LIMIT 1`,
    [phone],
    QUERY_TIMEOUT_MS,
  );
  if (registered.rows.length > 0) {
    return { ok: false, refusal: 'somebody_is_registered_on_it' };
  }

  await query(
    `INSERT INTO "UserAlias" ("contactId", phone, alias)
     VALUES ($1, $2, $3)
     ON CONFLICT DO NOTHING`,
    [seatUserId, phone, cleanName],
    QUERY_TIMEOUT_MS,
  );
  await query(
    `INSERT INTO "UserTags" ("userId", phone, tag, "weightCount", source)
     VALUES ($1, $2, $3, 1, 'USER_CREATED')
     ON CONFLICT DO NOTHING`,
    [seatUserId, phone, cleanTag],
    QUERY_TIMEOUT_MS,
  );

  return { ok: true, contact: { seat: seatUserId, phone, name: cleanName, tag: cleanTag } };
}
