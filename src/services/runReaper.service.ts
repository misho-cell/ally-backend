import { query } from '../db/postgres/client';
import { saveThreadMessage, STATUS_LINES, ThreadStatus } from './threads.service';
import { emitThreadUpdated } from './sse.service';

// A thread still 'working' well past the hard run ceiling means the process
// that owned the run died (deploy restart, crash) taking its timers with it —
// the "thread hangs forever with no error" family. The reaper turns those
// into visible, retryable failures. Thresholds follow the shared budget
// family, so raising run budgets via env moves them automatically.
import { ORPHAN_AGE_MS, BOOT_ORPHAN_AGE_MS } from '../config/runBudgets';

const SWEEP_INTERVAL_MS = 60_000;
const ORPHAN_AGE_MINUTES = Math.ceil(ORPHAN_AGE_MS / 60_000);
const BOOT_ORPHAN_AGE_MINUTES = Math.ceil(BOOT_ORPHAN_AGE_MS / 60_000);
const BOOT_SWEEP_DELAY_MS = 10_000;

const ORPHAN_MESSAGE = 'ტექნიკური შეფერხება მოხდა — პასუხი ვერ დასრულდა. გთხოვ, სცადე თავიდან.';

export async function sweepOrphanedRuns(minAgeMinutes: number): Promise<number> {
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
         AND t.updated_at < NOW() - ($3 || ' minutes')::interval
     )
     UPDATE threads t
     SET status = CASE WHEN o.awaits_owner THEN 'needs_you' ELSE 'failed' END,
         status_line = CASE WHEN o.awaits_owner THEN $2 ELSE $1 END,
         updated_at = NOW()
     FROM orphaned o
     WHERE o.id = t.id
     RETURNING t.id, t.user_id, t.status, t.status_line`,
    [STATUS_LINES.failed, STATUS_LINES.needs_you, minAgeMinutes],
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
    void sweepOrphanedRuns(BOOT_ORPHAN_AGE_MINUTES).catch((err) =>
      // eslint-disable-next-line no-console
      console.error('[run-reaper] boot sweep failed:', err),
    );
  }, BOOT_SWEEP_DELAY_MS).unref();

  setInterval(() => {
    void sweepOrphanedRuns(ORPHAN_AGE_MINUTES).catch((err) =>
      // eslint-disable-next-line no-console
      console.error('[run-reaper] sweep failed:', err),
    );
  }, SWEEP_INTERVAL_MS).unref();

  // eslint-disable-next-line no-console
  console.log('[run-reaper] started (60s sweep, 4min orphan threshold)');
}
