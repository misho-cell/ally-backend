import { query } from '../db/postgres/client';
import { sendAiNotification } from './aiNotification.service';

const SEND_HOUR_UTC = 5; // 09:00 Georgian time (UTC+4)
const DELAY_BETWEEN_USERS_MS = 300;
/** 19:00 in Tbilisi: after this a restart does not start the walk again; the next 05:00 does. */
const SEND_DAY_END_HOUR_UTC = 15;
const WALK_QUERY_TIMEOUT_MS = 15_000;

/** #7921: is it the part of the day a walk cut short by a restart should go on in? */
export function insideSendDay(now: Date): boolean {
  const hour = now.getUTCHours();
  return hour >= SEND_HOUR_UTC && hour < SEND_DAY_END_HOUR_UTC;
}

function msUntilNextSendWindow(): number {
  const now = new Date();
  const next = new Date(now);
  next.setUTCHours(SEND_HOUR_UTC, 0, 0, 0);
  if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
  return next.getTime() - now.getTime();
}

async function runAiNotifications(): Promise<void> {
  // eslint-disable-next-line no-console
  console.log('[ai-notif-cron] Starting daily AI notification run');

  // #7921: by id from 05:00, 11.5k subscribers, the walk died at a restart and
  // the high ids were never reached. Only people a push can reach, longest
  // waiting first; a walk started again after a restart skips whoever already
  // got today's (the frequency check in sendAiNotification).
  const result = await query<{ id: string }>(
    `SELECT u.id::text AS id FROM "User" u
       LEFT JOIN ai_notification_settings s ON s.user_id = u.id::text
      WHERE u.subscription_status IN ('active', 'trialing')
        AND EXISTS (SELECT 1 FROM push_subscriptions p WHERE p.user_id = u.id)
      ORDER BY s.last_sent_at ASC NULLS FIRST, u.id`,
    [],
    WALK_QUERY_TIMEOUT_MS,
  );

  const userIds = result.rows.map((r) => r.id);
  // eslint-disable-next-line no-console
  console.log(`[ai-notif-cron] Processing ${userIds.length} subscriber(s)`);

  let sent = 0;
  let errors = 0;

  for (const userId of userIds) {
    try {
      await sendAiNotification(userId);
      sent++;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`[ai-notif-cron] Failed for user ${userId}:`, (err as Error).message);
      errors++;
    }
    await new Promise<void>((resolve) => setTimeout(resolve, DELAY_BETWEEN_USERS_MS));
  }

  // eslint-disable-next-line no-console
  console.log(`[ai-notif-cron] Done — processed: ${sent}, errors: ${errors}`);
}

export function startAiNotificationCron(): void {
  // Kill switch: the nudge job spends real model tokens per subscriber. Off
  // when explicitly disabled, and off when push can't be delivered anyway
  // (no VAPID keys) — generating teasers nobody receives is pure spend.
  if (process.env.AI_NOTIFICATIONS_ENABLED === 'false') {
    // eslint-disable-next-line no-console
    console.log('[ai-notif-cron] Disabled via AI_NOTIFICATIONS_ENABLED=false');
    return;
  }
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
    // eslint-disable-next-line no-console
    console.log('[ai-notif-cron] Disabled — VAPID keys not configured, pushes cannot deliver');
    return;
  }

  const scheduleNext = (): void => {
    const delay = msUntilNextSendWindow();
    const nextRun = new Date(Date.now() + delay);
    // eslint-disable-next-line no-console
    console.log(`[ai-notif-cron] Next run scheduled at ${nextRun.toISOString()}`);
    setTimeout(() => {
      void runAiNotifications().finally(scheduleNext);
    }, delay);
  };

  // eslint-disable-next-line no-console
  console.log('[ai-notif-cron] AI notification cron initialized (daily at 05:00 UTC)');
  // #7921: a restart inside the sending day picks the walk up again at once.
  if (insideSendDay(new Date())) void runAiNotifications();
  scheduleNext();
}
