import { randomUUID } from 'crypto';
import { query } from '../db/postgres/client';
import { runOwnerMessage } from '../api/routes/threads.routes';
import { THREAD_QUEUE_BUDGET_MS, THREAD_QUEUE_POLL_MS } from '../config/runBudgets';
import { scrubMechanicalForStorage } from './privacyScrub';
import { detectRunLanguage, RUN_STRINGS } from './runLanguage';
import { enterThread } from './threadRunQueue';
import { setThreadStatus } from './threadStatus.service';
import { getThread } from './threads.service';

/**
 * Tester 1013, 2 October — Ninia's answer, cut off by my own deploy.
 *
 * The platform gives an old container about eleven seconds after SIGTERM and a
 * run takes sixty to ninety, so no amount of waiting in the dying process can
 * finish it. What the dying process CAN do it already does: it writes
 * „the server restarted, send it again" into the thread (cutOffRunNotice).
 *
 * „Send it again" asks the owner to do the server's job. Their message is
 * already stored — row 212 writes it the moment it arrives — so the new
 * container can run it itself. That is all this does: in the first minutes
 * after boot it looks for that notice, and where the notice is still the last
 * word in the thread and the owner's own message sits right above it, it takes
 * the notice back and runs the message through the same path the route uses.
 *
 * WHY A WINDOW OF SWEEPS AND NOT ONE: the new container is healthy BEFORE the
 * old one is told to stop, so the notice is written some seconds after this
 * process has booted. A single boot-time look would usually come too early.
 *
 * WHAT IT DOES NOT DO:
 * - Restart twice. A restarted run carries `RESUMED_RUN_PREFIX` in its id, and
 *   the notice the drain writes carries the run id, so a restarted run that a
 *   second deploy cuts off is left with its notice. One retry, never a loop.
 * - Touch a thread the owner has typed in since. The notice must be the newest
 *   row; their new message would be newer, and the route answers it.
 * - Restart engine runs. The drain writes no notice for those (a wake is work
 *   nobody asked for), so there is nothing here to find.
 * - Carry `as_goal` or a reply-to id. Neither is stored with the message; the
 *   run reads the thread as it stands, which already holds any goal it made.
 */

/** Marks a run started here, so it is never started a second time. */
export const RESUMED_RUN_PREFIX = 'resumed-';
/** How long after boot the sweep keeps looking: the old container's grace sits inside it. */
const RESUME_WINDOW_MS = 3 * 60_000;
const RESUME_SWEEP_EVERY_MS = 15_000;
/** A notice older than boot by more than this belongs to an earlier deploy. */
const NOTICE_BEFORE_BOOT_MS = 2 * 60_000;
/** The owner's message must sit this close above the notice: one run's length, with room. */
const MESSAGE_BEFORE_NOTICE_SECONDS = 5 * 60;
const MAX_RESUMES_PER_SWEEP = 10;
const RESUME_QUERY_TIMEOUT_MS = 5_000;

export interface CutOffMessage {
  readonly noticeId: string;
  readonly threadId: number;
  readonly userId: number;
  readonly message: string;
}

/**
 * The notice in every language, as written and as storage scrubs it: the
 * scrub turns dashes into commas, and a wording change must not hide a row.
 */
export function storedNoticeTexts(): string[] {
  const raw = Object.values(RUN_STRINGS).map((s) => s.restartedMidRun);
  return [...new Set([...raw, ...raw.map(scrubMechanicalForStorage)])];
}

