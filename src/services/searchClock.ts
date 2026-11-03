/**
 * The time side of a run's search budget (Misho, 3 Nov: „ლიმიტების თემაზე
 * ყველაფერი გააკეთე"). Since 27 Oct a run's searching had a clock: once 25 s
 * had passed since its first search, every further search was refused. That
 * clock measured the wall, so it also spent:
 *
 *   - the model's own rounds between two searches (often 10–20 s each), so a
 *     run that thought twice had no searching left;
 *   - searches that timed out and found nothing (examples 6 and 7: every name
 *     search timed out, and the clock still ran);
 *   - the way_in check inside a web search (up to 3 s, mostly empty, #8648);
 *   - name lookups, which are free by count.
 *
 * The clock now counts only the time this run's searches of one kind were
 * actually running (overlapping calls counted once), minus timed-out searches
 * and way_in checks. A wide wall cap still bounds the run as a whole.
 */
/**
 * #8619 retest 3 (the tester's 81742): one parallel batch of 16 tag searches
 * for 8 companies ran 11–26 s each, under contention, so a single batch alone
 * passed 25 s of searching and the second-degree batch after it was refused.
 * A run may search a minute per kind; the wall cap bounds the whole.
 */
export const SEARCH_BUSY_BUDGET_MS = 60_000;
/**
 * Retest at 15:34 (run bd316aa8): the web's 9th search was refused 135 s after
 * its first, with 8 searches done: the 90 s wall had been spent by the model's
 * own rounds between searches, the very thing the busy clock stopped counting.
 * The wall is the last bound only, so it is set at three minutes.
 */
export const SEARCH_WALL_CAP_MS = 180_000;

interface Interval {
  readonly start: number;
  end: number | null;
}

interface KindClock {
  readonly firstAt: number;
  readonly intervals: Interval[];
  creditMs: number;
}

const clocks = new Map<string, KindClock>();

function clockFor(key: string, now: number): KindClock {
  const known = clocks.get(key);
  if (known !== undefined) return known;
  const fresh: KindClock = { firstAt: now, intervals: [], creditMs: 0 };
  clocks.set(key, fresh);
  return fresh;
}

/** The length of the union of the intervals, an open one running to now. */
export function unionMs(intervals: readonly Interval[], now: number): number {
  const spans = intervals.map((i) => [i.start, i.end ?? now] as const).sort((a, b) => a[0] - b[0]);
  let total = 0;
  let curStart = -1;
  let curEnd = -1;
  for (const [start, end] of spans) {
    if (start > curEnd) {
      if (curEnd > curStart) total += curEnd - curStart;
      curStart = start;
      curEnd = end;
    } else if (end > curEnd) {
      curEnd = end;
    }
  }
  if (curEnd > curStart) total += curEnd - curStart;
  return total;
}

/** Starts timing one search of this kind; the returned function ends it. */
export function startSearchTiming(key: string, now: number = Date.now()): (end?: number) => void {
  const interval: Interval = { start: now, end: null };
  clockFor(key, now).intervals.push(interval);
  return (end: number = Date.now()) => {
    interval.end = end;
  };
}

/** Time that must not count: a search that timed out, a way_in check inside a web search. */
export function creditSearchTime(key: string, ms: number, now: number = Date.now()): void {
  if (ms > 0) clockFor(key, now).creditMs += ms;
}

/** True when this kind's searching has run past its busy budget or the wall cap. */
export function searchTimeSpent(key: string, now: number = Date.now()): boolean {
  const clock = clocks.get(key);
  if (clock === undefined) return false;
  const busy = Math.max(0, unionMs(clock.intervals, now) - clock.creditMs);
  return busy > SEARCH_BUSY_BUDGET_MS || now - clock.firstAt > SEARCH_WALL_CAP_MS;
}

/** Forgets a run's clocks (both kinds). */
export function forgetSearchClocks(keys: readonly string[]): void {
  for (const key of keys) clocks.delete(key);
}

/** Did this search come back without finishing? */
export function searchTimedOut(result: unknown): boolean {
  const r = result as { reason?: unknown; timed_out?: unknown } | null;
  return r?.timed_out === true || (typeof r?.reason === 'string' && r.reason.endsWith('timed_out'));
}
