import crypto from 'crypto';
import { PoolClient } from 'pg';
import { query, withTransaction } from '../db/postgres/client';
import { getPrice } from './costLedger.service';

// Referral earnings: 5% of a referred user's first real subscription charge,
// split into `referral.levels` equal shares and paid up the inviter chain.
// A missing level's share is not redistributed; every share is truncated to
// 2 decimals. Balances are spendable on token packages or a subscription
// month; withdrawal (from $10) ships as a separate phase.

const EARN_REASON = 'earn';
/** #233: a reward taken back because the payment it came from was refunded. */
const CLAWBACK_REASON = 'clawback';
const CLAWBACK_PREFIX = 'clawback_';
const SPEND_TOKENS_REASON = 'spend_tokens';
const SPEND_SUBSCRIPTION_REASON = 'spend_subscription';
// Token-wallet reason for packages bought with referral money — keeps them
// distinguishable from Paddle top-ups in the ledger.
const REFERRAL_TOPUP_REASON = 'referral_topup';
const SPEND_EXTERNAL_PREFIX = 'refspend_';
const SPENDABLE_TIERS = new Set(['pro', 'enterprise']);
const HISTORY_LIMIT = 50;
const PERCENT = 100;
const CENTS = 100;

/** Truncate (never round) to 2 decimals so shares stay exact cents. */
export function truncateUsd(value: number): number {
  return Math.floor(value * CENTS) / CENTS;
}

export interface ReferralHistoryEntry {
  amountUsd: number;
  reason: string;
  level: number | null;
  createdAt: string;
  /** D674: on a reward still on hold only — when it becomes usable (ISO). */
  availableFrom?: string;
}

export interface ReferralSummary {
  /** Everything booked, held or not (unchanged meaning, for existing screens). */
  balanceUsd: number;
  /** D674: what can be spent or withdrawn now — rewards older than the hold. */
  availableUsd: number;
  /** D674: rewards still inside the refund window, not usable yet. */
  onHoldUsd: number;
  holdDays: number;
  totalEarnedUsd: number;
  minWithdrawalUsd: number;
  canWithdraw: boolean;
  history: ReferralHistoryEntry[];
}

export type SpendOutcome =
  | { ok: true; tokens?: number }
  | { ok: false; reason: 'insufficient_balance' | 'unknown_package' | 'unknown_tier' };

interface ChainLink {
  userId: string;
  level: number;
}

/**
 * D674 (the founder, 5 Oct, through the tester): a payment can be refunded in
 * its first 3 days, and a refund takes back the reward it paid (D673, #233).
 * So a reward is usable — spendable or withdrawable — only from day 4: never
 * while the payment it came from could still be refunded.
 */
export const REWARD_HOLD_DAYS = 3;
const CENTS_PER_USD = 100;

const MS_PER_DAY = 86_400_000;

/**
 * The frontend's 20:00Z (D674): when a held reward becomes usable — the same
 * rule as ON_HOLD_SQL, so the screen never keeps a copy of it. Null for any
 * entry that is not a reward on hold.
 */
export function heldUntil(reason: string, createdAt: Date, now: Date): Date | null {
  if (reason !== EARN_REASON) return null;
  const until = new Date(createdAt.getTime() + REWARD_HOLD_DAYS * MS_PER_DAY);
  return until > now ? until : null;
}

/** An earned reward still inside the refund window. */
const ON_HOLD_SQL = `reason = '${EARN_REASON}' AND created_at > NOW() - make_interval(days => ${REWARD_HOLD_DAYS})`;

/** What can be spent now: everything booked, minus rewards still on hold. */
async function balanceFor(client: PoolClient, userId: string): Promise<number> {
  const result = await client.query<{ available: string | null }>(
    `SELECT SUM(amount_usd) - COALESCE(SUM(amount_usd) FILTER (WHERE ${ON_HOLD_SQL}), 0) AS available
       FROM referral_transactions WHERE user_id = $1`,
    [userId],
  );
  return Number(result.rows[0]?.available ?? 0);
}

/**
 * Walks the inviter chain upward, at most `maxLevels` links. Deleted accounts
 * keep their level position but are not paid (their share is skipped, exactly
 * like a missing level); a cycle ends the walk.
 */
