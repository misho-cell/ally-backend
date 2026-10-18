import { withTransaction } from '../db/postgres/client';

/**
 * #390 (the founder's D814; Misho's own word, 18 Oct ~10:55Z: „კველაფერზე
 * კი"): test a real referral spend on the founder's own account. Misho adds
 * 10 USD of AVAILABLE reward to 501, and the founder spends it himself.
 *
 * Not an `earn` row: an earned reward is held 14 days (REWARD_HOLD_DAYS), and
 * the point is to spend it today. It is its own reason, so nothing that counts
 * earnings (the earnings counters, the Axel export) counts it, and the
 * earnings screen shows it as a plain transaction. One credit per account and
 * board row: a second call finds it and writes nothing.
 */
export const CREDIT_REASON = 'admin_credit';
const CREDIT_PREFIX = 'credit_';
const CENTS = 100;
/** No hand credit is larger than the one the founder's test needs. */
export const MAX_CREDIT_USD = 10;

export interface CreditRequest {
  readonly userId: string;
  readonly amountUsd: number;
  /** The board row the word was given on — part of the row's id. */
  readonly boardRow: string;
}

export type CreditOutcome =
  | { readonly status: 'credited'; readonly amountUsd: number }
  | { readonly status: 'already_credited' }
  | { readonly status: 'no_such_account' };

export async function creditReferralBalance(request: CreditRequest): Promise<CreditOutcome> {
  const amountUsd = Math.round(request.amountUsd * CENTS) / CENTS;
  return withTransaction(async (client) => {
    const account = await client.query(
      'SELECT id FROM "User" WHERE id = $1 AND "deletedAt" IS NULL FOR UPDATE',
      [request.userId],
    );
    if ((account.rowCount ?? 0) === 0) return { status: 'no_such_account' };
    const written = await client.query(
      `INSERT INTO referral_transactions (user_id, amount_usd, reason, external_id)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, external_id) WHERE external_id IS NOT NULL DO NOTHING`,
      [request.userId, amountUsd, CREDIT_REASON, `${CREDIT_PREFIX}${request.boardRow}`],
    );
    return (written.rowCount ?? 0) === 0
      ? { status: 'already_credited' }
      : { status: 'credited', amountUsd };
  });
}
