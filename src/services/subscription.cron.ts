import { query } from '../db/postgres/client';

const CRON_INTERVAL_MS = 5 * 60 * 60 * 1000; // 5 hours

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
    setTimeout(() => void run(), CRON_INTERVAL_MS);
  };

  // eslint-disable-next-line no-console
  console.log('[subscription-cron] Daily cron started (5h interval)');
  setTimeout(() => void run(), CRON_INTERVAL_MS);
}
