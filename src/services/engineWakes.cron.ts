import { abandonExhaustedWakes, claimOverdueWakes, DAY_ONE_WAKE } from './engineWakes.service';

/**
 * Ticket 20 rows 231 and 239 — the net under the timers.
 *
 * A wake lives in a `setTimeout` inside the process, so a restart between an
 * approval and its wake loses it with nothing on disk. Measured 22 September
 * over the preceding week: 11 of 41 approvals lost their first day that way
 * and were rescued a DAY later by the fallback, while the product told the
 * owner it had already started.
 *
 * This ticker reads the rows those timers leave behind and re-runs anything
 * still unfinished two minutes after it was due. A lost wake costs about a
 * minute instead of about a day.
 *
 * ONE TICK AT A TIME, and each claim is an atomic UPDATE, so nothing here can
 * run a wake the timer is also running.
 *
 * ENGINE_WAKE_SWEEP=off is the kill switch — config, not a deploy. It is worth
 * having on the first version of something that wakes goals: if this ever
 * starts a run it should not, the fix is a variable and not a build.
 */
/**
 * TWENTY SECONDS, NOT SIXTY — and the throttle below moves with it in the same
 * change, which is the whole point.
 *
 * The seat's done-when was „every approval gets its first day within three
 * minutes". Measured against the shipped constants that breached in three
 * cases of four: 3 s delay + 120 s grace + up to 60 s of tick + a 30-90 s run
 * is 153 s at best and 273 s at worst. The one real recovery — task 7790,
 * 167 s — was the lucky corner: the tick happened to land 14 s after the row
 * came due and the run happened to take 30.
 *
 * The binding constraint is the 120 s grace and it cannot come down: the timer
 * itself retries for up to 93 s, and a shorter grace would have this sweeper
 * racing a timer still working. 120 plus a 60 s run is 180 before anything
 * else is counted, so three minutes measured to the FINISH is unreachable.
 *
 * So the done-when moved to where the promise actually is. „Day one is already
 * starting behind your reply" promises a START, and the owner is told nothing
 * about the finish. To the start: 3 + 120 + 20 = 143 s worst case, 2m23s,
 * inside three minutes with real margin.
 */
export const TICK_INTERVAL_MS = Number(process.env.ENGINE_WAKE_TICK_MS ?? 20_000);
const ENABLED = (process.env.ENGINE_WAKE_SWEEP ?? 'on') !== 'off';

/**
 * Small on purpose. A tick that sweeps up fifty goals at once is a tick that
 * writes to fifty people's contacts at once.
 *
 * FIVE BECAME TWO WHEN THE TICK BECAME THREE TIMES FASTER, and the two numbers
 * belong in one change. Left at 5 with a 20-second tick this would have gone
 * from 5 goals a minute to 15 — a tripling of a deliberate safety ceiling,
 * arriving as the side effect of a latency fix, which is how a good change
 * becomes the next incident. The comment above is load-bearing and was written
 * by somebody who meant it.
 *
 * 2 every 20 s is 6 a minute against the old 5. NOT identical, and saying so:
 * it is a fifth more, not the same number. There is no integer pair at exactly
 * 5 a minute on a 20-second tick, and 1 every 20 s would be 3 — slower than
 * today, which would make a backlog worse to buy a tidier number.
 */
export const PER_TICK = 2;

let ticking = false;

async function sweepOnce(): Promise<void> {
  const abandoned = await abandonExhaustedWakes();
  if (abandoned > 0) {
    // eslint-disable-next-line no-console
    console.warn(`[engine-wakes] gave up on ${abandoned} wake(s) after their attempts ran out`);
  }
  const due = await claimOverdueWakes(PER_TICK);
  if (due.length === 0) return;

  // Imported here rather than at the top: the engine imports this module's
  // service, and a static import back into the engine would be a cycle.
  const engine = await import('./taskEngine.service');
  for (const wake of due) {
    if (wake.kind !== DAY_ONE_WAKE) {
      // NOT „leaving it claimed", which is what this line used to say and is
      // not what happens: the claim expires in five minutes, the row comes back
      // round, and after five attempts `abandonExhaustedWakes` closes it as
      // though it had been run. A kind with no handler is a deploy that added
      // a producer and not a consumer, so it is worth the row it burns and
      // worth being told the truth about.
      // eslint-disable-next-line no-console
      console.error(
        `[engine-wakes] no handler for kind ${wake.kind}; it will be retried ` +
          `until its attempts run out and then closed unrun`,
      );
      continue;
    }
    // eslint-disable-next-line no-console
    console.log(
      `[engine-wakes] task ${wake.taskId}: day one was lost, running it now ` +
        `(attempt ${wake.attempts})`,
    );
    // No delay: this wake is already late, and startDayOne re-checks that the
    // goal is still open and still wants it before anything is written.
    engine.startDayOne(wake.taskId, 0);
  }
}

export function startEngineWakeCron(): void {
  if (!ENABLED) {
    // eslint-disable-next-line no-console
    console.log('[engine-wakes] sweeper disabled (ENGINE_WAKE_SWEEP=off)');
    return;
  }
  setInterval(() => {
    if (ticking) return;
    ticking = true;
    void sweepOnce()
      .catch((err: unknown) =>
        // eslint-disable-next-line no-console
        console.error('[engine-wakes] sweep failed:', (err as Error).message),
      )
      .finally(() => {
        ticking = false;
      });
  }, TICK_INTERVAL_MS).unref();
  // eslint-disable-next-line no-console
  console.log(`[engine-wakes] sweeper started (${Math.round(TICK_INTERVAL_MS / 1000)}s)`);
}
