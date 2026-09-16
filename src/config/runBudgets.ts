// Every knob that bounds how long a single run may work, in ONE place and
// env-overridable — the long-work direction (v68-style prompts) needs these
// raised together, and they must never drift apart: the route's hard timeout
// sits above the wall clock.
//
// The reaper's threshold used to sit above BOTH of those, because it asked how
// long a thread had been working and so had to clear the longest legitimate
// run. It no longer does: it asks how long the thread has been SILENT, which is
// independent of them (Ticket 20 row 114). ORPHAN_AGE_MS and BOOT_ORPHAN_AGE_MS
// were deleted with that change rather than left here unread.

export function intEnv(name: string, fallback: number): number {
  const raw = Number(process.env[name]);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : fallback;
}

/** Total wall-clock budget for one run's tool work + final answer. */
export const RUN_WALL_CLOCK_BUDGET_MS = intEnv('RUN_WALL_CLOCK_BUDGET_MS', 90_000);

/** Headroom reserved for synthesizing the final answer (no NEW tool rounds inside it). */
export const FINAL_ANSWER_HEADROOM_MS = intEnv('FINAL_ANSWER_HEADROOM_MS', 30_000);

export const RUN_SOFT_BUDGET_MS = Math.max(
  10_000,
  RUN_WALL_CLOCK_BUDGET_MS - FINAL_ANSWER_HEADROOM_MS,
);

export const MAX_TOOL_ITERATIONS = intEnv('MAX_TOOL_ITERATIONS', 20);

/**
 * Route-level ceiling: follows the wall clock automatically when only
 * RUN_WALL_CLOCK_BUDGET_MS is raised; settable explicitly too.
 */
export const RUN_HARD_TIMEOUT_MS = intEnv('RUN_HARD_TIMEOUT_MS', RUN_WALL_CLOCK_BUDGET_MS + 20_000);

/**
 * When the anti-stall nudge fires and the model decides to CONTINUE working
 * (it may call tools again), how many extra tool rounds it gets before a
 * final answer is forced.
 */
export const CLIFFHANGER_EXTRA_ROUNDS = intEnv('CLIFFHANGER_EXTRA_ROUNDS', 3);

/**
 * How long a `working` thread may go with no sign of life before it is assumed
 * dead — Ticket 20 row 114.
 *
 * The two thresholds above are ages: how long the thread has been working AT
 * ALL. They have to sit above the longest legitimate run, or they would reap a
 * run that is simply taking its time — which is why the reaper could not react
 * in under about five minutes. On 16 September a deploy landed 52 seconds into
 * a run on thread 15610; the person got no answer and no error, and the chat
 * sat on „working" until they gave up and typed the line again.
 *
 * This one is not an age, it is a SILENCE, and that is the difference. A live
 * run now touches its thread on every heartbeat, so a thread that has not made
 * a sound is dead no matter how long or short its run was meant to be — and
 * that holds whether one process is running or five, which an age threshold
 * could never promise.
 *
 * Three missed heartbeats, not one. A false positive writes „technical delay"
 * over somebody's working run, which is worse than the wait it saves.
 */
export const RUN_SILENT_MS = intEnv('RUN_SILENT_MS', 75_000);
