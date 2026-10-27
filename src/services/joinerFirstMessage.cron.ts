import { runJoinerFirstMessages } from './joinerFirstMessage.service';

/**
 * #7729 / #7828 / #7757: the joiner's first message goes within the hour of
 * registering, so the check runs every ten minutes. A run already in flight
 * is never started twice.
 */
const CHECK_EVERY_MS = 10 * 60 * 1000;

let running = false;

export function startJoinerFirstMessages(): void {
  const tick = (): void => {
    if (running) return;
    running = true;
    void runJoinerFirstMessages()
      .then((n) => {
        // eslint-disable-next-line no-console
        if (n > 0) console.log(`[joiner-first] ${n} first message(s) written`);
      })
      .catch((err: unknown) =>
        // eslint-disable-next-line no-console
        console.error('[joiner-first] run failed:', (err as Error).message),
      )
      .finally(() => {
        running = false;
      });
  };
  setInterval(tick, CHECK_EVERY_MS).unref();
}