async function inviterChain(
  client: PoolClient,
  subscriberId: string,
  maxLevels: number,
): Promise<ChainLink[]> {
  const beneficiaries: ChainLink[] = [];
  const seen = new Set<string>([subscriberId]);
  let currentId = subscriberId;

  for (let level = 1; level <= maxLevels; level++) {
    const result = await client.query<{ inviter_id: number; deleted: Date | null }>(
      `SELECT inviter.id AS inviter_id, inviter."deletedAt" AS deleted
       FROM "User" invitee
       JOIN "User" inviter ON inviter.id = invitee."inviterReferralUserId"
       WHERE invitee.id = $1
       LIMIT 1`,
      [currentId],
    );
    const row = result.rows[0];
    if (!row) break;
    const inviterId = String(row.inviter_id);
    if (seen.has(inviterId)) break;
    seen.add(inviterId);
    if (row.deleted === null) beneficiaries.push({ userId: inviterId, level });
    currentId = inviterId;
  }
  return beneficiaries;
}

/**
 * Pays out the referral shares for a subscriber's first real charge. Runs
 * exactly once per subscriber: the check and inserts share one transaction
 * serialized on the subscriber's row, and the (user_id, external_id) unique
 * index makes webhook retries no-ops. Returns the number of shares paid.
 */
export async function distributeReferralEarnings(
  subscriberId: string,
  amountUsd: number,
  externalId: string,
): Promise<number> {
  if (amountUsd <= 0) return 0;
  const [percent, levels] = await Promise.all([
    getPrice('referral.percent'),
    getPrice('referral.levels'),
  ]);
  if (percent <= 0 || levels <= 0) return 0;
  const perLevel = truncateUsd((amountUsd * percent) / PERCENT / levels);
  if (perLevel <= 0) return 0;

  return withTransaction(async (client) => {
    await client.query('SELECT id FROM "User" WHERE id = $1 FOR UPDATE', [subscriberId]);
    const already = await client.query(
      'SELECT 1 FROM referral_transactions WHERE source_user_id = $1 AND reason = $2 LIMIT 1',
      [subscriberId, EARN_REASON],
    );
    if (already.rowCount && already.rowCount > 0) return 0;

    const beneficiaries = await inviterChain(client, subscriberId, Math.floor(levels));
    for (const beneficiary of beneficiaries) {
      await client.query(
        `INSERT INTO referral_transactions
           (user_id, amount_usd, reason, level, source_user_id, external_id)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (user_id, external_id) WHERE external_id IS NOT NULL DO NOTHING`,
        [beneficiary.userId, perLevel, EARN_REASON, beneficiary.level, subscriberId, externalId],
      );
    }
    return beneficiaries.length;
  });
}

