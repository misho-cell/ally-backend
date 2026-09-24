import type Stripe from 'stripe';
import { query } from '../db/postgres/client';
import {
  isOurPrice,
  isStripeConfigured,
  stripeClient,
  subscriptionFacts,
  type SubscriptionFacts,
} from './stripe.service';

/**
 * WHAT STRIPE SAYS, AGAINST WHAT THE COLUMN SAYS. Reads both. Writes neither.
 *
 * ════════ THE HOLE THIS EXISTS TO MEASURE ════════
 *
 * Row 248: "after cancelling a subscription, Netai still says automatic
 * payment". The cause was found and fixed — a cancel-at-period-end moves none
 * of the values Stripe normally moves, it leaves the status at `trialing` or
 * `active` and raises a flag instead — so `cancel_at_period_end` and
 * `cancels_at` were added and are now written on every subscription event.
 *
 * That fixes every cancellation from the day it shipped. It fixes NOTHING that
 * had already happened, because the columns are only written when an event
 * arrives, and for a cancel-at-period-end the next event is at the period end
 * — the day the subscription actually stops. Account 4511 cancelled on 21
 * September and reads `cancel_at_period_end = false` today.
 *
 * So the person the row was reported for is still seeing the bug, the fix is
 * real, and both of those are true at once. That is the shape this codebase
 * keeps meeting: BUILT, DEPLOYED and VERIFIED are three facts, and here a
 * fourth is missing — the state that existed before the fix.
 *
 * ════════ WHY IT WRITES NOTHING ════════
 *
 * Writing Stripe's truth onto 82 accounts is an admin operation on live data
 * (D44) and it needs the register entry and a yes first. This answers the
 * question that decision depends on — HOW MANY ROWS ARE ACTUALLY WRONG — and
 * that question needs no permission at all. Answering it first also stops the
 * backfill being built for a problem that turns out to be one row.
 *
 * It also settles a "cannot tell" I reported to the tester this morning: 4511
 * reads false, and I could not say from here whether the cancellation was
 * undone on Stripe's side or whether no event had arrived since the column
 * existed. Those are different facts and this tells them apart.
 *
 * ════════ THE STRIPE ACCOUNT IS SHARED, AND THAT IS A TRAP ════════
 *
 * It carries live subscriptions on other price ids belonging to a DIFFERENT
 * PRODUCT. `isOurPrice` is applied to every subscription read here, exactly as
 * the webhook applies it. Without it this check would report drift on other
 * people's billing — the same fault as counting another product's registrations
 * as ours, which happened twice in one evening on 23 September.
 */

/** 82 accounts carry a Stripe customer today; the ceiling is for the day that grows. */
const MAX_ACCOUNTS = 200;
const DEFAULT_ACCOUNTS = 100;
const RECONCILE_QUERY_TIMEOUT_MS = 15_000;

/** What the columns hold. Dates come back as ISO strings so they compare as text. */
interface StoredRow {
  readonly user_id: number;
  readonly name: string | null;
  readonly customer_id: string;
  readonly subscription_status: string | null;
  readonly cancel_at_period_end: boolean | null;
  readonly cancels_at: Date | null;
  readonly current_period_ends_at: Date | null;
}

export interface SubscriptionDrift {
  readonly user_id: number;
  /** D159(3): a document for the founder names people, not record ids. Both here. */
  readonly name: string | null;
  readonly differs: readonly string[];
  readonly stored: {
    readonly status: string | null;
    readonly cancel_at_period_end: boolean | null;
    readonly cancels_at: string | null;
  };
  readonly live: {
    readonly status: string;
    readonly cancel_at_period_end: boolean;
    readonly cancels_at: string | null;
  } | null;
}

export interface DriftReport {
  readonly checked: number;
  readonly agreed: number;
  /** Customers whose only live subscriptions belong to the other product. */
  readonly not_our_price: number;
  /** Named, never swallowed: an account I could not read is not an account that agrees. */
  readonly unreadable: readonly { readonly user_id: number; readonly why: string }[];
  readonly drifted: readonly SubscriptionDrift[];
  readonly note: string;
}

const NOTE =
  'READ ONLY — nothing here was written. A drift means the column has not been ' +
  'told about a change Stripe already made; the commonest cause is a ' +
  'cancel-at-period-end that happened before those columns existed, whose next ' +
  'event is the day the subscription ends. Only subscriptions on our own price ' +
  'id are read: the Stripe account is shared with another product.';

async function storedRows(limit: number): Promise<StoredRow[]> {
  const result = await query<StoredRow>(
    `SELECT u.id                     AS user_id,
            u.name,
            u."stripeCustomerId"     AS customer_id,
            u.subscription_status,
            u.cancel_at_period_end,
            u.cancels_at,
            u.current_period_ends_at
       FROM "User" u
      WHERE u."stripeCustomerId" IS NOT NULL
        AND u."deletedAt" IS NULL
      ORDER BY u.id
      LIMIT $1`,
    [limit],
    RECONCILE_QUERY_TIMEOUT_MS,
  );
  return result.rows;
}

