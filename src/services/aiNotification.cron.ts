import { query } from '../db/postgres/client';
import { sendAiNotification } from './aiNotification.service';

const SEND_HOUR_UTC = 5; // 09:00 Georgian time (UTC+4)
const DELAY_BETWEEN_USERS_MS = 300;

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

  const result = await query<{ id: string }>(
    `SELECT id::text AS id FROM "User"
     WHERE subscription_status IN ('active', 'trialing')
     ORDER BY id`,
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
  scheduleNext();
}
