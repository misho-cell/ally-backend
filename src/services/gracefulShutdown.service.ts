import { tellOwnersTheirRunWasCutOff } from './cutOffRunNotice.service';
import {
  CutOffRun,
  DRAIN_BUDGET_MS,
  drain,
  inFlightCount,
  MEASURED_GRACE_MS,
  REPORT_RESERVE_MS,
} from './inFlightRuns';

/**
 * Ticket 20 row 205 and the deploy row of 22 September — a deploy must not cut
 * a run in half, and when it does, it must say so.
 *
 * Measured 17 September: the container's last log line on every deploy was
 * `npm error signal SIGTERM`. Nothing handled it, so the process died where it
 * stood and every run inside it died with it. Of six fresh goals that morning
 * four lost a run, and three sat against a deploy window.
 *
 * The wait is honest about its own size: a run takes 60-90 seconds and the
 * platform grants eleven, so this cannot save one that is halfway through.
 * What it can do is two things that were being left undone — refuse to START a
 * run inside a container already on its way out, and, for the runs it cannot
 * save, name them and tell their owners the truth before the lights go off.
 *
 * NOTHING IS SWALLOWED ON THE WAY OUT. Exiting quietly would make a lost
 * answer look like a clean shutdown, which is the substitution this codebase
 * keeps finding in its own reporting.
 */

/** A shutdown only needs this much of `http.Server`, and a test only has this much. */
export interface Closable {
  close(): void;
}

function report(signal: string, cutOff: readonly CutOffRun[]): void {
  for (const run of cutOff) {
    // eslint-disable-next-line no-console
    console.error(
      `[shutdown] ${signal} cut off ${run.kind} run ${run.runId}: ` +
        `user ${run.userId}, thread ${run.threadId}`,
    );
  }
}

/**
 * How long this shutdown took, against the grace it is racing.
 *
 * `MEASURED_GRACE_MS` is one sample — 21 September, the only shutdown that has
 * ever had a run to wait for. Every future one that has to wait prints another
 * here, so the constant can be corrected from evidence instead of reasoned
 * about again. A line saying we went OVER is the one that matters: it means
 * the process was killed before it finished and the number is too high.
 */
function reportElapsed(signal: string, startedAt: number): void {
  const elapsed = Date.now() - startedAt;
  const verdict = elapsed > MEASURED_GRACE_MS ? 'OVER the measured grace' : 'inside the grace';
  // eslint-disable-next-line no-console
  console.log(
    `[shutdown] ${signal}: exiting after ${elapsed} ms — ${verdict} (${MEASURED_GRACE_MS} ms)`,
  );
}

export async function finishShutdown(signal: string, budgetMs?: number): Promise<void> {
  const cutOff = await drain(budgetMs);
  if (cutOff.length === 0) {
    // eslint-disable-next-line no-console
    console.log('[shutdown] all runs finished');
    return;
  }
  report(signal, cutOff);
  await tellOwnersTheirRunWasCutOff(cutOff);
}

/**
 * THE BUDGET CAN BE SET FROM THE ENVIRONMENT, AND NOTHING CHECKED THE VALUE.
 *
 * `DRAIN_BUDGET_MS` is overridable on purpose — the grace is one measurement
 * and correcting it should not need a deploy. But the test that holds „the
 * wait plus the reporting fits inside the grace" runs in CI, where the
 * variable is unset. Set it to twenty seconds in production and the test still
 * passes, while the process is killed inside the wait exactly as it was before
 * this morning — the original bug, restored by configuration, silently.
 *
 * So the check moves to where the value actually is. Once, at boot, in the log
 * the deploy already prints. The override stays possible; a bad one announces
 * itself instead of waiting for somebody to notice a missing line.
 */
function reportTheBudgetAgainstTheGrace(): void {
  const needed = DRAIN_BUDGET_MS + REPORT_RESERVE_MS;
  if (needed <= MEASURED_GRACE_MS) return;
  // eslint-disable-next-line no-console
  console.error(
    `[shutdown] MISCONFIGURED: the drain waits ${DRAIN_BUDGET_MS} ms and needs ` +
      `${REPORT_RESERVE_MS} ms to report, which is ${needed} ms against a measured grace of ` +
      `${MEASURED_GRACE_MS} ms. The process will be killed inside the wait and a cut-off run ` +
      'will go unreported — the exact fault of 21 September. Lower DRAIN_BUDGET_MS.',
  );
}

export function installShutdownHandlers(server: Closable): void {
  reportTheBudgetAgainstTheGrace();
  const shutdown = (signal: string): void => {
    const startedAt = Date.now();
    /**
     * THE BUDGET IS NAMED HERE BECAUSE THE FAILURE IS A MISSING LINE.
     *
     * `reportElapsed` compares the elapsed time against `MEASURED_GRACE_MS` and
     * says OVER or inside — but it can only say either if the process is still
     * alive to say it. If the platform's `drainingSeconds` is ever lowered
     * below this budget, the container is killed mid-drain and that line is
     * never written at all. The evidence of the fault is the ABSENCE of the
     * second line, which is unreadable unless the first one told you what to
     * expect.
     *
     * So this line names the wait. „draining, 2 run(s), waiting up to 87000 ms"
     * followed by nothing means the platform did not give us 87 seconds, and
     * `MEASURED_GRACE_MS` and `scripts/ops/drain.sh show` disagree.
     */
    // eslint-disable-next-line no-console
    console.log(
      `[shutdown] ${signal}: draining, ${inFlightCount()} run(s) in flight, ` +
        `waiting up to ${DRAIN_BUDGET_MS} ms (grace ${MEASURED_GRACE_MS} ms). ` +
        'If no "exiting after" line follows, the platform killed us first.',
    );
    server.close();
    void finishShutdown(signal)
      .catch((err: unknown) => {
        // eslint-disable-next-line no-console
        console.error('[shutdown] drain failed:', (err as Error).message);
      })
      .finally(() => {
        reportElapsed(signal, startedAt);
        process.exit(0);
      });
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}
