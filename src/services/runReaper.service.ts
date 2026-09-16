import { query } from '../db/postgres/client';
import { saveThreadMessage, STATUS_LINES, ThreadStatus } from './threads.service';
import { emitThreadUpdated } from './sse.service';

// A thread still 'working' with NO SIGN OF LIFE means the process that owned
// the run died (deploy restart, crash) taking its timers with it — the "thread
// hangs forever with no error" family. The reaper turns those into visible,
// retryable failures.
//
// Ticket 20 row 114 changed the question this asks. It used to be an AGE: how
// long has the thread been working? That has to sit above the longest run a
// person may legitimately wait through, so the answer could not come in under
// about five minutes — and on 16 September a deploy landed 52 seconds into a
// run and the owner got no answer and no error until they gave up.
//
// It is now a SILENCE. A live run touches its thread on every heartbeat, so a
// thread that has not made a sound for 75 seconds is dead however long its run
// was meant to take. That also holds whether one process is running or five,
// which an age threshold could never promise.
import { RUN_SILENT_MS } from '../config/runBudgets';

// Twenty seconds, not sixty. The threshold below is a silence of 75s, so the
// sweep interval is what stands between „it went quiet" and „somebody is told":
// at 60s that was up to 135s, at 20s it is up to 95s.
// Twenty seconds, not sixty. The threshold is a 75-second silence, so the sweep
// interval is all that stands between „it went quiet" and „somebody is told":
// at 60s that was up to 135s, at 20s it is up to 95s.
const SWEEP_INTERVAL_MS = 20_000;
const RUN_SILENT_SECONDS = Math.ceil(RUN_SILENT_MS / 1_000);
const BOOT_SWEEP_DELAY_MS = 10_000;

const ORPHAN_MESSAGE = 'ტექნიკური შეფერხება მოხდა — პასუხი ვერ დასრულდა. გთხოვ, სცადე თავიდან.';

export async function sweepOrphanedRuns(): Promise<number> {
  // A reaped thread whose OPEN goal is waiting for the owner's answer keeps
  // the `needs_you` badge (ticket 9 task 20 b): the dead run is told in the
  // error row below, and the badge is reserved for "this thread waits for
  // you" — which is exactly what a standing goal question is.
  const result = await query<{
    id: number;
    user_id: number;
    status: ThreadStatus;
    status_line: string | null;
  }>(
    `WITH orphaned AS (
       SELECT t.id,
              EXISTS (
                SELECT 1 FROM tasks k
                WHERE k.thread_id = t.id AND k.status = 'open'
                  AND k.pending_question_at IS NOT NULL
              ) AS awaits_owner
       FROM threads t
       WHERE t.status = 'working'
         AND t.updated_at < NOW() - ($3 || ' seconds')::interval
     )
     UPDATE threads t
     SET status = CASE WHEN o.awaits_owner THEN 'needs_you' ELSE 'failed' END,
         status_line = CASE WHEN o.awaits_owner THEN $2 ELSE $1 END,
         updated_at = NOW()
     FROM orphaned o
     WHERE o.id = t.id
     RETURNING t.id, t.user_id, t.status, t.status_line`,
    [STATUS_LINES.failed, STATUS_LINES.needs_you, RUN_SILENT_SECONDS],
  );
  for (const thread of result.rows) {
    // Persist the failure INTO the thread (kind='error' → system-styled with a
    // retry) and tell every connected device. Best-effort per thread.
    try {
      await saveThreadMessage(thread.id, thread.user_id, 'assistant', ORPHAN_MESSAGE, 'error');
      emitThreadUpdated(String(thread.user_id), {
        id: thread.id,
        status: thread.status,
        status_line: thread.status_line,
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`[run-reaper] failed to persist error for thread ${thread.id}:`, err);
    }
  }
  if (result.rows.length > 0) {
    // eslint-disable-next-line no-console
    console.log(`[run-reaper] reaped ${result.rows.length} orphaned run(s)`);
  }
  return result.rows.length;
}

export function startRunReaper(): void {
  setTimeout(() => {
    void sweepOrphanedRuns().catch((err) =>
      // eslint-disable-next-line no-console
      console.error('[run-reaper] boot sweep failed:', err),
    );
  }, BOOT_SWEEP_DELAY_MS).unref();

  setInterval(() => {
    void sweepOrphanedRuns().catch((err) =>
      // eslint-disable-next-line no-console
      console.error('[run-reaper] sweep failed:', err),
    );
  }, SWEEP_INTERVAL_MS).unref();

  // eslint-disable-next-line no-console
  console.log(
    `[run-reaper] started (${SWEEP_INTERVAL_MS / 1000}s sweep, ${RUN_SILENT_SECONDS}s silence)`,
  );
}
