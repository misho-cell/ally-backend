/**
 * F4 of the tester's launch report (60358; the 200-seat tests of 15 Oct): two
 * hundred runs started together, every one drew on the same database pool and
 * model at once, and each became slower than if half had waited a moment. A
 * fixed number of owner runs work at a time; the rest wait their turn here,
 * in arrival order, with the „working" status the send already set. A run's
 * own clock starts when it gets its slot, not while it waits.
 *
 * One process only, like the thread queue beside it (threadRunQueue.ts).
 */
export const RUN_SLOTS = 60;
/** A wait this long is logged, so the cap can be read against real days. */
const WAIT_WORTH_LOGGING_MS = 1_000;

let inUse = 0;
const waiting: Array<() => void> = [];

/** Resolves when a run may start; the caller must `releaseRunSlot()` once it has ended. */
export function takeRunSlot(runId: string, slots: number = RUN_SLOTS): Promise<void> {
  if (inUse < slots) {
    inUse += 1;
    return Promise.resolve();
  }
  const queuedAt = Date.now();
  return new Promise<void>((resolve) => {
    waiting.push(() => {
      const waited = Date.now() - queuedAt;
      if (waited >= WAIT_WORTH_LOGGING_MS) {
        // eslint-disable-next-line no-console
        console.log(`[run-slots] run ${runId}: started after ${waited} ms waiting for a slot`);
      }
      resolve();
    });
  });
}

/** Hands the slot to the longest-waiting run, or frees it. */
export function releaseRunSlot(): void {
  const next = waiting.shift();
  if (next !== undefined) {
    next();
    return;
  }
  inUse = Math.max(0, inUse - 1);
}

/** Runs working and runs waiting, for a log line or a test. */
export function runSlotState(): { readonly inUse: number; readonly waiting: number } {
  return { inUse, waiting: waiting.length };
}