export async function getReferralSummary(userId: string): Promise<ReferralSummary> {
  const [totalsResult, historyResult, minWithdrawal] = await Promise.all([
    query<{ balance: string | null; earned: string | null; on_hold: string | null }>(
      `SELECT SUM(amount_usd) AS balance,
              SUM(amount_usd) FILTER (WHERE amount_usd > 0) AS earned,
              SUM(amount_usd) FILTER (WHERE ${ON_HOLD_SQL}) AS on_hold
       FROM referral_transactions
       WHERE user_id = $1`,
      [userId],
    ),
    query<{ amount_usd: string; reason: string; level: number | null; created_at: Date }>(
      `SELECT amount_usd, reason, level, created_at
       FROM referral_transactions
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [userId, HISTORY_LIMIT],
    ),
    getPrice('referral.min_withdrawal_usd'),
  ]);

  const balanceUsd = Number(totalsResult.rows[0]?.balance ?? 0);
  const onHoldUsd = Number(totalsResult.rows[0]?.on_hold ?? 0);
  const availableUsd = Math.round((balanceUsd - onHoldUsd) * CENTS_PER_USD) / CENTS_PER_USD;
  return {
    balanceUsd,
    availableUsd,
    onHoldUsd,
    holdDays: REWARD_HOLD_DAYS,
    totalEarnedUsd: Number(totalsResult.rows[0]?.earned ?? 0),
    minWithdrawalUsd: minWithdrawal,
    canWithdraw: minWithdrawal > 0 && availableUsd >= minWithdrawal,
    history: historyResult.rows.map((row) => {
      const createdAt = new Date(row.created_at);
      const availableFrom = heldUntil(row.reason, createdAt, new Date());
      return {
        amountUsd: Number(row.amount_usd),
        reason: row.reason,
        level: row.level,
        createdAt: createdAt.toISOString(),
        ...(availableFrom === null ? {} : { availableFrom: availableFrom.toISOString() }),
      };
    }),
  };
}

/**
 * Buys a token package with referral balance. Atomic: the spend row and the
 * token credit land in one transaction serialized on the user's row, so
 * concurrent requests cannot double-spend the same dollars.
 */
export async function spendReferralOnTokens(
  userId: string,
  packageId: number,
): Promise<SpendOutcome> {
  const pkgResult = await query<{ tokens: number; price_usd: string | null }>(
    'SELECT tokens, price_usd FROM topup_packages WHERE id = $1 AND active = true LIMIT 1',
    [packageId],
  );
  const pkg = pkgResult.rows[0];
  if (!pkg || pkg.price_usd === null) return { ok: false, reason: 'unknown_package' };
  const price = Number(pkg.price_usd);
  const tokens = Number(pkg.tokens);

  return withTransaction(async (client) => {
    await client.query('SELECT id FROM "User" WHERE id = $1 FOR UPDATE', [userId]);
    if ((await balanceFor(client, userId)) < price) {
      return { ok: false, reason: 'insufficient_balance' } as SpendOutcome;
    }
    const externalId = SPEND_EXTERNAL_PREFIX + crypto.randomUUID();
    await client.query(
      `INSERT INTO referral_transactions (user_id, amount_usd, reason, external_id)
       VALUES ($1, $2, $3, $4)`,
      [userId, -price, SPEND_TOKENS_REASON, externalId],
    );
    await client.query(
      `INSERT INTO token_transactions (user_id, amount, reason, external_id)
       VALUES ($1, $2, $3, $4)`,
      [userId, tokens, REFERRAL_TOPUP_REASON, externalId],
    );
    return { ok: true, tokens } as SpendOutcome;
  });
}

/**
 * Buys one subscription month with referral balance — no Paddle involved and
 * no auto-renewal. The period extends from the later of now / the current
 * period end, so an already-active user never loses paid time. The monthly
 * token grant follows automatically (it keys off status + tier).
 */
export async function spendReferralOnSubscription(
  userId: string,
  tier: string,
): Promise<SpendOutcome> {
  if (!SPENDABLE_TIERS.has(tier)) return { ok: false, reason: 'unknown_tier' };
  const price = await getPrice(`subscription.price.${tier}`);
  if (price <= 0) return { ok: false, reason: 'unknown_tier' };

  return withTransaction(async (client) => {
    await client.query('SELECT id FROM "User" WHERE id = $1 FOR UPDATE', [userId]);
    if ((await balanceFor(client, userId)) < price) {
      return { ok: false, reason: 'insufficient_balance' } as SpendOutcome;
    }
    await client.query(
      `INSERT INTO referral_transactions (user_id, amount_usd, reason, external_id)
       VALUES ($1, $2, $3, $4)`,
      [userId, -price, SPEND_SUBSCRIPTION_REASON, SPEND_EXTERNAL_PREFIX + crypto.randomUUID()],
    );
    await client.query(
      `UPDATE "User"
       SET subscription_status    = 'active',
           subscription_tier      = $2,
           current_period_ends_at =
             GREATEST(COALESCE(current_period_ends_at, NOW()), NOW()) + INTERVAL '1 month',
           "updatedAt"            = NOW()
       WHERE id = $1`,
      [userId, tier],
    );
    return { ok: true } as SpendOutcome;
  });
}

/**
 * #233 — Misho, 2 October: „კი ჩამოეჭრას". Every share earned from the
 * refunded payment (matched by the payment's own external id) is taken back
 * with one negative line, once: the clawback's own external id makes a
 * repeated refund event a no-op. Returns how many shares were taken back.
 */
export async function clawbackReferralEarnings(paymentExternalId: string): Promise<number> {
  const result = await query(
    `INSERT INTO referral_transactions
       (user_id, amount_usd, reason, level, source_user_id, external_id)
     SELECT user_id, -amount_usd, $2, level, source_user_id, $3 || external_id
       FROM referral_transactions
      WHERE external_id = $1 AND reason = $4
     ON CONFLICT (user_id, external_id) WHERE external_id IS NOT NULL DO NOTHING`,
    [paymentExternalId, CLAWBACK_REASON, CLAWBACK_PREFIX, EARN_REASON],
  );
  return result.rowCount ?? 0;
}
