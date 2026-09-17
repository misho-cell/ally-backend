/**
 * Ticket 20 row 205 — a deploy must not cut a run in half.
 *
 * 17 September, measured rather than guessed: the container's last log line on
 * every deploy is `npm error signal SIGTERM`. There is no shutdown handler, so
 * the process dies where it stands and every run inside it dies with it. Of
 * six fresh goals that morning, four lost a run and three of those sat against
 * a deploy window — which were my deploys, five of them in fifty minutes while
 * a battery was running.
 *
 * WHAT A DRAIN CAN AND CANNOT DO, said plainly because the honest answer is
 * less than the problem.
 *
 * A run takes sixty to ninety seconds. The platform's grace between SIGTERM
 * and SIGKILL is a small number of seconds. So waiting cannot save a run that
 * is halfway through — and pretending otherwise would be the same kind of
 * false comfort this codebase keeps finding in its own messages.
 *
 * What it CAN do is the part that was purely self-inflicted: stop starting new
 * runs inside a container that is already going away. A run born after SIGTERM
 * had no chance at all, and the owner was told „please try again" for it.
 *
 * The real fix for the rest is operational, not code: do not deploy while
 * people are working. That is mine to hold to, and it does not belong in a
 * module — but the count below is what makes it checkable rather than a
 * promise.
 */

/** How long a shutdown waits for work already under way. */
const DRAIN_BUDGET_MS = 20_000;

/** How often the drain checks whether the last run has finished. */
const DRAIN_POLL_MS = 250;

const inFlight = new Set<string>();
let draining = false;

export function beginRun(runId: string): void {
  inFlight.add(runId);
}

export function endRun(runId: string): void {
  inFlight.delete(runId);
}

export function inFlightCount(): number {
  return inFlight.size;
}

/**
 * Is the process on its way out?
 *
 * Read before starting anything: a run begun now is a run that will be killed,
 * and an honest refusal is better than an answer that never arrives.
 */
export function isDraining(): boolean {
  return draining;
}

/** Tests, and nothing else — a real process drains once. */
export function resetDrainState(): void {
  draining = false;
  inFlight.clear();
}

/**
 * Stop taking new work and wait for what is already running.
 *
 * Returns how many runs were still going when the wait ran out, so the caller
 * can say so rather than exiting as if everything had finished. Zero is the
 * good case and the number is the honest one.
 */
export async function drain(budgetMs: number = DRAIN_BUDGET_MS): Promise<number> {
  draining = true;
  const until = Date.now() + budgetMs;
  while (inFlight.size > 0 && Date.now() < until) {
    await new Promise((resolve) => setTimeout(resolve, DRAIN_POLL_MS));
  }
  return inFlight.size;
}
