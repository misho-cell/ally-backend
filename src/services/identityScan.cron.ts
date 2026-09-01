import { runIdentityScanTick } from './identity.service';

// The D35 shadow scan's own heartbeat: one owner-batch per tick until the
// whole base is covered, resumed from the server-held progress row
// (migration 100). Same shape as the other tickers — setInterval + unref,
// errors logged, never thrown. Once done it costs one SELECT per tick.
// IDENTITY_SCAN_AUTO=off is the kill switch (config, not deploy).
// A batch is ~3s of work now (it was minutes), and the scan has ~1.4M pairs to
// walk. At five minutes a tick that is weeks; at one minute it is hours, and
// the tick still spends 95% of its time idle.
const TICK_INTERVAL_MS = Number(process.env.IDENTITY_SCAN_TICK_MS ?? 60_000);
const AUTO_ENABLED = (process.env.IDENTITY_SCAN_AUTO ?? 'on') !== 'off';

// One batch at a time even if a batch outlives the interval.
let ticking = false;

export function startIdentityScanCron(): void {
  if (!AUTO_ENABLED) {
    // eslint-disable-next-line no-console
    console.log('[identity-scan] auto scan disabled (IDENTITY_SCAN_AUTO=off)');
    return;
  }
  setInterval(() => {
    if (ticking) return;
    ticking = true;
    void runIdentityScanTick()
      .then((r) => {
        if (r.ran) {
          // eslint-disable-next-line no-console
          console.log(
            `[identity-scan] batch done: +${r.candidates_added ?? 0} candidate(s), ` +
              (r.done ? 'SCAN COMPLETE' : `next_from=${r.next_from}`),
          );
        }
      })
      .catch((err: unknown) =>
        // eslint-disable-next-line no-console
        console.error('[identity-scan] tick failed:', (err as Error).message),
      )
      .finally(() => {
        ticking = false;
      });
  }, TICK_INTERVAL_MS).unref();
  // eslint-disable-next-line no-console
  console.log(`[identity-scan] ticker started (${Math.round(TICK_INTERVAL_MS / 1000)}s)`);
}
