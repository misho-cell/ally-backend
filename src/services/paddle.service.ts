import { EventName } from '@paddle/paddle-node-sdk';
import type {
  SubscriptionCreatedNotification,
  SubscriptionNotification,
  TransactionNotification,
} from '@paddle/paddle-node-sdk';
import paddle from '../config/paddle';
import { query } from '../db/postgres/client';
import { sendPushNotification } from './notification.service';

const PADDLE_WEBHOOK_SECRET = process.env.PADDLE_WEBHOOK_SECRET ?? '';

const PRICE_TIER_MAP: Record<string, string> = {
  pri_01kvq5da2w9fjgv7cn0eqqqk63: 'premium',
  pri_01kvq5fwfdj2p8j42p663mh3yr: 'pro',
  pri_01kvq5gjc8mb3kx2qhwp44mtkh: 'enterprise',
};

interface PaddleCustomData {
  user_id?: string;
}

function extractUserId(customData: unknown): string | null {
  if (!customData || typeof customData !== 'object') return null;
  return typeof (customData as PaddleCustomData).user_id === 'string'
    ? (customData as PaddleCustomData).user_id!
    : null;
}

function tierFromPriceId(priceId: string | null | undefined): string {
  return (priceId && PRICE_TIER_MAP[priceId]) ?? 'free';
}

async function findUserBySubscriptionId(subscriptionId: string): Promise<number | null> {
  const result = await query<{ id: number }>(
    `SELECT id FROM "User" WHERE paddle_subscription_id = $1 LIMIT 1`,
    [subscriptionId],
  );
  return result.rows[0]?.id ?? null;
}

async function handleSubscriptionCreated(sub: SubscriptionCreatedNotification): Promise<void> {
  const userId = extractUserId(sub.customData);
  if (!userId) {
    console.error('[paddle] subscription.created: missing user_id in customData', sub.id);
    return;
  }

  const priceId = sub.items[0]?.price?.id ?? null;
  const tier = tierFromPriceId(priceId);
  const trialEndsAt = sub.items[0]?.trialDates?.endsAt ?? null;

  await query(
    `UPDATE "User"
     SET subscription_tier      = $1,
         subscription_status    = $2,
         paddle_subscription_id = $3,
         paddle_customer_id     = $4,
         trial_ends_at          = $5,
         current_period_ends_at = $6,
         "updatedAt"            = NOW()
     WHERE id = $7`,
    [
      tier,
      sub.status,
      sub.id,
      sub.customerId,
      trialEndsAt,
      sub.currentBillingPeriod?.endsAt ?? null,
      userId,
    ],
  );
}

async function handleSubscriptionUpdated(sub: SubscriptionNotification): Promise<void> {
  const userId = await findUserBySubscriptionId(sub.id);
  if (!userId) {
    console.error('[paddle] subscription.updated: no user found for subscription', sub.id);
    return;
  }

  const priceId = sub.items[0]?.price?.id ?? null;
  const tier = tierFromPriceId(priceId);
  const trialEndsAt = sub.items[0]?.trialDates?.endsAt ?? null;

  await query(
    `UPDATE "User"
     SET subscription_tier      = $1,
         subscription_status    = $2,
         paddle_customer_id     = $3,
         trial_ends_at          = $4,
         current_period_ends_at = $5,
         "updatedAt"            = NOW()
     WHERE id = $6`,
    [
      tier,
      sub.status,
      sub.customerId,
      trialEndsAt,
      sub.currentBillingPeriod?.endsAt ?? null,
      userId,
    ],
  );
}

async function handleSubscriptionCanceled(sub: SubscriptionNotification): Promise<void> {
  const userId = await findUserBySubscriptionId(sub.id);
  if (!userId) {
    console.error('[paddle] subscription.canceled: no user found for subscription', sub.id);
    return;
  }

  await query(
    `UPDATE "User"
     SET subscription_status    = 'canceled',
         current_period_ends_at = $1,
         "updatedAt"            = NOW()
     WHERE id = $2`,
    [sub.currentBillingPeriod?.endsAt ?? null, userId],
  );
}

async function handleTransactionCompleted(txn: TransactionNotification): Promise<void> {
  if (!txn.subscriptionId) return;

  const userId = await findUserBySubscriptionId(txn.subscriptionId);
  if (!userId) return;

  await query(
    `UPDATE "User"
     SET subscription_status    = 'active',
         current_period_ends_at = $1,
         "updatedAt"            = NOW()
     WHERE id = $2`,
    [txn.billingPeriod?.endsAt ?? null, userId],
  );
}

async function handlePaymentFailed(txn: TransactionNotification): Promise<void> {
  if (!txn.subscriptionId) return;

  const userId = await findUserBySubscriptionId(txn.subscriptionId);
  if (!userId) return;

  await query(
    `UPDATE "User"
     SET subscription_status = 'past_due',
         "updatedAt"         = NOW()
     WHERE id = $1`,
    [userId],
  );

  await sendPushNotification(String(userId), {
    title: 'Ally — გადახდის პრობლემა',
    body: 'გადახდა ვერ განხორციელდა. განაახლე გადახდის მეთოდი.',
    url: '/settings',
  });
}

export async function processWebhookEvent(rawBody: string, signatureHeader: string): Promise<void> {
  const event = await paddle.webhooks.unmarshal(rawBody, PADDLE_WEBHOOK_SECRET, signatureHeader);
  if (!event) throw new Error('Invalid Paddle webhook signature');

  switch (event.eventType) {
    case EventName.SubscriptionCreated:
      await handleSubscriptionCreated(event.data as SubscriptionCreatedNotification);
      break;
    case EventName.SubscriptionUpdated:
      await handleSubscriptionUpdated(event.data as SubscriptionNotification);
      break;
    case EventName.SubscriptionCanceled:
      await handleSubscriptionCanceled(event.data as SubscriptionNotification);
      break;
    case EventName.TransactionCompleted:
      await handleTransactionCompleted(event.data as TransactionNotification);
      break;
    case EventName.TransactionPaymentFailed:
      await handlePaymentFailed(event.data as TransactionNotification);
      break;
    default:
      break;
  }
}

export async function createCustomerPortalSession(userId: string): Promise<string> {
  const result = await query<{
    paddle_customer_id: string | null;
    paddle_subscription_id: string | null;
  }>(`SELECT paddle_customer_id, paddle_subscription_id FROM "User" WHERE id = $1 LIMIT 1`, [
    userId,
  ]);

  const user = result.rows[0];
  if (!user?.paddle_customer_id) throw new Error('no_active_subscription');

  const subscriptionIds = user.paddle_subscription_id ? [user.paddle_subscription_id] : [];
  const session = await paddle.customerPortalSessions.create(
    user.paddle_customer_id,
    subscriptionIds,
  );

  const urls = (session as unknown as { urls: { general: { overview: string } } }).urls;
  const url = urls?.general?.overview;
  if (!url) throw new Error('Failed to get portal URL from Paddle');
  return url;
}
