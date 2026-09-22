import { tellOwnersTheirRunWasCutOff } from './cutOffRunNotice.service';
import { CutOffRun, drain, inFlightCount, MEASURED_GRACE_MS } from './inFlightRuns';

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

export function installShutdownHandlers(server: Closable): void {
  const shutdown = (signal: string): void => {
    const startedAt = Date.now();
    // eslint-disable-next-line no-console
    console.log(`[shutdown] ${signal}: draining, ${inFlightCount()} run(s) in flight`);
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
