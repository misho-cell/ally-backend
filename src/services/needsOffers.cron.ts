import { deliverDueCards, expireMatches } from './matchFlow.service';
import { proposeMatches } from './needsOffers.service';

/**
 * 1699 (A16): the matcher proposes pairs. #7823 (founder 26 Oct): a need and an
 * offer stated three hours apart must meet the same hour, not the next night,
 * so it runs every hour. It only proposes; the cards still go once a day, at
 * their own hour.
 */
const CHECK_EVERY_MS = 60 * 60 * 1000;
/** The date and the hour of an ISO time: 2026-10-26T02. */
const HOUR_KEY_CHARS = 13;
/** 1699 part 2: cards go at 08:00 UTC — noon in Tbilisi; nobody is woken by a match. */
const CARD_HOUR_UTC = 8;

let lastRunHour: string | null = null;
let lastCardDay: string | null = null;

/** Should the cards go now? Once, in their hour, per UTC day. */
export function isCardHour(now: Date, lastDay: string | null): boolean {
  return now.getUTCHours() === CARD_HOUR_UTC && lastDay !== now.toISOString().slice(0, 10);
}

/** The UTC hour a run belongs to, as YYYY-MM-DDTHH. */
export function runHourOf(now: Date): string {
  return now.toISOString().slice(0, HOUR_KEY_CHARS);
}

/** Should the matcher run now? Once per UTC hour. */
export function isMatchHour(now: Date, lastHour: string | null): boolean {
  return lastHour !== runHourOf(now);
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
    if (!isMatchHour(now, lastRunHour)) return;
    lastRunHour = runHourOf(now);
    void proposeMatches()
      .then((n) => {
        // eslint-disable-next-line no-console
        console.log(`[matcher] ${n} match(es) proposed`);
      })
      .catch((err: unknown) =>
        // eslint-disable-next-line no-console
        console.error('[matcher] run failed:', (err as Error).message),
      );
  };
  setInterval(tick, CHECK_EVERY_MS).unref();
}
