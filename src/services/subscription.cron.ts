import { query } from '../db/postgres/client';

const CRON_INTERVAL_MS = 5 * 60 * 60 * 1000; // 5 hours
/**
 * 4295 (plate NEW-4): the first run waited the full five hours, and the
 * server is deployed far more often than that — so a restart always came
 * first and ended trials were never handled. The first run now comes soon
 * after start; the update is idempotent, so a run of deploys is harmless.
 */
export const FIRST_RUN_AFTER_START_MS = 2 * 60 * 1000;

async function downgradeExpired(): Promise<void> {
  const result = await query(
    `UPDATE "User"
     SET subscription_tier      = 'free',
         subscription_status    = 'inactive',
         paddle_subscription_id = NULL,
         paddle_customer_id     = NULL,
         trial_ends_at          = NULL,
         current_period_ends_at = NULL,
         "updatedAt"            = NOW()
     WHERE
       (subscription_status = 'trialing'  AND trial_ends_at          <= NOW())
       OR
       (subscription_status IN ('active', 'canceled', 'past_due')
        AND current_period_ends_at IS NOT NULL
        AND current_period_ends_at <= NOW())`,
  );
  // eslint-disable-next-line no-console
  console.log(`[subscription-cron] downgraded ${result.rowCount ?? 0} expired subscription(s)`);
}

export function startSubscriptionCron(): void {
  const run = async (): Promise<void> => {
    try {
      await downgradeExpired();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[subscription-cron] error:', err);
    }
    setTimeout(() => void run(), CRON_INTERVAL_MS).unref();
  };

  // eslint-disable-next-line no-console
  console.log('[subscription-cron] Cron started (2 min after start, then every 5h)');
  setTimeout(() => void run(), FIRST_RUN_AFTER_START_MS).unref();
}
