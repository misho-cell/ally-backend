import { query } from '../db/postgres/client';
import { getPrice } from './costLedger.service';
import {
  clawbackReferralEarnings,
  distributeReferralEarnings,
  oneMonthOfUsd,
} from './referral.service';

/**
 * §94 (Misho, 6 Oct: „კი, ააშენე #1916-ის ტესტის მარშრუტი") — #1916's reward
 * rule tested on fictions. The tester's seat may not make a payment, test mode
 * included, so this fires the SAME reward step a first Stripe charge fires
 * (distributeReferralEarnings with one month of the charge), for a test seat
 * only, with no card, no Stripe and no payment row.
 *
 * Two walls, both before anything is written:
 *   - the paying account must be in test_seats;
 *   - every account the reward would reach up the inviter chain must be one
 *     too — a fictional payment never credits a real person.
 * The undo is the refund path's own clawback (#233): one negative line per
 * share, nothing deleted.
 */
const QUERY_TIMEOUT_MS = 5_000;
export const SEAT_PAYMENT_PREFIX = 'seat_test_';
export const MAX_SEAT_PAYMENT_USD = 1000;

export enum SeatPlan {
  Month = 'month',
  Year = 'year',
}

export enum SeatPaymentRefusal {
  NotATestSeat = 'not_a_test_seat',
  ChainLeavesTestSeats = 'chain_leaves_test_seats',
  NotASeatPayment = 'not_a_seat_payment',
}

export type SeatPaymentOutcome =
  | {
      readonly ok: true;
      readonly external_id: string;
      readonly base_usd: number;
      readonly shares: number;
    }
  | { readonly ok: false; readonly refusal: SeatPaymentRefusal };

async function isTestSeat(userId: number): Promise<boolean> {
  const result = await query(
    `SELECT 1 FROM test_seats WHERE user_id = $1 LIMIT 1`,
    [userId],
    QUERY_TIMEOUT_MS,
  );
  return (result.rowCount ?? 0) > 0;
}

/** Whether every inviter up to `levels` above the seat is itself a test seat. */
async function chainStaysInTestSeats(seatId: number, levels: number): Promise<boolean> {
  const result = await query<{ outsiders: number }>(
    `WITH RECURSIVE chain AS (
       SELECT u."inviterReferralUserId" AS id, 1 AS level
         FROM "User" u WHERE u.id = $1
       UNION ALL
       SELECT u."inviterReferralUserId", c.level + 1
         FROM chain c JOIN "User" u ON u.id = c.id
        WHERE c.level < $2 AND c.id IS NOT NULL
     )
     SELECT COUNT(*)::int AS outsiders
       FROM chain c
      WHERE c.id IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM test_seats ts WHERE ts.user_id = c.id)`,
    [seatId, levels],
    QUERY_TIMEOUT_MS,
  );
  return (result.rows[0]?.outsiders ?? 1) === 0;
}

/** The charge's own period, so an annual plan counts as one month of it (D693). */
export function seatPeriod(plan: SeatPlan, now: Date): { start: Date; end: Date } {
  const end = new Date(now);
  if (plan === SeatPlan.Year) end.setUTCFullYear(end.getUTCFullYear() + 1);
  else end.setUTCMonth(end.getUTCMonth() + 1);
  return { start: now, end };
}

export async function simulateSeatFirstPayment(
  seatId: number,
  amountUsd: number,
  plan: SeatPlan,
  now: Date = new Date(),
): Promise<SeatPaymentOutcome> {
  if (!(await isTestSeat(seatId))) return { ok: false, refusal: SeatPaymentRefusal.NotATestSeat };
  const levels = Math.floor(await getPrice('referral.levels'));
  if (!(await chainStaysInTestSeats(seatId, levels))) {
    return { ok: false, refusal: SeatPaymentRefusal.ChainLeavesTestSeats };
  }
  const { start, end } = seatPeriod(plan, now);
  const baseUsd = oneMonthOfUsd(amountUsd, start, end);
  const externalId = `${SEAT_PAYMENT_PREFIX}${seatId}_${now.getTime()}`;
  const shares = await distributeReferralEarnings(String(seatId), baseUsd, externalId);
  return { ok: true, external_id: externalId, base_usd: baseUsd, shares };
}

/** §94's undo: the shares of one simulated payment taken back. Nothing is deleted. */
export async function undoSeatFirstPayment(
  seatId: number,
  externalId: string,
): Promise<{ ok: true; taken_back: number } | { ok: false; refusal: SeatPaymentRefusal }> {
  if (!externalId.startsWith(`${SEAT_PAYMENT_PREFIX}${seatId}_`)) {
    return { ok: false, refusal: SeatPaymentRefusal.NotASeatPayment };
  }
  if (!(await isTestSeat(seatId))) return { ok: false, refusal: SeatPaymentRefusal.NotATestSeat };
  return { ok: true, taken_back: await clawbackReferralEarnings(externalId) };
}
