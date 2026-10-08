import { proposeMatches } from './needsOffers.service';

/**
 * 1699 (A16): the matcher runs once a night, at 02:00 UTC (06:00 in Tbilisi),
 * with the goal wakes. Checked every hour; one run per UTC day per process.
 */
const CHECK_EVERY_MS = 60 * 60 * 1000;
const MATCH_HOUR_UTC = 2;

let lastRunDay: string | null = null;

/** Should the matcher run now? Once, in its hour, per UTC day. */
export function isMatchHour(now: Date, lastDay: string | null): boolean {
  const today = now.toISOString().slice(0, 10);
  return now.getUTCHours() === MATCH_HOUR_UTC && lastDay !== today;
}

export function startNeedsOffersMatcher(): void {
  const tick = (): void => {
    const now = new Date();
    if (!isMatchHour(now, lastRunDay)) return;
    lastRunDay = now.toISOString().slice(0, 10);
    void proposeMatches()
      .then((n) => {
        // eslint-disable-next-line no-console
        console.log(`[matcher] ${n} match(es) proposed`);
      })
      .catch((err: unknown) =>
        // eslint-disable-next-line no-console
        console.error('[matcher] night run failed:', (err as Error).message),
      );
  };
  setInterval(tick, CHECK_EVERY_MS).unref();
}
