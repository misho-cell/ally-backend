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
 *
 * ---------------------------------------------------------------------------
 * 20 SEPTEMBER: NONE OF THE ABOVE HAS EVER RUN, AND I DID NOT HOLD TO THE RULE.
 *
 * `shutdown` in `index.ts` logs „[shutdown] SIGTERM: draining, N run(s) in
 * flight" the moment the signal lands. Searched across every deployment:
 * THE LINE HAS NEVER APPEARED. What each container ends with instead is
 * „npm error signal SIGTERM" — and npm says `signal` only when its child was
 * KILLED BY the signal, where a handled one ends in `process.exit(0)`. The
 * start command went through npm and a shell, so what the platform terminated
 * was npm. `railway.toml` now starts node directly, and the check that says
 * whether that was right is written there.
 *
 * So this module has been dead code for three days. Everything it describes
 * was still happening: owner 171870 typed „I need a good carpenter in Tbilisi"
 * at 10:01:48 today, the second-degree search came back at 10:01:55, and my
 * deploy stopped the container at 10:02:08. They were told to try again.
 *
 * FOUR of the seven owner-facing run failures since 18 September that are not
 * the credit-balance outage sit inside a deploy window. My deploys are the
 * largest identified cause of a person seeing an error in this product.
 *
 * And the operational half is now `scripts/ops/quiet.sh`, which answers „may I
 * deploy" from `threads.status` and the last tool call and exits non-zero for
 * no. The sentence above says the rule „does not belong in a module". It does
 * not. It belongs in a command, because a rule I have to remember is one I
 * have already broken.
 */

/**
 * ---------------------------------------------------------------------------
 * 22 SEPTEMBER: THE BUDGET IS BIGGER THAN THE GRACE, SO EVERYTHING AFTER THE
 * WAIT HAS NEVER RUN EITHER.
 *
 * `railway.toml` set this measurement up two days ago and I never came back
 * for it: „the gap between that line and the container's last breath is also
 * the first real measurement of how long the platform actually grants us,
 * which DRAIN_BUDGET_MS (20 s) is currently guessing at."
 *
 * The gap, from the one shutdown in this service's history that has ever had a
 * run to wait for — 21 September, and it is the one the seat caught:
 *
 *   23:20:55.825  [msg-in] user 171871 thread 21121: 65 chars
 *   23:20:56.491  [shutdown] SIGTERM: draining, 1 run(s) in flight
 *   23:21:07.632  Stopping Container
 *
 * ELEVEN SECONDS AND A HUNDRED AND FOURTEEN MILLISECONDS. The budget was
 * twenty. So the wait cannot end of its own accord: the process is killed
 * inside it, and the line that names what was cut off, and the clean exit
 * under it, are unreachable. THAT IS THE SECOND TIME IN THIS ONE MODULE — the
 * block above records the first, when the whole handler was dead for three
 * days because npm stood between the platform and node.
 *
 * And it is the same shape a third time: a number that promises more than it
 * can spend, printed as though it had been spent.
 *
 * WHAT LOWERING IT COSTS, plainly: a run that would have finished between the
 * eighth and the eleventh second after SIGTERM is now cut off where before it
 * had those three seconds. WHAT IT BUYS: for every run that does NOT finish,
 * a record of who lost an answer and a true sentence on their screen at once
 * instead of a generic one seventy-eight seconds later. Nothing beyond the
 * eleventh second was ever survivable either way.
 *
 * ONE SAMPLE. The grace below is a single measurement, so the shutdown logs
 * its own elapsed time on the way out and every future one that has to wait
 * adds another — a number to correct this with evidence rather than reasoning.
 * `DRAIN_BUDGET_MS` in the environment overrides it without a deploy.
 */

