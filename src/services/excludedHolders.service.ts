import { query } from '../db/postgres/client';
import { normalizePhone } from './phone';

/**
 * Accounts that never vouch for anyone (migration 266; Misho, 24 Oct): copies
 * of one real member's phonebook that "knew" everyone. Never a bridge, a path
 * link or a reverse-tie holder. Nothing in them is deleted or changed.
 */

const EXCLUDED_QUERY_TIMEOUT_MS = 3_000;
/** The list changes by migration only, so a short cache spares every walk a read. */
const EXCLUDED_CACHE_MS = 10 * 60_000;
const MAX_EXCLUDED_PHONES = 1_000;

/** SQL: this account is not one that never vouches. `idExpr` is a column we write, never input. */
export function notAnExcludedHolder(idExpr: string): string {
  return `NOT EXISTS (SELECT 1 FROM excluded_holders eh WHERE eh.user_id = ${idExpr})`;
}

let cached: { readonly at: number; readonly phones: ReadonlySet<string> } | null = null;

/** The numbers of the accounts that never vouch, normalized; empty when unreadable. */
export async function excludedHolderPhones(now: number = Date.now()): Promise<ReadonlySet<string>> {
  if (cached !== null && now - cached.at < EXCLUDED_CACHE_MS) return cached.phones;
  try {
    const result = await query<{ phone: string }>(
      `SELECT up.phone FROM "UserPhone" up
         JOIN excluded_holders eh ON eh.user_id = up."userId"
        LIMIT $1`,
      [MAX_EXCLUDED_PHONES],
      EXCLUDED_QUERY_TIMEOUT_MS,
    );
    cached = { at: now, phones: new Set(result.rows.map((r) => normalizePhone(r.phone))) };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[excluded-holders] not read, nothing excluded:', (err as Error).message);
    return new Set();
  }
  return cached.phones;
}

/** Tests only: forget the cached list. */
export function forgetExcludedHolders(): void {
  cached = null;
}

const TEST_SEAT_REASON = 'test_seat';

export enum SeatExclusion {
  Set = 'set',
  Cleared = 'cleared',
  NotATestSeat = 'not_a_test_seat',
}

/**
 * Tester 75911 (25 Oct): the plan card's groups leave excluded holders out
 * (0fc7629f), and testing that needs one on a fictional seat. A test seat — and
 * only a test seat — may be made one, or no longer one. Real accounts change by
 * migration alone.
 */
export async function setSeatExcluded(
  seatUserId: number,
  excluded: boolean,
): Promise<SeatExclusion> {
  const seat = await query<{ user_id: number }>(
    'SELECT user_id FROM test_seats WHERE user_id = $1 LIMIT 1',
    [seatUserId],
    EXCLUDED_QUERY_TIMEOUT_MS,
  );
  if (seat.rows.length === 0) return SeatExclusion.NotATestSeat;
  if (excluded) {
    await query(
      `INSERT INTO excluded_holders (user_id, reason) VALUES ($1, $2)
       ON CONFLICT (user_id) DO NOTHING`,
      [seatUserId, TEST_SEAT_REASON],
      EXCLUDED_QUERY_TIMEOUT_MS,
    );
  } else {
    await query(
      'DELETE FROM excluded_holders WHERE user_id = $1 AND reason = $2',
      [seatUserId, TEST_SEAT_REASON],
      EXCLUDED_QUERY_TIMEOUT_MS,
    );
  }
  forgetExcludedHolders();
  return excluded ? SeatExclusion.Set : SeatExclusion.Cleared;
}