/**
 * The one live subscription of OUR price for this customer, or null.
 *
 * `status: 'all'` on purpose: a cancelled subscription still has to be read,
 * because "Stripe says cancelled and the column says active" is precisely the
 * drift worth finding. The newest wins if a customer has resubscribed.
 */
async function liveSubscription(customerId: string): Promise<Stripe.Subscription | null> {
  const list = await stripeClient().subscriptions.list({
    customer: customerId,
    status: 'all',
    limit: 10,
  });
  const ours = list.data.filter(isOurPrice);
  if (ours.length === 0) return null;
  return ours.reduce((newest, one) => (one.created > newest.created ? one : newest));
}

function isoOrNull(value: Date | null): string | null {
  return value === null ? null : value.toISOString();
}

/**
 * Statuses that CLAIM ACCESS. A row holding one of these is asserting that the
 * person may use the product, and that assertion has to be backed by a live
 * subscription. Anything else — `inactive`, `canceled`, `unpaid`, null — is a
 * row claiming nothing, which nothing can contradict.
 */
const CLAIMS_ACCESS: ReadonlySet<string> = new Set(['trialing', 'active', 'past_due']);

/**
 * Which of the three values disagree.
 *
 * `current_period_ends_at` is deliberately NOT compared. It moves on every
 * renewal without any event being missed, so it would mark most of the base as
 * drifted and bury the rows that matter — a check that cries on everything is
 * a check nobody reads, which is the lesson of the outage monitor's quiet
 * hours.
 *
 * ⚠️ AND THE FIRST RUN OF THIS CHECK WAS EXACTLY THAT CHECK. It called every
 * customer with no subscription on our price a drift, and printed 78 of 82
 * accounts as faults. Seventy-four of them are stored `inactive` — a customer
 * record was created, the person never subscribed, and `inactive` beside no
 * subscription is not a disagreement, it is the two sources agreeing.
 *
 * Having a Stripe customer id is not having a subscription. The row is only
 * wrong when it CLAIMS ACCESS that Stripe does not back, and the paragraph
 * above about crying on everything was written three hours before the code
 * below did it.
 */
function differences(stored: StoredRow, live: SubscriptionFacts | null): string[] {
  if (live === null) {
    const status = stored.subscription_status ?? '';
    return CLAIMS_ACCESS.has(status)
      ? [`stored ${status} — but stripe has no subscription on our price`]
      : [];
  }
  const differs: string[] = [];
  if ((stored.subscription_status ?? '') !== live.status) {
    differs.push(`status: stored ${stored.subscription_status ?? 'null'}, stripe ${live.status}`);
  }
  if ((stored.cancel_at_period_end ?? false) !== live.cancel_at_period_end) {
    differs.push(
      `cancel_at_period_end: stored ${String(stored.cancel_at_period_end ?? false)}, ` +
        `stripe ${String(live.cancel_at_period_end)}`,
    );
  }
  if (isoOrNull(stored.cancels_at) !== isoOrNull(live.cancels_at)) {
    differs.push(
      `cancels_at: stored ${isoOrNull(stored.cancels_at) ?? 'null'}, ` +
        `stripe ${isoOrNull(live.cancels_at) ?? 'null'}`,
    );
  }
  return differs;
}

function describe(
  stored: StoredRow,
  live: SubscriptionFacts | null,
  differs: string[],
): SubscriptionDrift {
  return {
    user_id: stored.user_id,
    name: stored.name,
    differs,
    stored: {
      status: stored.subscription_status,
      cancel_at_period_end: stored.cancel_at_period_end,
      cancels_at: isoOrNull(stored.cancels_at),
    },
    live:
      live === null
        ? null
        : {
            status: live.status,
            cancel_at_period_end: live.cancel_at_period_end,
            cancels_at: isoOrNull(live.cancels_at),
          },
  };
}

/**
 * Compare every account that has a Stripe customer. Never throws for one
 * account: a customer Stripe will not answer for is recorded as unreadable and
 * the rest are still checked, because "I could not look at one" must not be
 * able to hide the other eighty-one.
 */
export async function subscriptionDrift(limit = DEFAULT_ACCOUNTS): Promise<DriftReport> {
  if (!isStripeConfigured()) {
    throw new Error('Stripe is not configured on this server, so nothing can be compared');
  }

  const rows = await storedRows(Math.min(Math.max(limit, 1), MAX_ACCOUNTS));
  const drifted: SubscriptionDrift[] = [];
  const unreadable: { user_id: number; why: string }[] = [];
  let agreed = 0;
  let notOurPrice = 0;

  for (const stored of rows) {
    try {
      const subscription = await liveSubscription(stored.customer_id);
      const live = subscription === null ? null : subscriptionFacts(subscription);
      if (live === null) notOurPrice += 1;

      const differs = differences(stored, live);
      if (differs.length === 0) agreed += 1;
      else drifted.push(describe(stored, live, differs));
    } catch (err) {
      unreadable.push({ user_id: stored.user_id, why: (err as Error).message.slice(0, 160) });
    }
  }

  return {
    checked: rows.length,
    agreed,
    not_our_price: notOurPrice,
    unreadable,
    drifted,
    note: NOTE,
  };
}
