import Stripe from 'stripe';
import { query } from '../db/postgres/client';
import { phoneDigits } from './phone';

// Stripe subscriptions (2 Sep, the founder's brief): $19.99/month, a 5-day
// trial with the card collected up front, no charge during the trial, then
// automatic monthly renewal until cancelled. Access follows the subscription
// status; the Customer Portal handles card changes and cancellation.
//
// Everything downstream in this codebase already reads User.subscription_status
// and User.subscription_tier, so this module's whole job is to keep those two
// columns true to Stripe — it changes no access rule anywhere else.

const STRIPE_TIMEOUT_MS = 20_000;
const TRIAL_DAYS = Number(process.env.STRIPE_TRIAL_DAYS ?? 5);
const PRICE_ID = process.env.STRIPE_PRICE_ID ?? '';
// The founder's ruling: this price grants PREMIUM.
const TIER = process.env.STRIPE_TIER ?? 'premium';
const APP_URL = process.env.STRIPE_APP_URL ?? 'https://netai.guru';

/**
 * Statuses that mean "this person may use the product".
 *
 * `past_due` is deliberately included. The founder's ruling was that a failed
 * payment should let the person try again — Stripe retries the card on its own
 * schedule and the portal lets them fix it, and cutting access off mid-retry
 * would punish a expired card as if it were a cancellation. Access ends when
 * Stripe gives up: `canceled` or `unpaid`.
 */
const ACTIVE_STATUSES: ReadonlySet<string> = new Set(['trialing', 'active', 'past_due']);

let client: Stripe | null = null;

export function stripeClient(): Stripe {
  if (client === null) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error('STRIPE_SECRET_KEY is not set');
    client = new Stripe(key, { timeout: STRIPE_TIMEOUT_MS });
  }
  return client;
}

export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY) && PRICE_ID !== '';
}

/**
 * Is this event about OUR product?
 *
 * The Stripe account is shared: it carries 10 live $1.99/month subscriptions
 * on other price ids, belonging to a different product entirely. Their events
 * arrive at our endpoint too. Without this filter we would be reading — and
 * potentially acting on — other people's billing.
 */
function isOurPrice(subscription: Stripe.Subscription): boolean {
  return subscription.items.data.some((item) => item.price.id === PRICE_ID);
}

interface UserRow {
  id: number;
  phone: string | null;
}

async function findUserById(userId: string): Promise<UserRow | null> {
  const result = await query<UserRow>(
    `SELECT u.id, (SELECT phone FROM "UserPhone" WHERE "userId" = u.id ORDER BY id LIMIT 1) AS phone
     FROM "User" u WHERE u.id = $1 AND u."deletedAt" IS NULL`,
    [userId],
    STRIPE_TIMEOUT_MS,
  );
  return result.rows[0] ?? null;
}

/** Has this person already had their one trial? Keyed by phone, per migration 104. */
export async function hasConsumedTrial(phone: string | null): Promise<boolean> {
  const digits = phoneDigits(phone ?? '');
  if (!digits) return false;
  const result = await query<{ phone_digits: string }>(
    'SELECT phone_digits FROM stripe_trial_consumed WHERE phone_digits = $1',
    [digits],
    STRIPE_TIMEOUT_MS,
  );
  return result.rows.length > 0;
}

async function markTrialConsumed(phone: string | null, subscriptionId: string): Promise<void> {
  const digits = phoneDigits(phone ?? '');
  if (!digits) return;
  await query(
    `INSERT INTO stripe_trial_consumed (phone_digits, subscription_id) VALUES ($1, $2)
     ON CONFLICT (phone_digits) DO NOTHING`,
    [digits, subscriptionId],
    STRIPE_TIMEOUT_MS,
  );
}

/**
 * The Stripe customer for this account, created once and remembered.
 * The user id rides in metadata so a webhook can find its way back even if
 * our own column were ever lost.
 */
async function ensureCustomer(userId: string): Promise<string> {
  const existing = await query<{ stripeCustomerId: string | null }>(
    'SELECT "stripeCustomerId" FROM "User" WHERE id = $1',
    [userId],
    STRIPE_TIMEOUT_MS,
  );
  const current = existing.rows[0]?.stripeCustomerId;
  if (current) return current;

  const customer = await stripeClient().customers.create({
    metadata: { user_id: String(userId) },
  });
  await query(
    'UPDATE "User" SET "stripeCustomerId" = $1, "updatedAt" = NOW() WHERE id = $2',
    [customer.id, userId],
    STRIPE_TIMEOUT_MS,
  );
  return customer.id;
}

export interface CheckoutResult {
  url: string;
  trial_days: number;
}

/**
 * The subscribe flow: a Checkout Session that collects the card, starts the
 * trial, and charges nothing until it ends.
 */
export async function createCheckoutSession(userId: string): Promise<CheckoutResult> {
  const user = await findUserById(userId);
  if (!user) throw new Error('No such account.');

  const customerId = await ensureCustomer(userId);
  // One trial per person, ever (the founder's ruling). A returning account
  // subscribes at full price from day one rather than getting five more days.
  const trialDays = (await hasConsumedTrial(user.phone)) ? 0 : TRIAL_DAYS;

  const session = await stripeClient().checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    line_items: [{ price: PRICE_ID, quantity: 1 }],
    subscription_data: {
      ...(trialDays > 0 && { trial_period_days: trialDays }),
      metadata: { user_id: String(userId) },
    },
    // The card is taken up front even though the trial charges nothing —
    // that is the point of the trial design.
    payment_method_collection: 'always',
    success_url: `${APP_URL}/chat?checkout=success`,
    cancel_url: `${APP_URL}/pricing`,
    client_reference_id: String(userId),
  });

  if (!session.url) throw new Error('Stripe returned no checkout URL.');
  return { url: session.url, trial_days: trialDays };
}

