import { query } from '../db/postgres/client';
import { saveThreadMessage, STATUS_LINES, ThreadStatus, threadLanguage } from './threads.service';
import { RUN_STRINGS } from './runLanguage';
import { emitRunError, emitThreadUpdated } from './sse.service';

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

/**
 * The line a reaped run leaves on the owner's screen, in the language of the
 * conversation it died in.
 *
 * Found 18 September on thread 17724: an English goal, killed by this sweep,
 * and the only thing left on the owner's screen was 57 Georgian characters
 * with no Latin at all. It is the one message a person reads carefully,
 * because it is the one telling them something went wrong, and it was the last
 * fixed string in the product still Georgian in every language.
 *
 * The owner's own messages decide, as everywhere else. A thread whose language
 * cannot be read falls back to Georgian, which is what this always was.
 */
async function orphanMessageFor(threadId: number): Promise<string> {
  const language = await threadLanguage(threadId).catch(() => 'ka' as const);
  return RUN_STRINGS[language].runDied;
}

/**
 * Ticket 20 row 214 — a dead run has to END on the screen, not only in the row.
 *
 * The seat watched thread 18086 for four minutes. The run died; the error was
 * written into the thread at 18:01:08, correct and in the right language; and
 * the open page showed the step list frozen on „Searching saved info…", with
 * no spinner, no error and no retry. A reload produced all three at once.
 *
 * This is row 113's ninth pass, in a second place. Its own note in the route
 * says it: „run_complete is the only thing that ends a run for the client".
 * The sweep below told every device the THREAD's new status, which repaints
 * the chat list, and never told the open conversation that the run it is
 * watching is over.
 *
 * To say that, the run needs a name, and the run that died took its id down
 * with it — thread 18086 holds two rows and neither carries one. The prompt
 * stamp does: it is written at the start of every run, 155 ms after the
 * owner's message on that very thread, and a thread stuck on „working" is
 * stuck on its newest run by construction.
 *
 * Null when a run died before it was ever stamped. That is a real case and it
 * is reported rather than papered over: the badge still clears, and the person
 * still has to reload, and I would rather read that in a log than believe this
 * always works.
 */
async function lastRunOnThread(threadId: number): Promise<string | null> {
  const result = await query<{ run_id: string }>(
    `SELECT run_id FROM run_prompt_stamps
      WHERE thread_id = $1
      ORDER BY created_at DESC
      LIMIT 1`,
    [threadId],
  );
  return result.rows[0]?.run_id ?? null;
}

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
    /**
     * Ticket 20 row 3 — a reply DID land on this thread just before it went
     * quiet, so „your reply could not be completed" would be false.
     *
     * Thread 15841, Tornike's volleyball goal, 16 September: run fe7980fa
     * wrote a complete plan at 15:34:22, and at 15:35:42 this sweep wrote
     * „ტექნიკური შეფერხება მოხდა — პასუხი ვერ დასრულდა" underneath it. The
     * answer was on the screen directly above the error saying it had failed.
     *
     * Something left the thread on 'working' after a run finished and I have
     * NOT established what — two runs overlapped on that thread and both
     * status writes are fire-and-forget, which is a candidate and not a
     * finding. Clearing a stale status is right whatever the cause; telling
     * the owner their answer failed, while it is visible above, never is.
     */
    answered: boolean;
    /**
     * Ticket 20 row 33 — the split goal's chat that held nothing but an error.
     *
     * Thread 16905, 17 September. A second need typed into goal 4852's chat
     * opened goal 4853 on a thread of its own, and at 19:17:45 the owner
     * clicked it in the sidebar and landed on „a technical delay occurred, the
     * answer could not be finished". The plan arrived two minutes later.
     *
     * This sweep wrote that error, and the thread was created by my own row 33
     * fix — deliberately `status: 'working'`, because the plan-proposal turn is
     * queued four seconds out and „done" would have been a lie. A newborn
     * thread is silent for the same reason a newborn is: nothing has happened
     * yet. Seventy-five seconds later it looked exactly like a thread whose run
     * had died.
     *
     * The claim the error makes is about a REPLY — „yours could not be
     * finished". A thread the owner has never typed a word in is owed no
     * reply, so there is none to have failed. Same split as `answered` above,
     * for the same reason: the STATUS is cleared either way, because a thread
     * stuck on „working" is a spinner that never stops; the SENTENCE is only
     * written when it is true.
     */
    was_asked: boolean;
  }>(
    `WITH orphaned AS (
       SELECT t.id,
              EXISTS (
                SELECT 1 FROM tasks k
                WHERE k.thread_id = t.id AND k.status = 'open'
                  AND k.pending_question_at IS NOT NULL
              ) AS awaits_owner,
              -- Row 3: did this thread actually ANSWER just before it went
              -- quiet? Twice the silence window, so a reply that landed and
              -- then left the status stale is still inside it.
              EXISTS (
                SELECT 1 FROM conversations c
                WHERE c.thread_id = t.id AND c.role = 'assistant'
                  AND c.kind = 'message' AND c.content <> ''
                  AND c.created_at > NOW() - ($3 || ' seconds')::interval * 2
              ) AS answered,
              -- Row 33: has the owner ever typed in this thread at all? An
              -- engine wake is stored role='user' too, so this asks for a real
              -- human turn — kind='message', not 'event'.
              EXISTS (
                SELECT 1 FROM conversations c
                WHERE c.thread_id = t.id AND c.role = 'user'
                  AND c.kind = 'message' AND c.content <> ''
              ) AS was_asked
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
     RETURNING t.id, t.user_id, t.status, t.status_line, o.answered, o.was_asked`,
    [STATUS_LINES.failed, STATUS_LINES.needs_you, RUN_SILENT_SECONDS],
  );
  for (const thread of result.rows) {
    // Persist the failure INTO the thread (kind='error' → system-styled with a
    // retry) and tell every connected device. Best-effort per thread.
    try {
      // The status is cleared either way — a thread stuck on 'working' is a
      // spinner that never stops. The ERROR is written only when nothing was
      // answered, because it is a claim about the REPLY, not about the row.
      if (thread.answered) {
        // eslint-disable-next-line no-console
        console.warn(
          `[run-reaper] thread ${thread.id} was stale on 'working' but had answered — ` +
            'status cleared, no error shown',
        );
      } else if (!thread.was_asked) {
        // Row 33: nobody has asked anything here, so no reply of theirs failed.
        // eslint-disable-next-line no-console
        console.warn(
          `[run-reaper] thread ${thread.id} was stale on 'working' with no question on it — ` +
            'status cleared, no error shown',
        );
      } else {
        const message = await orphanMessageFor(thread.id);
        // Row 214: the id the run died with, so the error row can be joined to
        // it (row 202) and the open page can be told which run ended.
        const runId = await lastRunOnThread(thread.id).catch(() => null);
        await saveThreadMessage(thread.id, thread.user_id, 'assistant', message, 'error', runId);
        if (runId === null) {
          // eslint-disable-next-line no-console
          console.warn(
            `[run-reaper] thread ${thread.id}: no run stamp to name — the error is in the ` +
              'thread but the open page will keep its spinner until it is reloaded',
          );
        } else {
          emitRunError(String(thread.user_id), thread.id, runId, message);
        }
      }
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
