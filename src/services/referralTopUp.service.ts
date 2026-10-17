import { withTransaction } from '../db/postgres/client';

/**
 * #5420 (Misho's own word, 17 Oct ~20:50Z: „5420 კი, ლიკას შეუვსე"): Lika's
 * one reward was 0.16, because until 186528a (6 Oct 19:19Z) the 5% was split
 * over six levels, and D692's 5% per level shipped nine hours after her
 * invitee paid. By hand, the reward from that one payment is brought up to
 * what D692 pays.
 *
 * It is one more `earn` row, from the same invitee at the same level, so the
 * wallet shows it as a reward and holds it like one (D677). It writes only the
 * difference to the target, and only for a pair that already has a kept reward;
 * a second call finds the target met and writes nothing.
 */
const EARN_REASON = 'earn';
const CLAWBACK_PREFIX = 'clawback_';
const TOP_UP_PREFIX = 'topup_';
const CENTS = 100;
/** No hand top-up is larger than one D692 share of the dearest plan. */
export const MAX_TOP_UP_TARGET_USD = 5;

export interface TopUpRequest {
  readonly userId: string;
  readonly sourceUserId: string;
  readonly toUsd: number;
  /** The board row the founder's word was given on — part of the row's id. */
  readonly boardRow: string;
}

export type TopUpOutcome =
  | { readonly status: 'topped_up'; readonly beforeUsd: number; readonly addedUsd: number }
  | { readonly status: 'already_met'; readonly beforeUsd: number }
  | { readonly status: 'no_reward_to_top_up' };

function cents(value: number): number {
  return Math.round(value * CENTS) / CENTS;
}

export async function topUpReferralReward(request: TopUpRequest): Promise<TopUpOutcome> {
  return withTransaction(async (client) => {
    await client.query('SELECT id FROM "User" WHERE id = $1 FOR UPDATE', [request.userId]);
    const kept = await client.query<{ total: string | null; level: number | null }>(
      `SELECT SUM(earned.amount_usd) AS total, MIN(earned.level) AS level
         FROM referral_transactions earned
        WHERE earned.user_id = $1 AND earned.source_user_id = $2 AND earned.reason = $3
          AND NOT EXISTS (SELECT 1 FROM referral_transactions taken
                           WHERE taken.user_id = earned.user_id
                             AND taken.external_id = $4 || earned.external_id)`,
      [request.userId, request.sourceUserId, EARN_REASON, CLAWBACK_PREFIX],
    );
    const level = kept.rows[0]?.level ?? null;
    if (level === null) return { status: 'no_reward_to_top_up' };
    const beforeUsd = cents(Number(kept.rows[0]?.total ?? 0));
    const addedUsd = cents(request.toUsd - beforeUsd);
    if (addedUsd <= 0) return { status: 'already_met', beforeUsd };
    const written = await client.query(
      `INSERT INTO referral_transactions
         (user_id, amount_usd, reason, level, source_user_id, external_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (user_id, external_id) WHERE external_id IS NOT NULL DO NOTHING`,
      [
        request.userId,
        addedUsd,
        EARN_REASON,
        level,
        request.sourceUserId,
        `${TOP_UP_PREFIX}${request.boardRow}_${request.sourceUserId}`,
      ],
    );
    return (written.rowCount ?? 0) === 0
      ? { status: 'already_met', beforeUsd }
      : { status: 'topped_up', beforeUsd, addedUsd };
  });
}
