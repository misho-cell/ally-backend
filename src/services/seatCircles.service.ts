import { query, withTransaction } from '../db/postgres/client';
import { FICTIONAL_RANGES_TEXT, isFictionalNumber } from './fictionalNumbers';
import { AllyColour, OwnerCircle } from './oldAllyColours.service';
import { NOT_A_TEST_SEAT } from './seatContacts.service';
import { normalizePhone } from './phone';

/**
 * #5941 (tester #29, 23 Oct 22:20Z, D860): „your closest circle" could not be
 * tested, because only old Ally ever wrote a seat's circles — a fictional seat
 * had none, so no answer could say one. This sets how close a test seat holds
 * each of its made-up contacts (or another seat), in the same table old Ally's
 * colours were backfilled into, so the bubble works between seats too.
 *
 * The same fences as §60: test seats only, reserved fictional numbers only,
 * a batch refused whole if any number belongs to a real account, and written
 * in one transaction or not at all.
 */

const QUERY_TIMEOUT_MS = 8_000;
const SEAT_CIRCLE_SOURCE = 'test_seat';
/** Every reserved number there is, as in the bulk contacts route. */
export const MAX_SEAT_CIRCLES = 1_100;

const COLOUR_OF: Readonly<Record<OwnerCircle, AllyColour>> = {
  [OwnerCircle.Closest]: AllyColour.Green,
  [OwnerCircle.Close]: AllyColour.Blue,
  [OwnerCircle.Acquaintance]: AllyColour.Yellow,
  [OwnerCircle.Contact]: AllyColour.Red,
};

export interface SeatCircleIn {
  readonly phone: string;
  /** One of OwnerCircle, or null to take the circle away. */
  readonly circle: string | null;
}

export type SeatCircleRefusal =
  | 'empty'
  | 'too_many'
  | 'duplicate_phone'
  | 'not_a_fictional_number'
  | 'bad_circle'
  | 'not_a_test_seat'
  | 'somebody_is_registered_on_it';

export type SeatCirclesResult =
  | { ok: true; seat: number; set: number; cleared: number }
  | { ok: false; refusal: SeatCircleRefusal; index?: number; detail?: string };

interface CleanCircle {
  readonly phone: string;
  readonly colour: AllyColour | null;
}

function isOwnerCircle(value: unknown): value is OwnerCircle {
  return Object.values(OwnerCircle).some((circle) => circle === value);
}

function validate(
  entries: readonly SeatCircleIn[],
): CleanCircle[] | Exclude<SeatCirclesResult, { ok: true }> {
  if (entries.length === 0) return { ok: false, refusal: 'empty' };
  if (entries.length > MAX_SEAT_CIRCLES) return { ok: false, refusal: 'too_many' };
  const seen = new Set<string>();
  const clean: CleanCircle[] = [];
  for (const [index, entry] of entries.entries()) {
    const phone = String(entry.phone ?? '');
    if (!isFictionalNumber(phone)) {
      return { ok: false, refusal: 'not_a_fictional_number', index, detail: FICTIONAL_RANGES_TEXT };
    }
    if (entry.circle !== null && !isOwnerCircle(entry.circle)) {
      return {
        ok: false,
        refusal: 'bad_circle',
        index,
        detail: Object.values(OwnerCircle).join(', '),
      };
    }
    const stored = normalizePhone(phone);
    if (seen.has(stored)) return { ok: false, refusal: 'duplicate_phone', index };
    seen.add(stored);
    clean.push({ phone: stored, colour: entry.circle === null ? null : COLOUR_OF[entry.circle] });
  }
  return clean;
}

async function isTestSeat(seatUserId: number): Promise<boolean> {
  const seat = await query<{ user_id: number }>(
    'SELECT user_id FROM test_seats WHERE user_id = $1 LIMIT 1',
    [seatUserId],
    QUERY_TIMEOUT_MS,
  );
  return seat.rows.length > 0;
}

async function anyRegistered(phones: readonly string[]): Promise<boolean> {
  const registered = await query<{ id: number }>(
    `SELECT id FROM "UserPhone" WHERE phone = ANY($1::varchar[]) AND ${NOT_A_TEST_SEAT} LIMIT 1`,
    [phones],
    QUERY_TIMEOUT_MS,
  );
  return registered.rows.length > 0;
}

async function writeCircles(seatUserId: number, clean: readonly CleanCircle[]): Promise<void> {
  const toSet = clean.filter((c) => c.colour !== null);
  const toClear = clean.filter((c) => c.colour === null).map((c) => c.phone);
  await withTransaction(async (client) => {
    await client.query(
      `INSERT INTO human_relationship_tiers (user_id, contact_phone, tier, source, set_at)
       SELECT $1::int, x.phone, x.tier, $4, NOW()
         FROM unnest($2::text[], $3::text[]) AS x(phone, tier)
       ON CONFLICT (user_id, contact_phone)
       DO UPDATE SET tier = EXCLUDED.tier, source = EXCLUDED.source, set_at = NOW()`,
      [seatUserId, toSet.map((c) => c.phone), toSet.map((c) => c.colour), SEAT_CIRCLE_SOURCE],
    );
    await client.query(
      'DELETE FROM human_relationship_tiers WHERE user_id = $1 AND contact_phone = ANY($2::text[])',
      [seatUserId, toClear],
    );
  });
}

/** Sets (or, with circle null, takes away) how close a test seat holds each number. */
export async function setSeatCircles(
  seatUserId: number,
  entries: readonly SeatCircleIn[],
): Promise<SeatCirclesResult> {
  const clean = validate(entries);
  if (!Array.isArray(clean)) return clean;
  if (!(await isTestSeat(seatUserId))) return { ok: false, refusal: 'not_a_test_seat' };
  if (await anyRegistered(clean.map((c) => c.phone))) {
    return { ok: false, refusal: 'somebody_is_registered_on_it' };
  }
  await writeCircles(seatUserId, clean);
  const set = clean.filter((c) => c.colour !== null).length;
  return { ok: true, seat: seatUserId, set, cleared: clean.length - set };
}
