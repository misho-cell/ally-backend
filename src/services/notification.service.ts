import webpush, { PushSubscription } from 'web-push';
import { query } from '../db/postgres/client';
import { connectedDevices, deviceKey, hasActiveConnection } from './sse.service';

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
  /**
   * Ticket 17 row 6: what the browser says it is. Optional and never a reason
   * to refuse a subscription — a device we cannot name is still a device we
   * must be able to notify. It exists because `web.push.apple.com` serves
   * macOS Safari as well as iOS, so an Apple endpoint alone could not answer
   * "did the PHONE ever register", which is the whole of row 6.
   */
  user_agent?: string;
  /**
   * Row 6, the fix: the frontend's own name for this device, so the stream it
   * opens and the subscription it stores can be recognised as the same phone.
   * Optional — the user-agent answers the same question well enough without it.
   */
  device_id?: string;
}

/** Long enough for any real UA string; a guard against an absurd one. */
const MAX_USER_AGENT_CHARS = 400;

export interface NotificationPayload {
  title: string;
  body: string;
  url?: string;
}

export async function savePushSubscription(
  userId: string,
  subscription: PushSubscriptionPayload,
): Promise<void> {
  const bounded = (value: string | undefined): string | null =>
    typeof value === 'string' && value.trim() !== ''
      ? value.trim().slice(0, MAX_USER_AGENT_CHARS)
      : null;
  await query(
    `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, user_agent, device_id)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (endpoint) DO UPDATE
       SET user_id = EXCLUDED.user_id,
           p256dh  = EXCLUDED.p256dh,
           auth    = EXCLUDED.auth,
           -- A re-subscribe without these must not erase what we have.
           user_agent = COALESCE(EXCLUDED.user_agent, push_subscriptions.user_agent),
           device_id  = COALESCE(EXCLUDED.device_id,  push_subscriptions.device_id)`,
    [
      userId,
      subscription.endpoint,
      subscription.keys.p256dh,
      subscription.keys.auth,
      bounded(subscription.user_agent),
      bounded(subscription.device_id),
    ],
  );
}

/** A provider message, never user content; bounded so one library can't flood the table. */
const MAX_DELIVERY_ERROR_CHARS = 300;

/**
 * Ticket 17 row 6: one row per attempt.
 *
 * "Was it sent or did it fail" lived only in the Railway log, so answering it
 * needed log access and nothing could be answered about last week at all. That
 * is how row 6 stayed open: the phone showed nothing, and the product could not
 * say whether anything had been sent to it.
 *
 * Best-effort by construction — a diagnostic must never be able to fail the
 * notification it is describing.
 */
async function recordDelivery(
  userId: string,
  endpoint: string,
  status: 'sent' | 'failed' | 'skipped',
  statusCode: number | null,
  error: string | null,
): Promise<void> {
  try {
    await query(
      `INSERT INTO push_deliveries (user_id, endpoint, status, status_code, error)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        userId,
        endpoint,
        status,
        statusCode,
        error === null ? null : error.slice(0, MAX_DELIVERY_ERROR_CHARS),
      ],
    );
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[push] could not record delivery:', (err as Error).message);
  }
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
 * One switch back to the old rule (skip every device whenever the person has
 * any stream open). Read at call time so it means what it says the moment the
 * variable changes, without a deploy.
 */
function perDeviceOff(): boolean {
  return process.env.PUSH_PER_DEVICE === 'off';
}

interface SubscriptionRow {
  endpoint: string;
  p256dh: string;
  auth: string;
  user_agent: string | null;
  device_id: string | null;
}

/**
 * Whether the person is already watching ON THIS DEVICE — the only reason not
 * to send to it.
 *
 * A device that cannot be named keeps the old rule: any open stream means
 * somebody is here, do not interrupt them. That matters on the day this ships,
 * because every subscription stored before now has neither a device_id nor a
 * user-agent, and the alternative — treating „unknown" as away — would push to
 * the very screen the person is reading.
 */
function alreadyWatching(
  row: SubscriptionRow,
  live: ReadonlySet<string>,
  anyStreamOpen: boolean,
): boolean {
  const key = perDeviceOff() ? null : deviceKey(row.device_id, row.user_agent);
  return key === null ? anyStreamOpen : live.has(key);
}

/**
 * Every delivery decision is LOGGED — "sometimes it arrives" (Lika, 1 Sep)
 * was undiagnosable because failures other than a dead subscription (404/410)
 * were swallowed silently and successes wrote nothing. One line per endpoint:
 * sent, skipped, or failed with the push service's status code.
 *
 * Row 6: the „is this person away" decision lives HERE, once, and not in each
 * caller. It used to be asked before calling — `if (!hasActiveConnection(user))`
 * — which is one answer for a person who has several devices, and therefore the
 * wrong answer for all but one of them. Deciding per subscription is the only
 * place the question can be asked per device.
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

  const result = await query<SubscriptionRow>(
    `SELECT endpoint, p256dh, auth, user_agent, device_id
     FROM push_subscriptions WHERE user_id = $1`,
    [userId],
  );
  if (result.rows.length === 0) {
    // eslint-disable-next-line no-console
    console.log(`[push] user ${userId}: no subscriptions, nothing to send`);
    return;
  }

  const live = connectedDevices(userId);
  const anyStreamOpen = hasActiveConnection(userId);
  const staleEndpoints: string[] = [];

  await Promise.allSettled(
    result.rows.map(async (row) => {
      const subscription: PushSubscription = {
        endpoint: row.endpoint,
        keys: { p256dh: row.p256dh, auth: row.auth },
      };
      const label = endpointLabel(row.endpoint);

      if (alreadyWatching(row, live, anyStreamOpen)) {
        // eslint-disable-next-line no-console
        console.log(`[push] user ${userId}: skipped ${label}, this device is live`);
        await recordDelivery(userId, row.endpoint, 'skipped', null, 'device is live');
        return;
      }

      try {
        await webpush.sendNotification(subscription, JSON.stringify(payload));
        // eslint-disable-next-line no-console
        console.log(`[push] user ${userId}: sent via ${label}`);
        await recordDelivery(userId, row.endpoint, 'sent', null, null);
      } catch (err) {
        const statusCode = (err as { statusCode?: number }).statusCode;
        // eslint-disable-next-line no-console
        console.error(
          `[push] user ${userId}: FAILED via ${label} status=${statusCode ?? 'none'}: ` +
            `${(err as Error).message}`,
        );
        await recordDelivery(
          userId,
          row.endpoint,
          'failed',
          statusCode ?? null,
          (err as Error).message,
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
