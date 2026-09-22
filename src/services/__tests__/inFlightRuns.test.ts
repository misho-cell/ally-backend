import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import {
  beginRun,
  DRAIN_BUDGET_MS,
  drain,
  endRun,
  inFlightCount,
  isDraining,
  MEASURED_GRACE_MS,
  REPORT_RESERVE_MS,
  resetDrainState,
  RunMark,
} from '../inFlightRuns';

beforeEach(() => resetDrainState());

/**
 * Ticket 20 row 205 — a deploy must not cut a run in half.
 *
 * Measured 17 September: the container's last log line on every deploy is
 * `npm error signal SIGTERM`. Nothing handled it, so the process died where it
 * stood and every run inside it died with it. Of six fresh goals that morning,
 * four lost a run and three sat against a deploy window.
 */
const chat = (threadId: number): RunMark => ({ kind: 'chat', userId: 501, threadId });

describe('counting what a shutdown is about to cut off', () => {
  it('counts runs in and out', () => {
    beginRun('a', chat(1));
    beginRun('b', chat(2));
    expect(inFlightCount()).toBe(2);

    endRun('a');
    expect(inFlightCount()).toBe(1);
  });

  it('ending a run twice is not a negative count', () => {
    beginRun('a', chat(1));
    endRun('a');
    endRun('a');

    expect(inFlightCount()).toBe(0);
  });

  /**
   * The same run id registered twice is one run, not two. It was a Set and it
   * is a Map, and a Map keyed on anything but the run id would have quietly
   * turned row 115's five duplicate submissions into five things to wait for.
   */
  it('one run id is one run, however often it is registered', () => {
    beginRun('a', chat(1));
    beginRun('a', chat(1));

    expect(inFlightCount()).toBe(1);
  });
});

describe('draining', () => {
  it('is not draining until it is', () => {
    expect(isDraining()).toBe(false);
  });

  it('refuses new work the moment a shutdown starts', async () => {
    // The part that was purely self-inflicted: a run STARTED inside a
    // container already on its way out never had a chance, and its owner was
    // still told „please try again".
    const waiting = drain(300);
    expect(isDraining()).toBe(true);
    await waiting;
  });

  it('returns nothing when everything finished in time', async () => {
    beginRun('a', chat(1));
    setTimeout(() => endRun('a'), 50);

    expect(await drain(2_000)).toEqual([]);
  });

  /**
   * A run takes 60-90 seconds and the platform grants eleven, so this cannot
   * save one halfway through. Reporting nothing here would make a lost answer
   * look like a clean shutdown.
   *
   * 22 September it returns WHO rather than how many, and that is the whole
   * point of the change: „1 run(s) cut off by SIGTERM" named nobody, so on the
   * 21st I found out whose answer my deploy had killed by reading two
   * containers' logs line by line.
   */
  it('returns who it could NOT wait for, not how many', async () => {
    beginRun('a', chat(21121));
    beginRun('b', { kind: 'engine', userId: 160584, threadId: 16737 });

    expect(await drain(300)).toEqual([
      { runId: 'a', kind: 'chat', userId: 501, threadId: 21121 },
      { runId: 'b', kind: 'engine', userId: 160584, threadId: 16737 },
    ]);
  });

  it('leaves out the runs that did finish', async () => {
    beginRun('a', chat(1));
    beginRun('b', chat(2));
    setTimeout(() => endRun('a'), 50);

    const cutOff = await drain(400);

    expect(cutOff.map((run) => run.runId)).toEqual(['b']);
  });

  /**
   * THE BUDGET WAS BIGGER THAN THE GRACE, so nothing after the wait had ever
   * run — not the line naming what was cut off, not the clean exit under it.
   *
   * Measured 21 September, the one shutdown in this service's history that
   * ever had a run to wait for: SIGTERM at 23:20:56.491, „Stopping Container"
   * at 23:21:07.632. Eleven seconds and a hundred and fourteen milliseconds,
   * against a twenty-second budget.
   *
   * This is the rule, not the number: whatever the grace turns out to be, the
   * wait plus the reporting has to fit inside it, or the reporting is dead
   * code again — which it has now been twice in this one module.
   */
  it('the wait and the reporting together fit inside the measured grace', () => {
    expect(DRAIN_BUDGET_MS + REPORT_RESERVE_MS).toBeLessThanOrEqual(MEASURED_GRACE_MS);
  });

  it('still waits long enough to be worth doing', () => {
    // A budget of nothing is the old bug with the sign flipped: a run that
    // would have landed in the next second is thrown away to buy a log line.
    expect(DRAIN_BUDGET_MS).toBeGreaterThanOrEqual(5_000);
  });

  it('does not wait at all when nothing is running', async () => {
    const started = Date.now();
    await drain(5_000);

    expect(Date.now() - started).toBeLessThan(1_000);
  });
});

