import { query } from '../db/postgres/client';
import { saveThreadMessage, STATUS_LINES } from './threads.service';
import { emitThreadUpdated } from './sse.service';

// A legitimate run can live at most ~110s (the route's hard timeout). A thread
// still 'working' well past that means the process that owned the run died
// (deploy restart, crash) taking its timers with it — the "thread hangs
// forever with no error" family. The reaper turns those into visible,
// retryable failures.
const SWEEP_INTERVAL_MS = 60_000;
const ORPHAN_AGE_MINUTES = 4;
// At boot every 'working' thread is an orphan of the previous process, but a
// blue-green overlap could still be finishing one — use a shorter grace, not 0.
const BOOT_ORPHAN_AGE_MINUTES = 2;
const BOOT_SWEEP_DELAY_MS = 10_000;

const ORPHAN_MESSAGE = 'ტექნიკური შეფერხება მოხდა — პასუხი ვერ დასრულდა. გთხოვ, სცადე თავიდან.';

export async function sweepOrphanedRuns(minAgeMinutes: number): Promise<number> {
  const result = await query<{ id: number; user_id: number }>(
    `UPDATE threads
     SET status = 'failed', status_line = $1, updated_at = NOW()
     WHERE status = 'working'
       AND updated_at < NOW() - ($2 || ' minutes')::interval
     RETURNING id, user_id`,
    [STATUS_LINES.failed, minAgeMinutes],
  );
  for (const thread of result.rows) {
    // Persist the failure INTO the thread (kind='error' → system-styled with a
    // retry) and tell every connected device. Best-effort per thread.
    try {
      await saveThreadMessage(thread.id, thread.user_id, 'assistant', ORPHAN_MESSAGE, 'error');
      emitThreadUpdated(String(thread.user_id), {
        id: thread.id,
        status: 'failed',
        status_line: STATUS_LINES.failed,
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
