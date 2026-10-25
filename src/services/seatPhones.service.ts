import { query } from '../db/postgres/client';
import { isFictionalNumber } from './fictionalNumbers';
import { normalizePhone } from './phone';

/**
 * Tester 75919 (#7630, 25 Oct): the plan sentence names one person on two
 * numbers once (f4dcde25), and testing that needs a seat with two numbers.
 * POST /admin/test-accounts takes one. A test seat — and only a test seat —
 * may be given another reserved fictional number nobody holds yet.
 */
const QUERY_TIMEOUT_MS = 5_000;
const FICTIONAL_COUNTRY_CODE = '+1';

export enum SeatPhoneRefusal {
  NotATestSeat = 'not_a_test_seat',
  NotAFictionalNumber = 'not_a_fictional_number',
  Taken = 'number_already_held',
}

export type SeatPhoneResult =
  | { readonly ok: true; readonly seat: number; readonly phones: number }
  | { readonly ok: false; readonly refusal: SeatPhoneRefusal };

async function isTestSeat(seatUserId: number): Promise<boolean> {
  const seat = await query<{ user_id: number }>(
    'SELECT user_id FROM test_seats WHERE user_id = $1 LIMIT 1',
    [seatUserId],
    QUERY_TIMEOUT_MS,
  );
  return seat.rows.length > 0;
}

async function isHeld(phone: string): Promise<boolean> {
  const held = await query<{ id: number }>(
    `SELECT id FROM "UserPhone"
      WHERE regexp_replace(phone, '\\D', '', 'g') = regexp_replace($1, '\\D', '', 'g')
      LIMIT 1`,
    [phone],
    QUERY_TIMEOUT_MS,
  );
  return held.rows.length > 0;
}

/** Gives a test seat one more reserved fictional number. */
export async function addSeatPhone(seatUserId: number, rawPhone: string): Promise<SeatPhoneResult> {
  if (!isFictionalNumber(rawPhone)) {
    return { ok: false, refusal: SeatPhoneRefusal.NotAFictionalNumber };
  }
  if (!(await isTestSeat(seatUserId))) return { ok: false, refusal: SeatPhoneRefusal.NotATestSeat };
  const phone = normalizePhone(rawPhone);
  if (await isHeld(phone)) return { ok: false, refusal: SeatPhoneRefusal.Taken };
  await query(
    `INSERT INTO "UserPhone" (phone, "phoneNumber", "phoneCode", "userId", "createdAt", "updatedAt")
     VALUES ($1, $2, $3, $4, NOW(), NOW())`,
    [phone, phone.slice(FICTIONAL_COUNTRY_CODE.length), FICTIONAL_COUNTRY_CODE, seatUserId],
    QUERY_TIMEOUT_MS,
  );
  const count = await query<{ phones: number }>(
    'SELECT COUNT(*)::int AS phones FROM "UserPhone" WHERE "userId" = $1',
    [seatUserId],
    QUERY_TIMEOUT_MS,
  );
  return { ok: true, seat: seatUserId, phones: count.rows[0]?.phones ?? 0 };
}
