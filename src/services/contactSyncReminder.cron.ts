import { sendDueSyncReminders } from './contactSyncReminder.service';

/**
 * BH: checked every 15 minutes, so each time zone's noon is caught; the claim
 * in sendDueSyncReminders keeps it to one push a month per person.
 */
const CHECK_EVERY_MS = 15 * 60 * 1000;

export function startContactSyncReminders(): void {
  const tick = (): void => {
    void sendDueSyncReminders()
      .then((n) => {
        // eslint-disable-next-line no-console
        if (n > 0) console.log(`[sync-reminder] ${n} monthly reminder(s) sent`);
      })
      .catch((err: unknown) =>
        // eslint-disable-next-line no-console
        console.error('[sync-reminder] sweep failed:', (err as Error).message),
      );
  };
  setInterval(tick, CHECK_EVERY_MS).unref();
}
