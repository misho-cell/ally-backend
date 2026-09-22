import { query } from '../db/postgres/client';

/**
 * Ticket 20 rows 231 and 239 — the durable half of a wake.
 *
 * `wakeWhenFree` is a `setTimeout` inside the process, and the comment above
 * it already says what that costs: „a fifth way out that reaches no branch at
 * all: THE PROCESS DIES." There is a floor under it — an open goal is picked
 * up within a day — and the floor works. Measured 22 September over the
 * preceding week's 41 approvals: 30 got their first day in 7-67 seconds and
 * ELEVEN were rescued by the floor at about 86,450 seconds.
 *
 * A DAY IS NOT WHAT THE OWNER WAS TOLD. The refusal the product writes in that
 * same turn says „day one is already starting behind your reply". So the fault
 * is not that nothing happens — it is that the sentence is false for 27% of
 * approvals, and the way to mend it is to make the sentence true rather than
 * to soften it.
 *
 * This table is the net: a wake is written down before the timer runs, and a
 * sweeper picks up anything still unfinished after its due time. The timer
 * stays — it is instant and right three times in four — and the net turns a
 * lost wake from a day into about a minute.
 *
 * ONLY DAY ONE FOR NOW, deliberately. It is the one that was measured and the
 * one the seat's done-when is written about. The plan proposal and the
 * introduction outcome die the same way and can be added the same way, once
 * this has been watched working on something real.
 */

const WAKE_QUERY_TIMEOUT_MS = 5_000;

/** The only kind recorded today. A new kind is a new string and a caller. */
export const DAY_ONE_WAKE = 'day_one';

export interface OverdueWake {
  readonly id: string;
  readonly taskId: number;
  readonly kind: string;
  readonly attempts: number;
}

/**
 * Write down that a wake is owed. Best-effort and silent on conflict: the
 * partial unique index means a second approval of the same plan adds nothing,
 * which is the same promise `wakeTask`'s own guard makes in memory.
 *
 * Never throws. A goal must not fail to be approved because the net could not
 * be written — the timer is still there and so is the day-long floor.
 */
export async function recordWake(taskId: number, kind: string, dueInMs: number): Promise<void> {
  try {
    await query(
      `INSERT INTO engine_wakes (task_id, kind, due_at)
       VALUES ($1, $2, NOW() + make_interval(secs => $3))
       ON CONFLICT DO NOTHING`,
      [taskId, kind, dueInMs / 1000],
      WAKE_QUERY_TIMEOUT_MS,
    );
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(
      `[engine-wakes] could not record ${kind} for task ${taskId}:`,
      (err as Error).message,
    );
  }
}

/**
 * The wake happened, or will never happen. Either way it is off the sweeper's
 * list — „it ran" and „nothing a retry could change" are the same fact to a
 * net whose only job is to stop something being forgotten.
 */
export async function finishWake(taskId: number, kind: string): Promise<void> {
  try {
    await query(
      `UPDATE engine_wakes SET done_at = NOW()
        WHERE task_id = $1 AND kind = $2 AND done_at IS NULL`,
      [taskId, kind],
      WAKE_QUERY_TIMEOUT_MS,
    );
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(
      `[engine-wakes] could not finish ${kind} for task ${taskId}:`,
      (err as Error).message,
    );
  }
}

/**
 * How long past its due time a wake has to be before the sweeper takes it.
 *
 * The timer's own window is the delay plus fifteen retries at six seconds,
 * about ninety seconds in all, so anything shorter than that would race a
 * timer that is still working. Two minutes is that window plus a margin, and
 * it is also the seat's done-when — „every approval gets its first day within
 * two minutes, restart or not".
 */
const OVERDUE_AFTER_SECONDS = 120;

/**
 * How long a claim holds before the sweeper may take the wake again. A claimed
 * wake whose process then died would otherwise be stuck for ever, which is the
 * fault this whole table exists to fix.
 */
const CLAIM_HOLDS_FOR_SECONDS = 300;

/** Stop a goal being woken for ever by a wake that never reports back. */
const MAX_ATTEMPTS = 5;

/**
 * Take the overdue wakes, atomically.
 *
 * UPDATE ... RETURNING rather than SELECT then UPDATE, so the timer and the
 * sweeper — or two sweepers — cannot both run the same wake whatever the
 * timing. A row this returns is this caller's and nobody else's.
 */
export async function claimOverdueWakes(limit: number): Promise<OverdueWake[]> {
  const result = await query<{
    id: string;
    task_id: number;
    kind: string;
    attempts: number;
  }>(
    `UPDATE engine_wakes SET claimed_at = NOW(), attempts = attempts + 1
      WHERE id IN (
        SELECT id FROM engine_wakes
         WHERE done_at IS NULL
           AND attempts < $2
           AND due_at < NOW() - make_interval(secs => $3)
           AND (claimed_at IS NULL OR claimed_at < NOW() - make_interval(secs => $4))
         ORDER BY due_at
         LIMIT $1
         FOR UPDATE SKIP LOCKED
      )
      RETURNING id, task_id, kind, attempts`,
    [limit, MAX_ATTEMPTS, OVERDUE_AFTER_SECONDS, CLAIM_HOLDS_FOR_SECONDS],
    WAKE_QUERY_TIMEOUT_MS,
  );
  return result.rows.map((r) => ({
    id: String(r.id),
    taskId: r.task_id,
    kind: r.kind,
    attempts: r.attempts,
  }));
}

/**
 * A wake that has used its attempts is given up on, IN THE TABLE, with the
 * count still readable. „It was tried five times and never got in" is a
 * different fact from „nobody ever queued it", and a row that says so is the
 * only way to tell them apart later.
 */
export async function abandonExhaustedWakes(): Promise<number> {
  const result = await query<{ id: string }>(
    `UPDATE engine_wakes SET done_at = NOW()
      WHERE done_at IS NULL AND attempts >= $1
      RETURNING id`,
    [MAX_ATTEMPTS],
    WAKE_QUERY_TIMEOUT_MS,
  );
  return result.rows.length;
}
