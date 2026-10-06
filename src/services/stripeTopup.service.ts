import Stripe from 'stripe';
import { PAYMENT_PUSH_URL, sendPushNotification } from './notification.service';
import { recordPayment } from './payments.service';
import { ensureCustomer, stripeClient } from './stripe.service';
import { creditTopup, findTopupPackageById } from './tokenWallet.service';

/**
 * Row 292 — token packs paid through Stripe (Misho, 2 October: „დაიწყე").
 *
 * The pack button opened Paddle, which answered „Something went wrong", and
 * nobody had ever completed a pack purchase. Packs now go through the same
 * Stripe account as the subscription. The price is taken from OUR
 * topup_packages row (price_data), so the Stripe dashboard needs no products:
 * the table stays the one place a pack's tokens and price are set.
 *
 * Delivery is the checkout.session.completed webhook, credited once by the
 * session id (creditTopup is idempotent on it, so a retried webhook adds
 * nothing).
 */
const TOPUP_KIND = 'topup';
const CENTS_PER_DOLLAR = 100;
const CURRENCY = 'usd';
const APP_URL = process.env.STRIPE_APP_URL ?? 'https://netai.guru';

export enum TopupRefusal {
  UnknownPackage = 'unknown_package',
}

export type TopupCheckout =
  | { readonly ok: true; readonly url: string }
  | { readonly ok: false; readonly refusal: TopupRefusal };

export async function createTopupCheckout(
  userId: string,
  packageId: number,
): Promise<TopupCheckout> {
  const pkg = await findTopupPackageById(packageId);
  if (pkg === null || pkg.priceUsd === null || pkg.priceUsd <= 0) {
    return { ok: false, refusal: TopupRefusal.UnknownPackage };
  }
  const customerId = await ensureCustomer(userId);
  const session = await stripeClient().checkout.sessions.create({
    mode: 'payment',
    customer: customerId,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: CURRENCY,
          unit_amount: Math.round(pkg.priceUsd * CENTS_PER_DOLLAR),
          product_data: { name: pkg.label },
        },
      },
    ],
    metadata: { kind: TOPUP_KIND, user_id: userId, package_id: String(pkg.id) },
    success_url: `${APP_URL}/chat?topup=success`,
    cancel_url: `${APP_URL}/chat?topup=cancelled`,
    client_reference_id: userId,
  });
  if (!session.url) throw new Error('Stripe returned no checkout URL.');
  return { ok: true, url: session.url };
}

/** A completed Checkout Session that is a pack purchase, or not ours to handle. */
export function isTopupSession(session: Stripe.Checkout.Session): boolean {
  return session.mode === 'payment' && session.metadata?.kind === TOPUP_KIND;
}

/**
 * Credits a paid pack once. Returns whether tokens were added (false for an
 * unpaid session, an unknown package, or a webhook retry).
 */
export async function deliverTopupSession(session: Stripe.Checkout.Session): Promise<boolean> {
  if (!isTopupSession(session) || session.payment_status !== 'paid') return false;
  const userId = session.metadata?.user_id ?? session.client_reference_id ?? null;
  const pkg = await findTopupPackageById(Number(session.metadata?.package_id));
  if (userId === null || pkg === null) {
    // eslint-disable-next-line no-console
    console.error(
      `[stripe] paid top-up ${session.id} names no known user or package — not credited`,
    );
    return false;
  }
  const credited = await creditTopup(userId, pkg.tokens, session.id);
  if (!credited) return false;
  await recordPayment({
    userId,
    provider: 'stripe',
    externalId: session.id,
    kind: 'topup',
    amountMinor: session.amount_total ?? 0,
    currency: session.currency ?? CURRENCY,
    paidAt: new Date(session.created * 1000),
  }).catch((err: unknown) => {
    // eslint-disable-next-line no-console
    console.error(
      `[stripe] payment history write failed for ${session.id}:`,
      (err as Error).message,
    );
  });
  await sendPushNotification(userId, {
    // #1816 (the frontend, 11:30Z): the page with the plan and the balance.
    url: PAYMENT_PUSH_URL,
    title: 'Netai — ტოკენები დაემატა',
    body: `+${pkg.tokens} ტოკენი დაერიცხა შენს ბალანსს 🪙`,
  }).catch((err: unknown) => {
    // eslint-disable-next-line no-console
    console.error(`[stripe] top-up push failed for user ${userId}:`, (err as Error).message);
  });
  return true;
}
