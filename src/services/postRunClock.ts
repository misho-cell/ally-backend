/**
 * 958 (13 Oct, the `[latency]` lines 0227 added): on every run, about four
 * seconds pass between the tool loop's „done" and the answer reaching the
 * owner — 4.0–4.7 s on each of 32 runs read this morning, the same on a
 * one-tool small-talk turn as on a goal. That is server work after the model
 * has finished, and nothing said which step it was. The clock names it: each
 * step's time since the one before, in one line per run.
 */
export interface PostRunClock {
  readonly startedAt: number;
  lastAt: number;
  readonly laps: string[];
}

export function startPostRunClock(now: number = Date.now()): PostRunClock {
  return { startedAt: now, lastAt: now, laps: [] };
}

/** Marks the end of a step: its name and the time since the previous mark. */
export function lap(clock: PostRunClock, step: string, now: number = Date.now()): void {
  clock.laps.push(`${step} ${now - clock.lastAt}ms`);
  clock.lastAt = now;
}

/** One log line: every step in order and the whole time after the loop. */
export function postRunLine(runId: string, clock: PostRunClock, now: number = Date.now()): string {
  return `[post-run] run ${runId}: ${clock.laps.join(', ')}; total ${now - clock.startedAt}ms`;
}