/** Notices still standing as the last word, each with the owner message right above it. */
export async function findCutOffMessages(since: Date): Promise<CutOffMessage[]> {
  const result = await query<{
    notice_id: string;
    thread_id: number;
    user_id: number;
    message: string;
  }>(
    `SELECT n.id AS notice_id, n.thread_id, n.user_id, u.content AS message
       FROM conversations n
       JOIN LATERAL (
         SELECT p.role, p.content, p.created_at FROM conversations p
          WHERE p.thread_id = n.thread_id AND p.created_at < n.created_at
            AND p.kind IN ('message', 'error')
          ORDER BY p.created_at DESC LIMIT 1
       ) u ON TRUE
      WHERE n.role = 'assistant' AND n.kind = 'error'
        AND n.content = ANY($1::text[])
        AND n.created_at > $2
        AND (n.run_id IS NULL OR n.run_id NOT LIKE $3)
        AND NOT EXISTS (
          SELECT 1 FROM conversations x WHERE x.thread_id = n.thread_id AND x.created_at > n.created_at
        )
        AND u.role = 'user'
        AND u.created_at > n.created_at - ($4 || ' seconds')::interval
      ORDER BY n.created_at
      LIMIT $5`,
    [
      storedNoticeTexts(),
      since,
      `${RESUMED_RUN_PREFIX}%`,
      String(MESSAGE_BEFORE_NOTICE_SECONDS),
      MAX_RESUMES_PER_SWEEP,
    ],
    RESUME_QUERY_TIMEOUT_MS,
  );
  return result.rows.map((r) => ({
    noticeId: r.notice_id,
    threadId: r.thread_id,
    userId: r.user_id,
    message: r.message,
  }));
}

/**
 * Takes the notice back. Only the error row with that id, and only if it is
 * still the last word — a message that landed since keeps it.
 */
async function withdrawNotice(cut: CutOffMessage): Promise<boolean> {
  const result = await query(
    `DELETE FROM conversations n
      WHERE n.id = $1 AND n.kind = 'error'
        AND NOT EXISTS (
          SELECT 1 FROM conversations x WHERE x.thread_id = n.thread_id AND x.created_at > n.created_at
        )`,
    [cut.noticeId],
    RESUME_QUERY_TIMEOUT_MS,
  );
  return (result.rowCount ?? 0) > 0;
}

/** Restarts one cut-off message. Returns whether a run was started. */
export async function resumeOne(cut: CutOffMessage): Promise<boolean> {
  const userId = String(cut.userId);
  const thread = await getThread(cut.threadId, userId);
  if (thread === null) return false;
  if (!(await withdrawNotice(cut))) return false;

  const runId = `${RESUMED_RUN_PREFIX}${randomUUID()}`;
  await setThreadStatus(userId, cut.threadId, 'working', {
    statusLine: RUN_STRINGS[detectRunLanguage(cut.message)].statusLines.working,
  });
  await enterThread(cut.threadId, runId, THREAD_QUEUE_BUDGET_MS, THREAD_QUEUE_POLL_MS);
  runOwnerMessage({
    userId,
    threadId: cut.threadId,
    thread,
    message: cut.message,
    runId,
    asGoal: false,
    storedOnArrival: true,
    inReplyToMessageId: undefined,
    needsTitle: false,
  });
  // eslint-disable-next-line no-console
  console.log(`[run-resume] thread ${cut.threadId}: cut-off message restarted as ${runId}`);
  return true;
}

/** One look. Never throws: a failed restart leaves the notice, which is still true. */
export async function resumeCutOffRuns(since: Date): Promise<number> {
  let started = 0;
  try {
    const cut = await findCutOffMessages(since);
    for (const one of cut) {
      try {
        if (await resumeOne(one)) started += 1;
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error(`[run-resume] thread ${one.threadId}:`, (err as Error).message);
      }
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[run-resume] sweep failed:', (err as Error).message);
  }
  return started;
}

/** Sweeps every RESUME_SWEEP_EVERY_MS for RESUME_WINDOW_MS after boot, one look at a time. */
export function startCutOffRunResume(bootedAt: Date = new Date()): void {
  const since = new Date(bootedAt.getTime() - NOTICE_BEFORE_BOOT_MS);
  const stopAt = bootedAt.getTime() + RESUME_WINDOW_MS;
  const sweep = (): void => {
    void resumeCutOffRuns(since).then(() => {
      if (Date.now() + RESUME_SWEEP_EVERY_MS <= stopAt) {
        setTimeout(sweep, RESUME_SWEEP_EVERY_MS).unref();
      }
    });
  };
  setTimeout(sweep, RESUME_SWEEP_EVERY_MS).unref();
}
