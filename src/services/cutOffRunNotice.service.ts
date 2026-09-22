import { CutOffRun, REPORT_RESERVE_MS } from './inFlightRuns';
import { RUN_STRINGS } from './runLanguage';
import { emitRunError } from './sse.service';
import { saveThreadMessage, threadLanguage } from './threads.service';

/**
 * Ticket 20 — the deploy row. What the owner is told when WE killed their run.
 *
 * 21 September, thread 21121, read from the two containers' logs:
 *
 *   23:19:24  my deploy is created
 *   23:20:55  the owner's message arrives in the OLD container
 *   23:20:56  SIGTERM — the drain starts, one run in flight
 *   23:21:07  the platform kills the container mid-wait
 *   23:22:14  the reaper notices the silence and writes „ტექნიკური შეფერხება
 *             მოხდა — პასუხი ვერ დასრულდა. გთხოვ, სცადე თავიდან."
 *
 * Between 23:21:07 and 23:22:14 the owner watched a spinner that had nothing
 * behind it, and what they got at the end of it was the sentence for a fault.
 * It was not a fault. It was my deploy.
 *
 * THE REAPER IS NOT WRONG, IT IS LATE AND IT IS GUESSING — and it has to be:
 * a thread that has gone quiet might hold a dead run or a live one, so it
 * waits out seventy-five seconds of silence before it will say anything. The
 * dying process does not have to guess. It has the list.
 *
 * So this runs in the seconds the platform grants after SIGTERM and does the
 * one thing that cannot be done from anywhere else: names the cause, at once,
 * to the person who is looking at the screen.
 *
 * WHAT IT DELIBERATELY DOES NOT DO:
 *
 * - It does not touch the thread's status. Clearing that correctly means
 *   knowing whether an open goal is waiting on the owner — „failed" over a
 *   thread that should read „needs your answer" is ticket 9 task 20 (b) undone.
 *   The reaper already decides that properly and will still do it; all this
 *   takes off its hands is the sentence, and `sweepOrphanedRuns` skips writing
 *   a second one under one that is already the newest thing in the thread.
 * - It says nothing on an ENGINE run. A wake is work nobody asked for, so
 *   there is no reply of theirs to have failed — row 33's rule, in the third
 *   place it has come up. The run is logged and left to the reaper.
 * - It promises no resumption. Nothing picks the run back up: the process that
 *   held it is gone. „Send it again" is the whole of what is true.
 */

/**
 * The reserve, TAKEN FROM THE RESERVE, and not a second number beside it.
 *
 * This read `const NOTICE_TIMEOUT_MS = 2_500` when it shipped this morning,
 * three hours after I wrote `REPORT_RESERVE_MS = 3_000` in another file to
 * describe the same window. Two numbers for one thing, free to drift: raise
 * this one to four seconds and the budget still reserves three, the test in
 * `inFlightRuns` still passes, and the process is killed in the middle of
 * writing to somebody's thread.
 *
 * That is the defect this whole row is about — a number that promises what it
 * does not control — reappearing inside the fix for it. So there is one
 * number, and it lives with the budget that is sized around it.
 *
 * A margin under the reserve rather than all of it: the log lines and the
 * exit have to happen after this returns, inside the same window.
 */
const NOTICE_MARGIN_MS = 500;
const NOTICE_TIMEOUT_MS = Math.max(0, REPORT_RESERVE_MS - NOTICE_MARGIN_MS);

async function tellOneOwner(run: CutOffRun): Promise<void> {
  // Same source as the reaper's own message, so the two cannot drift into two
  // different readings of one conversation's language.
  const language = await threadLanguage(run.threadId).catch(() => 'ka' as const);
  const message = RUN_STRINGS[language].restartedMidRun;
  await saveThreadMessage(run.threadId, run.userId, 'assistant', message, 'error', run.runId);
  // Free, and worth trying: `server.close()` stops new connections and leaves
  // open ones alone, so a stream the owner is watching may still be there.
  // `run_error` is also what ends the run for the client — without it the page
  // keeps its spinner until a reload, which is row 214.
  emitRunError(String(run.userId), run.threadId, run.runId, message);
}

/**
 * Tell every owner whose answer this shutdown cut off. Returns how many were
 * told, which is not the same as how many were cut off — the engine runs among
 * them are counted by the caller and deliberately left silent.
 *
 * Never throws and never waits past its own budget. This is the last thing a
 * dying process does; an error here must not cost it the clean exit, and a slow
 * database must not cost it the SIGKILL it is racing.
 */
export async function tellOwnersTheirRunWasCutOff(
  cutOff: readonly CutOffRun[],
  timeoutMs: number = NOTICE_TIMEOUT_MS,
): Promise<number> {
  const waiting = cutOff.filter((run) => run.kind === 'chat');
  if (waiting.length === 0) return 0;

  let told = 0;
  const work = Promise.all(
    waiting.map(async (run) => {
      try {
        await tellOneOwner(run);
        told += 1;
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error(
          `[shutdown] could not tell user ${run.userId} that run ${run.runId} was cut off:`,
          (err as Error).message,
        );
      }
    }),
  );
  const ranOut = new Promise<void>((resolve) => {
    setTimeout(resolve, timeoutMs).unref();
  });
  await Promise.race([work, ranOut]);

  if (told < waiting.length) {
    // eslint-disable-next-line no-console
    console.error(
      `[shutdown] told ${told} of ${waiting.length} owner(s) before the grace ran out — ` +
        'the rest fall to the run reaper, about 75s later',
    );
  }
  return told;
}
