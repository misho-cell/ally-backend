/**
 * Ticket 20 row 113, fourth pass — a stop must stop the run, not just the goal.
 *
 * Read by the tester on c7f8de1, goal 4489 / thread 16635. The header button
 * was pressed 20 seconds into the first run:
 *
 *   13:16:16  „შევაჩერე: <title>. ახალი არაფერი გაიგზავნება."   the stop line
 *   13:16:19  second press — silent, as designed
 *   13:16:33  present_choices                                    the run, still going
 *   13:16:40  its reply, with approve / change buttons
 *
 * So the owner reads „I stopped it" and is then asked to approve a plan by the
 * goal that just stopped. Everything in the register worked — stage stopped,
 * asks_sent 0 — and the screen still showed the opposite, because closing the
 * ROW and stopping the WORK were never the same act.
 *
 * This is the smallest thing that makes them the same act: the stop writes a
 * timestamp against the thread, and a run started before that timestamp is
 * dead. It does not try to kill the model call in flight — that call is already
 * paid for and will end on its own in a few seconds. What it guarantees is the
 * part the owner can see: nothing that run would still have said reaches the
 * thread, and the loop gives up at its next step rather than spending another
 * minute of somebody's tokens on a goal they stopped.
 *
 * Keyed on the THREAD rather than the goal, because that is what both stop
 * routes hold and what the run is addressed to — and because a thread whose
 * goal was just closed has no goal left to key on.
 */

/**
 * Order is a COUNTER, not a clock, and that is deliberate.
 *
 * „Did the stop come after this run started" is a question about order, and a
 * millisecond clock answers it wrongly twice: a stop and the owner's next
 * message can land in the same millisecond — and then the new run reads as
 * already stopped and the person who just typed gets nothing. A counter cannot
 * tie. It also makes the test for it deterministic, which a clock never is.
 *
 * The wall-clock time rides along only so old records can be swept.
 */
interface Marker {
  readonly seq: number;
  readonly at: number;
}

let sequence = 0;
const runStart = new Map<string, Marker>();
const threadStopped = new Map<number, Marker>();

/**
 * How long either record is worth keeping. A run lives ninety seconds; ten
 * minutes is generous for it and short enough that neither map can grow into a
 * leak on a long-lived process.
 */
const RECORD_TTL_MS = 10 * 60_000;

function mark(): Marker {
  sequence += 1;
  return { seq: sequence, at: Date.now() };
}

function prune(): void {
  const cutoff = Date.now() - RECORD_TTL_MS;
  for (const [runId, m] of runStart) if (m.at < cutoff) runStart.delete(runId);
  for (const [threadId, m] of threadStopped) if (m.at < cutoff) threadStopped.delete(threadId);
}

/** Called at the top of every run, whatever started it. */
export function noteRunStart(runId: string): void {
  prune();
  runStart.set(runId, mark());
}

/** Called by the stop, whichever route or typed line reached it. */
export function markThreadStopped(threadId: number): void {
  prune();
  threadStopped.set(threadId, mark());
}

/**
 * Was this run stopped by its owner while it was working?
 *
 * False for a run this process never saw start — a run whose record has aged
 * out, or one from a container that has since been replaced. That is the safe
 * direction: the cost of a wrong `false` is one late answer, and the cost of a
 * wrong `true` is an answer the owner asked for and never received.
 */
export function runWasStopped(threadId: number, runId: string): boolean {
  const stopped = threadStopped.get(threadId);
  if (stopped === undefined) return false;
  const started = runStart.get(runId);
  if (started === undefined) return false;
  return stopped.seq > started.seq;
}

/** Tests only. */
export function resetStoppedRuns(): void {
  runStart.clear();
  threadStopped.clear();
  sequence = 0;
}