/**
 * 21 September — THE COUNT WAS ZERO AND THE COUNT WAS WRONG.
 *
 * Everything above tests this module against itself, and all of it passed
 * while the thing it exists to prevent went on happening. `beginRun` and
 * `endRun` were called from `threads.routes.ts` and nowhere else, so
 * `inFlightCount()` counted chat runs only. The task engine read
 * `isDraining()` on the way in — the row 205 follow-up — and never registered
 * what it then started, so an engine run in flight was invisible to the
 * shutdown that killed it.
 *
 * Read from the logs rather than reasoned about. 20 September:
 *
 *   21:42:02.635  run 28e53894, mode task_step, thread 16737, owner 160584
 *   21:42:20.057  [shutdown] SIGTERM: draining, 0 run(s) in flight
 *   21:42:20.057  [shutdown] all runs finished           — four microseconds
 *   21:43:36.366  [run-reaper] reaped 1 orphaned run(s)
 *
 * The owner read „ტექნიკური შეფერხება მოხდა". The drain had twenty seconds to
 * spend and the run was seventeen seconds old, and it spent none of them,
 * because a truthful-looking zero told it there was nothing to wait for.
 *
 * THE INVARIANT, and it is a source test on purpose. A unit test of this
 * module cannot see a caller that does not call it — that is exactly how this
 * survived. What can be checked is the rule: **a path that asks `isDraining()`
 * before starting work is a path that starts runs, so it must register them.**
 * A new run path that reads the flag and forgets `beginRun` fails here.
 */
describe('every path that asks about the drain also reports to it', () => {
  function callersOfIsDraining(): string[] {
    // -l: the files, not the lines. The module's own source is not a caller.
    const out = execSync(
      "grep -rl 'isDraining()' src --include=*.ts | grep -v inFlightRuns | grep -v __tests__ || true",
      { encoding: 'utf8' },
    );
    return out.split('\n').filter((line) => line.trim() !== '');
  }

  it('finds the paths at all, so an empty list cannot pass by accident', () => {
    // „I could not look" is not „nobody is there" — the failure this whole
    // file is about. If the search finds nothing, the test below proves
    // nothing, so it is asserted separately.
    expect(callersOfIsDraining().length).toBeGreaterThanOrEqual(2);
  });

  /**
   * COMMENTS STRIPPED FIRST, and the first version of this test did not do it.
   *
   * I wrote it, it went green, and then I commented out the `beginRun` call to
   * watch it fail — and it passed. A plain text search cannot tell a call from
   * a mention, and the paragraph above this test says „beginRun" four times.
   * The test was reading its own documentation and calling it code.
   *
   * That is the same shape as the bug it guards, one level up: something that
   * could not look reported that it had looked and found everything in order.
   */
  function codeWithoutComments(file: string): string {
    return readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, ' ');
  }

  it.each(callersOfIsDraining())('%s registers the runs it starts', (file) => {
    const code = codeWithoutComments(file);
    expect(code).toContain('beginRun(');
    expect(code).toContain('endRun(');
  });
});
