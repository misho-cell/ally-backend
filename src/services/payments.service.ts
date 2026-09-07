import { query } from '../db/postgres/client';

/**
 * The payment history (Ticket 10 Task 28 (b), D127): one row per money
 * movement, written by the Stripe and Paddle webhooks, read by the admin's
 * user page as „the dates of the first three payments".
 *
 * Nothing before migration 125 was recorded, so for accounts that paid
 * earlier the read also offers what the ledger can still infer — the top-ups
 * the wallet credited and the moment the subscription last became active —
 * and says plainly that those are inferred, not recorded.
 */

const PAYMENT_QUERY_TIMEOUT_MS = 5_000;
const FIRST_PAYMENTS_SHOWN = 3;
const MINOR_UNITS_PER_MAJOR = 100;

export type PaymentProvider = 'stripe' | 'paddle';
export type PaymentKind = 'subscription' | 'topup';

export interface PaymentToRecord {
  userId: string;
  provider: PaymentProvider;
  externalId: string;
  kind: PaymentKind;
  /** In the currency's minor unit (cents), as both providers report it. */
  amountMinor: number;
  currency: string;
  paidAt: Date;
}

export interface PaymentRow {
  provider: PaymentProvider;
  kind: PaymentKind;
  amount_usd: number;
  currency: string;
  paid_at: string;
}

export interface InferredPayment {
  at: string;
  source: 'wallet_topup' | 'subscription_became_active';
}

export interface PaymentHistory {
  /** Recorded by the webhooks since migration 125, oldest first, at most three. */
  first_payments: PaymentRow[];
  recorded_total: number;
  /** What the older ledger still says, for accounts that paid before recording began. */
  inferred: InferredPayment[];
}

/** Idempotent on (provider, external_id); a zero or negative amount is not a payment. */
export async function recordPayment(payment: PaymentToRecord): Promise<boolean> {
  if (!(payment.amountMinor > 0)) return false;
  const result = await query(
    `INSERT INTO payment_events (user_id, provider, external_id, kind, amount_usd, currency, paid_at)
     VALUES ($1::int, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (provider, external_id) DO NOTHING`,
    [
      payment.userId,
      payment.provider,
      payment.externalId,
      payment.kind,
      (payment.amountMinor / MINOR_UNITS_PER_MAJOR).toFixed(2),
      payment.currency.toLowerCase(),
      payment.paidAt.toISOString(),
    ],
    PAYMENT_QUERY_TIMEOUT_MS,
  );
  return (result.rowCount ?? 0) > 0;
}

function iso(value: string | Date | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export async function paymentHistory(userId: string): Promise<PaymentHistory> {
  const [recorded, total, inferred] = await Promise.all([
    query<{
      provider: PaymentProvider;
      kind: PaymentKind;
      amount_usd: string;
      currency: string;
      paid_at: Date;
    }>(
      `SELECT provider, kind, amount_usd, currency, paid_at FROM payment_events
       WHERE user_id = $1::int ORDER BY paid_at LIMIT $2`,
      [userId, FIRST_PAYMENTS_SHOWN],
      PAYMENT_QUERY_TIMEOUT_MS,
    ),
    query<{ n: string }>(
      `SELECT COUNT(*) AS n FROM payment_events WHERE user_id = $1::int`,
      [userId],
      PAYMENT_QUERY_TIMEOUT_MS,
    ),
    query<{ at: Date | null; source: InferredPayment['source'] }>(
      // $1 is cast on both sides: token_transactions.user_id is text and
      // "User".id is integer, and one placeholder read two ways is refused by
      // Postgres ("inconsistent types deduced for parameter $1").
      `SELECT created_at AS at, 'wallet_topup' AS source FROM token_transactions
        WHERE user_id = $1::text AND reason = 'topup'
       UNION ALL
       SELECT subscription_status_changed_at AS at, 'subscription_became_active' AS source
         FROM "User" WHERE id = $1::int AND subscription_status = 'active'
          AND subscription_status_changed_at IS NOT NULL
       ORDER BY at LIMIT $2`,
      [userId, FIRST_PAYMENTS_SHOWN],
      PAYMENT_QUERY_TIMEOUT_MS,
    ),
  ]);
  return {
    first_payments: recorded.rows.map((r) => ({
      provider: r.provider,
      kind: r.kind,
      amount_usd: Number(r.amount_usd),
      currency: r.currency,
      paid_at: iso(r.paid_at) ?? '',
    })),
    recorded_total: Number(total.rows[0]?.n ?? 0),
    inferred: inferred.rows
      .map((r) => ({ at: iso(r.at), source: r.source }))
      .filter((r): r is InferredPayment => r.at !== null),
  };
}