/** Manage Subscription: card, invoices and cancellation all live in Stripe's portal. */
export async function createPortalSession(userId: string): Promise<{ url: string }> {
  const existing = await query<{ stripeCustomerId: string | null }>(
    'SELECT "stripeCustomerId" FROM "User" WHERE id = $1 AND "deletedAt" IS NULL',
    [userId],
    STRIPE_TIMEOUT_MS,
  );
  const customerId = existing.rows[0]?.stripeCustomerId;
  if (!customerId) throw new Error('This account has no Stripe customer yet.');

  const session = await stripeClient().billingPortal.sessions.create({
    customer: customerId,
    return_url: `${APP_URL}/profile`,
  });
  return { url: session.url };
}

function periodEnd(subscription: Stripe.Subscription): Date | null {
  const item = subscription.items.data[0];
  const end = item?.current_period_end;
  return typeof end === 'number' ? new Date(end * 1000) : null;
}

/**
 * Write Stripe's truth onto the account.
 *
 * Deliberately never touches an account Stripe does not know about. During the
 * migration the founder is moving existing subscribers over by hand, and there
 * are people whose access was granted manually and who have no Stripe record
 * at all — this must not be the thing that takes it away from them.
 */
async function applySubscription(subscription: Stripe.Subscription): Promise<void> {
  if (!isOurPrice(subscription)) return;

  const userId =
    subscription.metadata?.user_id ??
    (await findUserIdByCustomer(
      typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id,
    ));
  if (!userId) {
    // eslint-disable-next-line no-console
    console.error(`[stripe] subscription ${subscription.id} matches no account — ignored`);
    return;
  }

  const active = ACTIVE_STATUSES.has(subscription.status);
  const trialEnd = subscription.trial_end ? new Date(subscription.trial_end * 1000) : null;

  await query(
    `UPDATE "User"
     SET subscription_status    = $1,
         subscription_tier      = CASE WHEN $2 THEN $3 ELSE subscription_tier END,
         trial_ends_at          = $4,
         current_period_ends_at = $5,
         "updatedAt"            = NOW()
     WHERE id = $6`,
    [subscription.status, active, TIER, trialEnd, periodEnd(subscription), userId],
    STRIPE_TIMEOUT_MS,
  );

  if (subscription.status === 'trialing') {
    const user = await findUserById(userId);
    await markTrialConsumed(user?.phone ?? null, subscription.id);
  }
}

async function findUserIdByCustomer(customerId: string): Promise<string | null> {
  const result = await query<{ id: number }>(
    'SELECT id FROM "User" WHERE "stripeCustomerId" = $1 AND "deletedAt" IS NULL LIMIT 1',
    [customerId],
    STRIPE_TIMEOUT_MS,
  );
  const id = result.rows[0]?.id;
  return id === undefined ? null : String(id);
}

export interface WebhookOutcome {
  handled: boolean;
  type: string;
}

/**
 * One entry point for every Stripe event we subscribe to. The signature is
 * verified by the caller; this only decides what an event means.
 */
export async function handleStripeEvent(event: Stripe.Event): Promise<WebhookOutcome> {
  switch (event.type) {
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      await applySubscription(event.data.object);
      return { handled: true, type: event.type };
    }
    case 'checkout.session.completed': {
      const session = event.data.object;
      const subscriptionId =
        typeof session.subscription === 'string' ? session.subscription : session.subscription?.id;
      if (!subscriptionId) return { handled: false, type: event.type };
      // Re-read rather than trust the session: the subscription object is the
      // one that carries status, trial end and period end.
      const subscription = await stripeClient().subscriptions.retrieve(subscriptionId);
      await applySubscription(subscription);
      return { handled: true, type: event.type };
    }
    case 'invoice.paid':
    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice & { subscription?: string | null };
      const subscriptionId = invoice.subscription;
      if (typeof subscriptionId !== 'string') return { handled: false, type: event.type };
      const subscription = await stripeClient().subscriptions.retrieve(subscriptionId);
      await applySubscription(subscription);
      return { handled: true, type: event.type };
    }
    default:
      return { handled: false, type: event.type };
  }
}

/**
 * Cancel whatever this customer is paying for (ticket 9 task 31.1).
 *
 * Called when an account is erased. Deleting your account has to stop your
 * billing: continuing to charge someone who asked to be forgotten is the worst
 * shape this bug could take, and "we only cleared our own column" would not be
 * an answer.
 *
 * Best-effort by construction — the caller must never fail an erasure because
 * Stripe was unreachable. It returns how many subscriptions it ended so the
 * erasure report can say so honestly, and logs what it could not do.
 */
export async function cancelSubscriptionsForCustomer(customerId: string): Promise<number> {
  if (!isStripeConfigured()) return 0;
  let cancelled = 0;
  try {
    const subscriptions = await stripeClient().subscriptions.list({
      customer: customerId,
      status: 'all',
    });
    for (const subscription of subscriptions.data) {
      if (!ACTIVE_STATUSES.has(subscription.status)) continue;
      await stripeClient().subscriptions.cancel(subscription.id);
      cancelled++;
    }
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(
      `[stripe] could not cancel subscriptions for ${customerId}:`,
      (error as Error).message,
    );
  }
  return cancelled;
}

/** Verify the signature and parse — a body that fails this never reaches the handler. */
export function constructEvent(rawBody: Buffer, signature: string): Stripe.Event {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new Error('STRIPE_WEBHOOK_SECRET is not set');
  return stripeClient().webhooks.constructEvent(rawBody, signature, secret);
}
