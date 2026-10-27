import { runContactsMissingLines } from './contactsMissingLine.service';

/**
 * #7757 / #7828 (M7): the contacts line goes once, a few hours after
 * registering, so an hourly check is enough. A run in flight is never doubled.
 */
const CHECK_EVERY_MS = 60 * 60 * 1000;

let running = false;

export function startContactsMissingLines(): void {
  const tick = (): void => {
    if (running) return;
    running = true;
    void runContactsMissingLines()
      .then((n) => {
        // eslint-disable-next-line no-console
        if (n > 0) console.log(`[contacts-missing] ${n} line(s) written`);
      })
      .catch((err: unknown) =>
        // eslint-disable-next-line no-console
        console.error('[contacts-missing] run failed:', (err as Error).message),
      )
      .finally(() => {
        running = false;
      });
  };
  setInterval(tick, CHECK_EVERY_MS).unref();
}
