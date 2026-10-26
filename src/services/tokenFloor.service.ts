import { query } from '../db/postgres/client';

/**
 * #7627 (Misho's yes, 26 Oct): George ran out of tokens at night and three of
 * his goals stopped while answers were arriving. A real member never stops
 * mid-goal for tokens: when a run leaves the balance under the floor, it is
 * filled back to the level every member was given on 26 Oct (#7756).
 */
export const REFILL_BELOW = 200;
export const REFILL_TO = 2000;
/** A bound against a runaway loop, far above a heavy day's use. */
export const MAX_REFILLS_PER_DAY = 5;
const FLOOR_REFILL_REASON = 'floor_refill';
const QUERY_TIMEOUT_MS = 5_000;

/** Fills a real member's wallet back to REFILL_TO; returns the tokens added (0 when none). */
export async function refillBelowFloor(userId: string): Promise<number> {
  const result = await query<{ amount: number }>(
    `WITH wallet AS (
       SELECT COALESCE(SUM(amount), 0)::int AS balance FROM token_transactions WHERE user_id = $1
     )
     INSERT INTO token_transactions (user_id, amount, reason)
     SELECT $1, $2::int - wallet.balance, $3 FROM wallet
      WHERE wallet.balance < $4
        AND EXISTS (SELECT 1 FROM "User" u WHERE u.id = $1::int AND u."deletedAt" IS NULL)
        AND NOT EXISTS (SELECT 1 FROM test_seats ts WHERE ts.user_id = $1::int)
        AND (SELECT COUNT(*) FROM token_transactions t
              WHERE t.user_id = $1 AND t.reason = $3
                AND t.created_at > NOW() - INTERVAL '24 hours') < $5
     RETURNING amount`,
    [userId, REFILL_TO, FLOOR_REFILL_REASON, REFILL_BELOW, MAX_REFILLS_PER_DAY],
    QUERY_TIMEOUT_MS,
  );
  return result.rows[0]?.amount ?? 0;
}
