/**
 * Ticket 20 row 209, second half — one conversation answers one run at a time.
 *
 * The engine has had half of this rule since Ticket 19 G1/G5. A wake refuses to
 * start while a run owns the thread, and the comment in wakeTask says why it
 * was not enough:
 *
 *   „The guard was one-directional. A wake waits for the owner; nothing ever
 *    stopped the owner from starting a run on top of a wake already in flight."
 *
 * Thread 15049 is that, and on 15049 the two runs replied a second apart with
 * two different clarifying questions. This module is the other direction, and
 * it holds for owner-against-owner too, which nothing ever covered:
 *
 *   goal 5580   „ვამტკიცებ" then „ok" 3.2 s later — two runs, both approved
 *               the same plan, and two real people were asked twice
 *   thread 16765  „გიორგი ხატიაშვილის" then „მოწვევა მინდა" 6.2 s later — one
 *               sentence typed in two messages. One run got a name with no
 *               verb, the other a verb with no subject, and they answered in
 *               parallel with neither holding the request.
 *
 * Thirty-two such pairs in seven days on this base.
 *
 * WHAT THIS IS NOT. runDedupe (row 115) refuses an IDENTICAL message while an
 * identical one is still running, and answers the caller with the run already
 * going. That is a double submit — one intention, several deliveries — and it
 * is right to collapse them. This is the opposite case: two DIFFERENT things
 * the owner said, both of which deserve an answer. Nothing is dropped here;
 * the second one waits and then runs with the first one's reply behind it,
 * which is more than it had before, not less.
 *
 * WHAT IT COSTS, stated rather than buried. The second message can wait for as
 * long as the first run may live. In exchange its run sees a thread that
 * actually contains the first answer. The two runs were never independent —
 * they shared a goal, a plan and a set of people — so what looked like
 * parallelism was two runs guessing about each other.
 *
 * A TYPED STOP DOES NOT QUEUE. That carve-out lives in the caller, because it
 * is a statement about that message and not about this lock: a stop exists to
 * interrupt, and making it wait for the run it is trying to stop would be the
 * one case where this rule does harm.
 *
 * IN MEMORY, like every other guard of this family, and with the same caveat:
 * one replica sees every run. On more than one it stops working and needs the
 * database.
 */

interface Holder {
  readonly runId: string;
  readonly since: number;
}

interface Waiter {
  readonly runId: string;
  admit: () => void;
}

const holders = new Map<number, Holder>();
const queues = new Map<number, Waiter[]>();

/** How this run got the thread. */
export type ThreadEntry =
  /** Nothing was running; it started at once. */
  | 'free'
  /** Something was running; this waited for it and was handed the thread. */
  | 'waited'
  /** Something was running and never let go — see the budget below. */
  | 'took_over';

/** The run that owns this thread right now, if any. Synchronous on purpose:
 *  the caller decides whether it is about to wait before it awaits anything. */
export function threadHolder(threadId: number): string | undefined {
  return holders.get(threadId)?.runId;
}

/**
 * Take the thread, waiting for whoever has it.
 *
 * `budgetMs` is an escape hatch, not a policy. Every run releases the thread
 * when it settles, including the ones that fail and the ones the hard timeout
 * kills, so this should never fire. It exists because a leaked holder with no
 * expiry would stall every later message on that conversation for ever, which
 * is a worse failure than the duplicate runs this module removes.
 *
 * IT IS THE HOLDER THAT IS TIMED, NOT THE WAIT. My first version timed the
 * wait, which is wrong the moment there are two messages queued: the one at
 * the back waits out the run ahead of it AND the run ahead of that, blows a
 * budget nothing is wrong with, and starts concurrently — reintroducing on a
 * busy conversation exactly what this module removes on a quiet one. So the
 * question asked on every poll is „has whoever holds the thread held it longer
 * than a run can live", and the answer is about them, not about us. A holder
 * past the budget is presumed dead and the thread is taken; its own later
 * release finds it is no longer the owner and does nothing.
 */
export async function enterThread(
  threadId: number,
  runId: string,
  budgetMs: number,
  pollMs: number,
): Promise<ThreadEntry> {
  if (holders.get(threadId) === undefined) {
    holders.set(threadId, { runId, since: Date.now() });
    return 'free';
  }
  const waiter: Waiter = { runId, admit: () => undefined };
  const queue = queues.get(threadId) ?? [];
  queue.push(waiter);
  queues.set(threadId, queue);

  const admitted = await new Promise<boolean>((resolve) => {
    const timer = setInterval(() => {
      const holder = holders.get(threadId);
      if (holder !== undefined && Date.now() - holder.since < budgetMs) return;
      clearInterval(timer);
      const waiting = queues.get(threadId);
      const at = waiting?.indexOf(waiter) ?? -1;
      if (waiting !== undefined && at >= 0) waiting.splice(at, 1);
      // eslint-disable-next-line no-console
      console.warn(
        `[thread-queue] run ${runId} thread ${threadId}: taking the thread from ` +
          `${holder?.runId ?? 'nobody'}, which has held it for ` +
          `${holder === undefined ? '?' : Date.now() - holder.since} ms`,
      );
      resolve(false);
    }, pollMs);
    timer.unref?.();
    waiter.admit = () => {
      clearInterval(timer);
      resolve(true);
    };
  });
  if (admitted) return 'waited';
  holders.set(threadId, { runId, since: Date.now() });
  return 'took_over';
}

/**
 * Give the thread up, and hand it straight to whoever is next.
 *
 * Released by RUN ID, the same rule as runDedupe's: a run that overran its
 * budget and was taken over must not release the thread out from under the run
 * that took it.
 *
 * The next waiter is made the holder HERE rather than in its own continuation,
 * so there is no moment when the thread reads as free while somebody is
 * already on their way into it.
 */
export function leaveThread(threadId: number, runId: string): void {
  if (holders.get(threadId)?.runId !== runId) return;
  const queue = queues.get(threadId);
  const next = queue?.shift();
  if (queue !== undefined && queue.length === 0) queues.delete(threadId);
  if (next === undefined) {
    holders.delete(threadId);
    return;
  }
  holders.set(threadId, { runId: next.runId, since: Date.now() });
  next.admit();
}

/** How many runs are waiting on this conversation. For the log and the tests. */
export function threadQueueLength(threadId: number): number {
  return queues.get(threadId)?.length ?? 0;
}

/** Tests, and nothing else. */
export function clearThreadQueue(): void {
  for (const queue of queues.values()) for (const waiter of queue) waiter.admit();
  holders.clear();
  queues.clear();
}
