import Stripe from 'stripe';
import { query } from '../db/postgres/client';
import { clawbackReferralEarnings } from './referral.service';
import { stripeClient } from './stripe.service';

/**
 * Board #232 + #233 — Misho, 2 October („კი ჩამოეჭრას").
 *
 * #232: a refund was issued by hand in the Stripe dashboard and the app never
 * knew — the payment still read as paid. Stripe now tells us
 * (`charge.refunded`), and the payment row records how much came back and when.
 *
 * #233: when a referred person's payment is refunded, the 5% reward the
 * inviters earned from THAT payment is taken back — one negative line per
 * share, once. The plan's own state follows from Stripe's subscription events,
 * which a refund-and-cancel already sends.
 *
 * The payment is found the way we stored it: a subscription payment by its
 * invoice id, a token pack by its Checkout session id. Both are reached from
 * the charge's payment intent.
 */
const QUERY_TIMEOUT_MS = 10_000;
const MINOR_UNITS_PER_MAJOR = 100;

function paymentIntentOf(charge: Stripe.Charge): string | null {
  const pi = charge.payment_intent;
  if (typeof pi === 'string') return pi;
  return pi?.id ?? null;
}

/** The ids our payment rows carry for this payment intent: invoices and Checkout sessions. */
async function storedIdsFor(paymentIntent: string): Promise<string[]> {
  const stripe = stripeClient();
  const [invoicePayments, sessions] = await Promise.all([
    stripe.invoicePayments.list({
      payment: { type: 'payment_intent', payment_intent: paymentIntent },
    }),
    stripe.checkout.sessions.list({ payment_intent: paymentIntent }),
  ]);
  const invoiceIds = invoicePayments.data.flatMap((p) =>
    typeof p.invoice === 'string' ? [p.invoice] : p.invoice?.id ? [p.invoice.id] : [],
  );
  return [...invoiceIds, ...sessions.data.map((s) => s.id)];
}

async function markRefunded(ids: readonly string[], refundedUsd: number): Promise<string[]> {
  const result = await query<{ external_id: string }>(
    `UPDATE payment_events
        SET refunded_usd = $2, refunded_at = COALESCE(refunded_at, NOW())
      WHERE provider = 'stripe' AND external_id = ANY($1::text[])
      RETURNING external_id`,
    [ids, refundedUsd.toFixed(2)],
    QUERY_TIMEOUT_MS,
  );
  return result.rows.map((r) => r.external_id);
}

export interface RefundOutcome {
  readonly payments: readonly string[];
  readonly clawedBack: number;
}

export async function applyChargeRefund(charge: Stripe.Charge): Promise<RefundOutcome> {
  const paymentIntent = paymentIntentOf(charge);
  if (paymentIntent === null || charge.amount_refunded <= 0) return { payments: [], clawedBack: 0 };
  const ids = await storedIdsFor(paymentIntent);
  if (ids.length === 0) {
    // eslint-disable-next-line no-console
    console.error(`[stripe-refund] charge ${charge.id} matches no recorded payment`);
    return { payments: [], clawedBack: 0 };
  }
  const payments = await markRefunded(ids, charge.amount_refunded / MINOR_UNITS_PER_MAJOR);
  let clawedBack = 0;
  for (const id of ids) clawedBack += await clawbackReferralEarnings(id);
  // eslint-disable-next-line no-console
  console.log(
    `[stripe-refund] charge ${charge.id}: ${payments.length} payment(s) marked refunded, ` +
      `${clawedBack} referral share(s) taken back`,
  );
  return { payments, clawedBack };
}
