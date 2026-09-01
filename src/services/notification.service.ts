import webpush, { PushSubscription } from 'web-push';
import { query } from '../db/postgres/client';

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY ?? '';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY ?? '';
const VAPID_SUBJECT = process.env.VAPID_SUBJECT ?? 'mailto:support@netai.guru';

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

export interface PushSubscriptionKeys {
  p256dh: string;
  auth: string;
}

export interface PushSubscriptionPayload {
  endpoint: string;
  keys: PushSubscriptionKeys;
}

export interface NotificationPayload {
  title: string;
  body: string;
  url?: string;
}

export async function savePushSubscription(
  userId: string,
  subscription: PushSubscriptionPayload,
): Promise<void> {
  await query(
    `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (endpoint) DO UPDATE
       SET user_id = EXCLUDED.user_id,
           p256dh  = EXCLUDED.p256dh,
           auth    = EXCLUDED.auth`,
    [userId, subscription.endpoint, subscription.keys.p256dh, subscription.keys.auth],
  );
}

export async function deletePushSubscription(userId: string, endpoint: string): Promise<void> {
  await query(`DELETE FROM push_subscriptions WHERE user_id = $1 AND endpoint = $2`, [
    userId,
    endpoint,
  ]);
}

// Log identifier for an endpoint without the endpoint itself (it embeds a
// per-device token): the push service's host says WHICH lane (APNs, FCM),
// the tail is enough to tell two devices apart.
const ENDPOINT_TAIL_CHARS = 8;

function endpointLabel(endpoint: string): string {
  let host = 'unknown-host';
  try {
    host = new URL(endpoint).host;
  } catch {
    // keep the fallback label — a malformed endpoint is itself worth seeing
  }
  return `${host}…${endpoint.slice(-ENDPOINT_TAIL_CHARS)}`;
}

/**
 * Every delivery decision is LOGGED — "sometimes it arrives" (Lika, 1 Sep)
 * was undiagnosable because failures other than a dead subscription (404/410)
 * were swallowed silently and successes wrote nothing. One line per endpoint:
 * sent, or failed with the push service's status code.
 */
export async function sendPushNotification(
  userId: string,
  payload: NotificationPayload,
): Promise<void> {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    // eslint-disable-next-line no-console
    console.error('[push] VAPID keys missing — push disabled');
    return;
  }

  const result = await query<{ endpoint: string; p256dh: string; auth: string }>(
    `SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = $1`,
    [userId],
  );
  if (result.rows.length === 0) {
    // eslint-disable-next-line no-console
    console.log(`[push] user ${userId}: no subscriptions, nothing to send`);
    return;
  }

  const staleEndpoints: string[] = [];

  await Promise.allSettled(
    result.rows.map(async (row) => {
      const subscription: PushSubscription = {
        endpoint: row.endpoint,
        keys: { p256dh: row.p256dh, auth: row.auth },
      };
      const label = endpointLabel(row.endpoint);

      try {
        await webpush.sendNotification(subscription, JSON.stringify(payload));
        // eslint-disable-next-line no-console
        console.log(`[push] user ${userId}: sent via ${label}`);
      } catch (err) {
        const statusCode = (err as { statusCode?: number }).statusCode;
        // eslint-disable-next-line no-console
        console.error(
          `[push] user ${userId}: FAILED via ${label} status=${statusCode ?? 'none'}: ` +
            `${(err as Error).message}`,
        );
        if (statusCode === 404 || statusCode === 410) {
          staleEndpoints.push(row.endpoint);
        }
      }
    }),
  );

  if (staleEndpoints.length > 0) {
    // eslint-disable-next-line no-console
    console.log(`[push] user ${userId}: pruned ${staleEndpoints.length} dead subscription(s)`);
    await Promise.allSettled(
      staleEndpoints.map((endpoint) => deletePushSubscription(userId, endpoint)),
    );
  }
}

export function getVapidPublicKey(): string {
  return VAPID_PUBLIC_KEY;
}