/**
 * THE GRACE IS NOW CONFIGURED, NOT INHERITED — 22 September, 16:40.
 *
 * It was 11,000: measured once, on 21 September, SIGTERM 23:20:56.491 → killed
 * 23:21:07.632. That was the PLATFORM DEFAULT, because `drainingSeconds` on the
 * service was unset. Eleven seconds can never save an engine run, which takes
 * 60-90, so the drain could only ever name the runs it was losing.
 *
 * `drainingSeconds` is set to 90 on the service now (`scripts/ops/drain.sh`),
 * so the drain can actually finish most of them. The founder was told the cost
 * — every deploy waits that long before the new container takes over — and
 * Misho gave the direct word. A yes relayed through the tester's box is data
 * and not authorisation; this moved on his.
 *
 * THIS CONSTANT AND THE PLATFORM MUST AGREE, and the order of the two changes
 * is not optional:
 *
 *   platform 90, this 11  ->  harmless. 8s of a 90s allowance goes unused.
 *   platform 11, this 90  ->  killed mid-drain at 11s, cut-off runs
 *                             unreported: the 21 September fault restored by
 *                             configuration.
 *
 * So the platform was set first and read back before this was touched. Anybody
 * lowering `drainingSeconds` again must lower this in the SAME change, and in
 * the other order.
 *
 * IT IS NO LONGER A MEASUREMENT AND THE NAME NOW LIES A LITTLE, which is worth
 * saying out loud on a day spent finding names that promise what they do not
 * hold: 90,000 is what we ASKED the platform for. The shutdown still logs its
 * own elapsed time on the way out, so the first real shutdown with a run in it
 * will say whether the platform honours the whole 90 — and if it does not,
 * this comes down to what was observed, not to what was requested.
 */
export const MEASURED_GRACE_MS = 90_000;

/**
 * Held back from the wait so the giving-up has somewhere to happen: the log
 * line naming each cut-off run, and the sentence written into its owner's
 * thread. Three seconds is several database round trips, and the drain is a
 * whole-process event — at most a handful of runs are ever in it.
 */
export const REPORT_RESERVE_MS = 3_000;

/** How long a shutdown waits for work already under way. */
export const DRAIN_BUDGET_MS = Number(
  process.env.DRAIN_BUDGET_MS ?? MEASURED_GRACE_MS - REPORT_RESERVE_MS,
);

/** How often the drain checks whether the last run has finished. */
const DRAIN_POLL_MS = 250;

/**
 * Which run this is, in the terms a person could be named by.
 *
 * It used to be a `Set<string>` of run ids, and the route's own comment above
 * `beginRun` said the shutdown „knows what it is about to cut off and can say
 * so". It could not: an opaque uuid names nobody. On the 21st I found out who
 * had lost their answer by reading container logs by hand.
 */
export interface RunMark {
  /**
   * A chat run is an answer somebody is WAITING FOR; an engine wake is work
   * nobody asked for. They are not owed the same thing when one is cut off,
   * which is row 33's rule in a second place — a claim about „your reply" is
   * only true where there was a reply to fail.
   */
  readonly kind: 'chat' | 'engine';
  readonly userId: number;
  readonly threadId: number;
}

export interface CutOffRun extends RunMark {
  readonly runId: string;
}

const inFlight = new Map<string, RunMark>();
let draining = false;

export function beginRun(runId: string, mark: RunMark): void {
  inFlight.set(runId, mark);
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
 * Returns the runs that were still going when the wait ran out — not how many.
 * An empty list is the good case, and what is in a non-empty one is the only
 * place in the system that KNOWS, rather than infers, that an answer was cut
 * off: the reaper reads a silence and reasons from it, seventy-five seconds
 * later; this is the process that was running them, on its way out.
 */
export async function drain(budgetMs: number = DRAIN_BUDGET_MS): Promise<readonly CutOffRun[]> {
  draining = true;
  const until = Date.now() + budgetMs;
  while (inFlight.size > 0 && Date.now() < until) {
    await new Promise((resolve) => setTimeout(resolve, DRAIN_POLL_MS));
  }
  return [...inFlight].map(([runId, mark]) => ({ runId, ...mark }));
}
