import { query } from '../db/postgres/client';
import {
  SYNC_REMINDER_DAYS,
  SYNC_REMINDER_LOCAL_HOUR,
  syncReminderPush,
} from './contactSyncReminder';
import { sendPushNotification } from './notification.service';
import { DEFAULT_PUSH_TIME_ZONE } from './pushQuietHours';
import { userLanguage } from './threads.service';

const QUERY_TIMEOUT_MS = 8_000;
/** At most this many people are rung in one sweep; the rest wait for the next. */
const MAX_PER_SWEEP = 200;

/**
 * BH: the people due a reminder now, claimed in one statement so two
 * processes never ring the same person: the switch is on, the last real import
 * is over a month old, the last reminder too (or there was none), and one of
 * their devices reads noon. A person who never imported is not reminded —
 * there is nothing to sync again.
 */
async function claimDueReminders(): Promise<number[]> {
  const result = await query<{ id: number }>(
    `UPDATE "User" u SET contact_import_reminded_at = NOW()
      WHERE u.id IN (
        SELECT u2.id FROM "User" u2
         WHERE u2.contact_import_reminder
           AND (u2.contact_import_reminded_at IS NULL
                OR u2.contact_import_reminded_at < NOW() - make_interval(days => $1))
           AND (SELECT MAX(ia.created_at) FROM import_attempts ia
                 WHERE ia.user_id = u2.id AND ia.imported > 0 AND NOT ia.in_progress)
               < NOW() - make_interval(days => $1)
           AND EXISTS (
             SELECT 1 FROM push_subscriptions ps
              WHERE ps.user_id = u2.id
                AND EXTRACT(HOUR FROM NOW() AT TIME ZONE COALESCE(ps.time_zone, $2)) = $3)
         LIMIT $4)
      RETURNING u.id`,
    [SYNC_REMINDER_DAYS, DEFAULT_PUSH_TIME_ZONE, SYNC_REMINDER_LOCAL_HOUR, MAX_PER_SWEEP],
    QUERY_TIMEOUT_MS,
  );
  return result.rows.map((row) => Number(row.id));
}

/** One sweep: ring everyone due, each in their own language. Returns how many were rung. */
export async function sendDueSyncReminders(): Promise<number> {
  const due = await claimDueReminders();
  let rung = 0;
  for (const userId of due) {
    try {
      const language = await userLanguage(String(userId));
      await sendPushNotification(String(userId), syncReminderPush(language));
      rung += 1;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`[sync-reminder] user ${userId}:`, (err as Error).message);
    }
  }
  return rung;
}
