// Every knob that bounds how long a single run may work, in ONE place and
// env-overridable — the long-work direction (v68-style prompts) needs these
// raised together, and they must never drift apart: the route's hard timeout
// sits above the wall clock, and the reaper's orphan threshold above both.

function intEnv(name: string, fallback: number): number {
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

/** A thread still 'working' this long past the hard ceiling lost its process — reap it. */
export const ORPHAN_AGE_MS = RUN_HARD_TIMEOUT_MS + 3 * 60_000;
export const BOOT_ORPHAN_AGE_MS = RUN_HARD_TIMEOUT_MS + 60_000;
