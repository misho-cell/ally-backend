import { followUpQuietLeads } from './helperThanks.service';

/**
 * 1692 part 2: the day-14 „following up your lead" lines go once a day, at
 * 09:00 UTC (13:00 in Tbilisi) — nobody is woken by them. Checked hourly; one
 * run per UTC day per process. Idle while ANSWER_DEBRIEF_ON is off.
 */
const CHECK_EVERY_MS = 60 * 60 * 1000;
const FOLLOW_UP_HOUR_UTC = 9;

let lastRunDay: string | null = null;

/** Should the lines go now? Once, in their hour, per UTC day. */
export function isFollowUpHour(now: Date, lastDay: string | null): boolean {
  return now.getUTCHours() === FOLLOW_UP_HOUR_UTC && lastDay !== now.toISOString().slice(0, 10);
}

export function startHelperFollowUps(): void {
  const tick = (): void => {
    const now = new Date();
    if (!isFollowUpHour(now, lastRunDay)) return;
    lastRunDay = now.toISOString().slice(0, 10);
    void followUpQuietLeads()
      .then((n) => {
        // eslint-disable-next-line no-console
        if (n > 0) console.log(`[helper-thanks] ${n} „following up your lead" line(s) sent`);
      })
      .catch((err: unknown) =>
        // eslint-disable-next-line no-console
        console.error('[helper-thanks] day-14 run failed:', (err as Error).message),
      );
  };
  setInterval(tick, CHECK_EVERY_MS).unref();
}
