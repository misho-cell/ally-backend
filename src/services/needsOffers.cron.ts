import { deliverDueCards, expireMatches } from './matchFlow.service';
import { proposeMatches } from './needsOffers.service';

/**
 * 1699 (A16): the matcher runs once a night, at 02:00 UTC (06:00 in Tbilisi),
 * with the goal wakes. Checked every hour; one run per UTC day per process.
 */
const CHECK_EVERY_MS = 60 * 60 * 1000;
const MATCH_HOUR_UTC = 2;
/** 1699 part 2: cards go at 08:00 UTC — noon in Tbilisi; nobody is woken by a match. */
const CARD_HOUR_UTC = 8;

let lastRunDay: string | null = null;
let lastCardDay: string | null = null;

/** Should the cards go now? Once, in their hour, per UTC day. */
export function isCardHour(now: Date, lastDay: string | null): boolean {
  return now.getUTCHours() === CARD_HOUR_UTC && lastDay !== now.toISOString().slice(0, 10);
}

/** Should the matcher run now? Once, in its hour, per UTC day. */
export function isMatchHour(now: Date, lastDay: string | null): boolean {
  const today = now.toISOString().slice(0, 10);
  return now.getUTCHours() === MATCH_HOUR_UTC && lastDay !== today;
}

export function startNeedsOffersMatcher(): void {
  const tick = (): void => {
    const now = new Date();
    if (isCardHour(now, lastCardDay)) {
      lastCardDay = now.toISOString().slice(0, 10);
      void Promise.all([deliverDueCards(), expireMatches()])
        .then(([cards, expired]) => {
          // eslint-disable-next-line no-console
          console.log(`[matcher] ${cards} card(s) sent, ${expired} match(es) expired`);
        })
        .catch((err: unknown) =>
          // eslint-disable-next-line no-console
          console.error('[matcher] cards failed:', (err as Error).message),
        );
    }
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
