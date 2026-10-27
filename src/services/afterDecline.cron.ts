import { runAfterDecline } from './afterDecline.service';

/**
 * #8086: the day-after conversation with a helper who declined goes once a
 * day, at 10:00 UTC (14:00 in Tbilisi), so it never lands in quiet hours.
 * Checked hourly; one run per UTC day per process.
 */
const CHECK_EVERY_MS = 60 * 60 * 1000;
const AFTER_DECLINE_HOUR_UTC = 10;

let lastRunDay: string | null = null;

/** Should the run go now? Once, in its hour, per UTC day. */
export function isAfterDeclineHour(now: Date, lastDay: string | null): boolean {
  return now.getUTCHours() === AFTER_DECLINE_HOUR_UTC && lastDay !== now.toISOString().slice(0, 10);
}

export function startAfterDeclineCron(): void {
  const tick = (): void => {
    const now = new Date();
    if (!isAfterDeclineHour(now, lastRunDay)) return;
    lastRunDay = now.toISOString().slice(0, 10);
    void runAfterDecline()
      .then((n) => {
        // eslint-disable-next-line no-console
        console.log(`[after-decline] ${n} conversation(s) opened`);
      })
      .catch((err: unknown) =>
        // eslint-disable-next-line no-console
        console.error('[after-decline] run failed:', (err as Error).message),
      );
  };
  setInterval(tick, CHECK_EVERY_MS).unref();
}
