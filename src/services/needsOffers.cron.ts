import { deliverDueCards, expireMatches } from './matchFlow.service';
import { proposeMatches } from './needsOffers.service';

/**
 * 1699 (A16): the matcher proposes pairs. #7823 (founder 26 Oct): a need and an
 * offer stated three hours apart must meet the same hour, not the next night,
 * so it runs every hour. It only proposes; the cards still go once a day, at
 * their own hour.
 */
/**
 * #7823 (tester 76704): the check ran once an hour from the server's start, so
 * a deploy at 08:01 left no check inside the 08:00 hour and three proposed
 * pairs waited a day with no card. It checks every five minutes now; the
 * matcher itself still runs once per hour (isMatchHour).
 */
const CHECK_EVERY_MS = 5 * 60 * 1000;
/** The date and the hour of an ISO time: 2026-10-26T02. */
const HOUR_KEY_CHARS = 13;
/** 1699 part 2: cards go at 08:00 UTC — noon in Tbilisi; nobody is woken by a match. */
const CARD_HOUR_UTC = 8;
/**
 * #7823: a day whose 08:00 check was missed (a restart) sends at the next
 * check, up to 18:00 UTC (22:00 Tbilisi), so a card never lands in quiet
 * hours. Sending twice is harmless: an owner carded in the last day is skipped.
 */
const CARD_WINDOW_END_UTC = 18;

/**
 * OUTAGE 27 Oct ~10:15Z (Misho: „ვერ შედიან"): the hourly matcher run scans
 * every open goal against every offer in one synchronous loop; since the
 * 5,000-candidate bound (26 Oct) it holds the event loop for minutes and the
 * whole server stops answering. Off until the scan is rebuilt to yield; the
 * daily cards for pairs already proposed still go.
 */
export const MATCHER_RUN_ON = false;

let lastRunHour: string | null = null;
let lastCardDay: string | null = null;

/** Should the cards go now? Once per UTC day, at the first check from their hour until the window closes. */
export function isCardHour(now: Date, lastDay: string | null): boolean {
  const hour = now.getUTCHours();
  return (
    hour >= CARD_HOUR_UTC &&
    hour < CARD_WINDOW_END_UTC &&
    lastDay !== now.toISOString().slice(0, 10)
  );
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
    if (!MATCHER_RUN_ON || !isMatchHour(now, lastRunHour)) return;
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
