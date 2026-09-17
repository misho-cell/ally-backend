/**
 * Ticket 20 row 202, fourth pass — is the API going quiet, or are we too busy
 * to listen?
 *
 * Measured 17 September on two goals that ANSWERED, so nothing aborted and
 * nothing looked broken:
 *
 *   66abd3c5  events 159, longest silence 43,320 ms, alive 58,834 ms
 *   0cadbdf0  events 120, longest silence 57,794 ms, alive 67,570 ms
 *
 * In both, the stream delivered a hundred-odd events and then stopped dead for
 * most of a minute. That is the whole of the two-minute first answer the
 * founder complains about, and it has exactly two explanations:
 *
 *   the API paused          — nothing arrived, and no number we choose helps
 *   OUR PROCESS was blocked — the bytes arrived and nobody read them
 *
 * They are indistinguishable in every measurement taken so far, and they need
 * opposite fixes: the first is a provider problem to route around, the second
 * is our own synchronous work — and the suspects there are already named,
 * because one goal can hold seven of the ten database connections and a
 * second-circle search runs 16-17 seconds.
 *
 * THIS SETTLES IT IN ONE NUMBER. A timer asked to fire every second cannot be
 * late unless the event loop was busy, so its lateness IS the blockage, in
 * milliseconds. If a 43-second stream silence sits on top of 43 seconds of
 * loop lag, the stream was never the problem. If the loop stayed responsive
 * throughout, the API really did go quiet and I stop looking at our own code.
 *
 * It costs one timer and a subtraction per second, and it says nothing at all
 * on a healthy process — the log stays silent until something is actually
 * wrong, which is the only way a diagnostic survives contact with a real log.
 */

/** How often the probe checks in. One second is fine-grained and free. */
const TICK_MS = 1_000;

/**
 * Lateness below this is ordinary scheduling noise on a busy server and not
 * worth a line. Above it, something held the loop long enough to matter to a
 * person waiting for an answer.
 */
const REPORT_OVER_MS = 2_000;

let timer: NodeJS.Timeout | null = null;
let worstMs = 0;

/** The worst lateness seen since the last read, for anything that wants it. */
export function worstLagMs(): number {
  return worstMs;
}

export function resetLagWatch(): void {
  worstMs = 0;
}

/**
 * Start the probe. Idempotent: a second call is a no-op rather than a second
 * timer, because two probes would each measure the other's work.
 */
export function startLoopLagWatch(): void {
  if (timer !== null) return;
  // One line at boot, and it is not decoration. This probe's whole value is in
  // its SILENCE: „no lag lines all afternoon" is the evidence that our process
  // was never the blockage. Silence proves nothing if the probe might simply
  // never have started, so it says once that it is watching, and the absence
  // of every later line means what it claims to mean.
  // eslint-disable-next-line no-console
  console.log(`[loop-lag] watching: reports lateness over ${REPORT_OVER_MS}ms, ${TICK_MS}ms tick`);
  let expectedAt = Date.now() + TICK_MS;
  timer = setInterval(() => {
    const late = Date.now() - expectedAt;
    expectedAt = Date.now() + TICK_MS;
    if (late <= REPORT_OVER_MS) return;
    if (late > worstMs) worstMs = late;
    // eslint-disable-next-line no-console
    console.warn(`[loop-lag] event loop blocked for ${late}ms`);
  }, TICK_MS);
  // Never the reason the process stays alive.
  timer.unref();
}

export function stopLoopLagWatch(): void {
  if (timer !== null) clearInterval(timer);
  timer = null;
}
