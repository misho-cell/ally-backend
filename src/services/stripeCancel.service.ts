import Stripe from 'stripe';
import { query } from '../db/postgres/client';
import { applySubscription, isOurPrice, stripeClient, subscriptionFacts } from './stripe.service';

/**
 * Team task #497 — Ninia, 2 October: she could not find how to cancel her
 * plan. The profile sent her to Stripe's own billing page, which offered no
 * cancellation (that is a dashboard setting nobody had switched on) and
 * called the product „Ally".
 *
 * So cancelling no longer depends on Stripe's page at all: the profile asks
 * the server, the server sets the subscription to end at the close of the paid
 * period (never at once — what was paid for is kept), writes Stripe's answer
 * onto the account straight away, and says until which date the plan runs.
 * Undoing it is the same call the other way.
 *
 * A plan the team GRANTED has no Stripe subscription and nothing to cancel;
 * that is reported as such, not as an error.
 */
const QUERY_TIMEOUT_MS = 10_000;
const CANCELLABLE: ReadonlySet<string> = new Set(['trialing', 'active', 'past_due']);

export enum CancelRefusal {
  NoPaidPlan = 'no_paid_plan',
}

export type CancelOutcome =
  | {
      readonly ok: true;
      readonly cancel_at_period_end: boolean;
      readonly runs_until: string | null;
    }
  | { readonly ok: false; readonly refusal: CancelRefusal };

async function customerOf(userId: string): Promise<string | null> {
  const result = await query<{ stripeCustomerId: string | null }>(
    'SELECT "stripeCustomerId" FROM "User" WHERE id = $1 AND "deletedAt" IS NULL',
    [userId],
    QUERY_TIMEOUT_MS,
  );
  return result.rows[0]?.stripeCustomerId ?? null;
}

/** This account's live subscription to OUR price, if it has one. */
async function ourLiveSubscription(customerId: string): Promise<Stripe.Subscription | null> {
  const list = await stripeClient().subscriptions.list({ customer: customerId, status: 'all' });
  return list.data.find((s) => isOurPrice(s) && CANCELLABLE.has(s.status)) ?? null;
}

/** End the paid plan at the close of its period (true), or keep it renewing (false). */
export async function setPlanEndsAtPeriodEnd(
  userId: string,
  endAtPeriodEnd: boolean,
): Promise<CancelOutcome> {
  const customerId = await customerOf(userId);
  if (customerId === null) return { ok: false, refusal: CancelRefusal.NoPaidPlan };
  const live = await ourLiveSubscription(customerId);
  if (live === null) return { ok: false, refusal: CancelRefusal.NoPaidPlan };
  const updated = await stripeClient().subscriptions.update(live.id, {
    cancel_at_period_end: endAtPeriodEnd,
  });
  // Written now, not when the webhook arrives: the profile reloads at once.
  await applySubscription(updated);
  const facts = subscriptionFacts(updated);
  const runsUntil = facts.cancels_at ?? facts.current_period_ends_at;
  return {
    ok: true,
    cancel_at_period_end: facts.cancel_at_period_end,
    runs_until: runsUntil === null ? null : runsUntil.toISOString(),
  };
}
