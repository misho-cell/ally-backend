import { claimDueReminders, deliverReminder } from './ownerReminders.service';

/**
 * #502: every twenty seconds, the owners' reminders whose time has come. One
 * reminder's failure never stops the next; a claimed reminder is not retried,
 * so a failure is logged rather than sent twice.
 */
const SWEEP_EVERY_MS = 20_000;

export async function sweepOwnerReminders(): Promise<void> {
  const due = await claimDueReminders();
  for (const reminder of due) {
    await deliverReminder(reminder).catch((err: unknown) =>
      // eslint-disable-next-line no-console
      console.error(`[reminder] ${reminder.id} not delivered:`, (err as Error).message),
    );
  }
  if (due.length > 0) {
    // eslint-disable-next-line no-console
    console.log(`[reminder] ${due.length} reminder(s) delivered`);
  }
}

export function startOwnerReminders(): void {
  const tick = (): void => {
    void sweepOwnerReminders()
      .catch((err: unknown) =>
        // eslint-disable-next-line no-console
        console.error('[reminder] sweep failed:', (err as Error).message),
      )
      .then(() => {
        setTimeout(tick, SWEEP_EVERY_MS).unref();
      });
  };
  setTimeout(tick, SWEEP_EVERY_MS).unref();
}
