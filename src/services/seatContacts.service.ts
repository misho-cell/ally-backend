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

  /**
   * ⚠️ `ON CONFLICT DO NOTHING` DOES NOTHING HERE, and that is not a figure of
   * speech: `"UserAlias"` carries no unique index but its primary key, so
   * there is no conflict to detect and every re-run of this route would have
   * added the same person to the same phonebook again. The clause READ like a
   * guard, which is the only reason it survived review.
   *
   * `"UserTags"` genuinely has one — `("contactId", tag, phone, source)` —
   * which is also the plainest evidence of which column owns a row.
   */
  await query(
    /**
     * ⚠️ THE CASTS ARE LOAD-BEARING. Without them the server refused the whole
     * statement with „inconsistent types deduced for parameter $2": a bare
     * `SELECT $1, $2, $3` gives the planner nothing to type the parameters
     * from, while the comparison below types them from the columns, and the
     * two deductions disagree. It typechecked, and it threw on every call —
     * the same shape as the column that did not exist, one day later.
     */
    `INSERT INTO "UserAlias" ("contactId", phone, alias)
     SELECT $1::int, $2::varchar, $3::varchar
      WHERE NOT EXISTS (
        SELECT 1 FROM "UserAlias"
         WHERE "contactId" = $1::int AND phone = $2::varchar AND alias = $3::varchar
      )`,
    [seatUserId, phone, cleanName],
    QUERY_TIMEOUT_MS,
  );
  /**
   * ⚠️ THE OWNER COLUMN IS `"contactId"`, IN BOTH TABLES, AND THIS WROTE
   * `"userId"` — which is where an account id for the TAGGED NUMBER goes.
   *
   * Two rows of nonsense came out of it: they said the seat's account owns a
   * made-up number that by this function's own refusal above has no account at
   * all, and they were invisible to every ordinary read, all of which look in
   * `"contactId"` — search-by-tag, the profile, the erasure sweep.
   *
   * Worse than invisible: they were the only rows row 262's matcher could see,
   * because it was reading the same wrong column. Two mistakes that cancelled
   * each other out on the one path I was testing, and on no other path at all.
   */
  await query(
    `INSERT INTO "UserTags" ("contactId", phone, tag, "weightCount", source)
     VALUES ($1, $2, $3, 1, 'USER_CREATED')
     ON CONFLICT DO NOTHING`,
    [seatUserId, phone, cleanTag],
    QUERY_TIMEOUT_MS,
  );

  return { ok: true, contact: { seat: seatUserId, phone, name: cleanName, tag: cleanTag } };
}

/**
 * §61 — TAKING BACK WHAT §60 AND ROW 262 PUT IN A TEST SEAT WRONGLY.
 *
 * Two kinds of wreckage, both mine, both from this morning:
 *
 *   * `"UserTags"` rows written through `"userId"` instead of `"contactId"`.
 *     They say the seat's account OWNS a made-up number, which this file's own
 *     refusal above says nobody owns, and they are invisible to every ordinary
 *     read because all of those look in `"contactId"`.
 *
 *   * `new_member_for_goal` cards queued by a matcher that was reading the
 *     same wrong column and, separately, treating an INDUSTRY as an
 *     organisation. They are cards D498 says should never have been made.
 *
 * ⚠️ WHAT MAKES THIS SAFE IS NOT THE CARE OF THE CALLER — it is that the route
 * cannot reach anybody real:
 *
 *   * THE TARGET MUST BE A TEST SEAT. No `test_seats` row, nothing happens.
 *   * ONLY `"contactId" IS NULL` TAG ROWS GO. A correctly written row is never
 *     matched by this, so running it twice is not a way to empty a phonebook.
 *   * ONLY `held` CARDS GO, and `held` means never shown to anybody. A card a
 *     person has actually seen, answered or is waiting on is out of reach.
 *   * IT DELETES; IT QUEUES NOTHING. Whatever should exist afterwards is made
 *     by the matcher, not by this.
 *
 * `plan` is the default. Nothing is deleted until the caller says so, and the
 * plan names the exact ids so a person can read them before agreeing.
 */
export interface SeatRepair {
  readonly seat: number;
  readonly tag_rows: readonly number[];
  readonly held_cards: readonly number[];
  readonly deleted: boolean;
}

const MISPLACED_TAG_ROWS = `SELECT id FROM "UserTags"
   WHERE "userId" = $1 AND "contactId" IS NULL
   ORDER BY id LIMIT $2`;

const HELD_MATCH_CARDS = `SELECT id FROM pending_updates
   WHERE user_id = $1::text AND kind = 'new_member_for_goal' AND status = 'held'
   ORDER BY id LIMIT $2`;

/** A seat has a handful of either. A ceiling, so a mistake cannot become a sweep. */
const MOST_ROWS_PER_REPAIR = 50;

export async function repairSeat(
  seatUserId: number,
  confirm: boolean,
): Promise<{ ok: true; repair: SeatRepair } | { ok: false; refusal: string }> {
  const seat = await query<{ user_id: number }>(
    `SELECT user_id FROM test_seats WHERE user_id = $1 LIMIT 1`,
    [seatUserId],
    QUERY_TIMEOUT_MS,
  );
  if (seat.rows.length === 0) return { ok: false, refusal: 'not_a_test_seat' };

  const [tags, cards] = await Promise.all([
    query<{ id: number }>(MISPLACED_TAG_ROWS, [seatUserId, MOST_ROWS_PER_REPAIR], QUERY_TIMEOUT_MS),
    query<{ id: number }>(
      HELD_MATCH_CARDS,
      [String(seatUserId), MOST_ROWS_PER_REPAIR],
      QUERY_TIMEOUT_MS,
    ),
  ]);
  const tagIds = tags.rows.map((r) => r.id);
  const cardIds = cards.rows.map((r) => r.id);

  if (!confirm) {
    return {
      ok: true,
      repair: { seat: seatUserId, tag_rows: tagIds, held_cards: cardIds, deleted: false },
    };
  }

  // BY THE IDS JUST READ, not by the predicate that found them. The predicate
  // is how they were chosen; the ids are what was agreed to.
  if (tagIds.length > 0) {
    await query(`DELETE FROM "UserTags" WHERE id = ANY($1::int[])`, [tagIds], QUERY_TIMEOUT_MS);
  }
  if (cardIds.length > 0) {
    await query(
      `DELETE FROM pending_updates WHERE id = ANY($1::int[])`,
      [cardIds],
      QUERY_TIMEOUT_MS,
    );
  }
  return {
    ok: true,
    repair: { seat: seatUserId, tag_rows: tagIds, held_cards: cardIds, deleted: true },
  };
}
