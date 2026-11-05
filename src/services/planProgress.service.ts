import { query, withTransaction } from '../db/postgres/client';

/**
 * Autonomy stage 2, K2: where a goal's plan stands — the current step
 * (tasks.plan_step) and what happened on each step (plan_step_events).
 *
 * Storage only: what a step's rule says to do next is planAdvance's question.
 * Every read is LIMITed, every statement parameterized and timed.
 */

export enum StepEventKind {
  Started = 'started',
  Sent = 'sent',
  Answered = 'answered',
  Declined = 'declined',
  Silent = 'silent',
  Named = 'named',
}

export interface StepEvent {
  readonly step_id: string;
  readonly kind: StepEventKind;
  readonly ref: string | null;
  readonly created_at: string;
}

const PROGRESS_QUERY_TIMEOUT_MS = 5_000;
/** The most events one read returns — enough for the prompt's „where we are". */
export const MAX_STEP_EVENTS_READ = 20;

export async function recordStepEvent(
  taskId: number,
  stepId: string,
  kind: StepEventKind,
  ref: string | null = null,
): Promise<void> {
  await query(
    `INSERT INTO plan_step_events (task_id, step_id, kind, ref) VALUES ($1, $2, $3, $4)`,
    [taskId, stepId, kind, ref],
    PROGRESS_QUERY_TIMEOUT_MS,
  );
}

/**
 * Make this step the current one and record that it started — two tables, one
 * transaction, so the current step never names a step with no start.
 */
export async function moveToStep(taskId: number, stepId: string): Promise<void> {
  await withTransaction(async (client) => {
    await client.query(`UPDATE tasks SET plan_step = $2 WHERE id = $1`, [taskId, stepId]);
    await client.query(
      `INSERT INTO plan_step_events (task_id, step_id, kind) VALUES ($1, $2, $3)`,
      [taskId, stepId, StepEventKind.Started],
    );
  });
}

export interface PlanPosition {
  readonly currentStepId: string | null;
  /** K5: the owner's approval handed the decisions over. */
  readonly delegated: boolean;
}

/** The current step and whether the approval was a delegation, in one read. */
export async function planPosition(taskId: number): Promise<PlanPosition> {
  const result = await query<{ plan_step: string | null; plan_delegated: boolean | null }>(
    `SELECT plan_step, plan_delegated FROM tasks WHERE id = $1 LIMIT 1`,
    [taskId],
    PROGRESS_QUERY_TIMEOUT_MS,
  );
  const row = result.rows[0];
  return { currentStepId: row?.plan_step ?? null, delegated: row?.plan_delegated === true };
}

/**
 * K5: store whether this approval was a delegation. Written on EVERY approval,
 * so a later plan approved without one does not inherit the earlier yes.
 */
export async function setPlanDelegated(
  taskId: number,
  userId: string,
  delegated: boolean,
): Promise<void> {
  await query(
    `UPDATE tasks SET plan_delegated = $3
      WHERE id = $1 AND user_id = $2 AND plan_approved_at IS NOT NULL`,
    [taskId, userId, delegated],
    PROGRESS_QUERY_TIMEOUT_MS,
  );
}

/** The goal's latest step events, newest first. */
export async function recentStepEvents(
  taskId: number,
  limit: number = MAX_STEP_EVENTS_READ,
): Promise<StepEvent[]> {
  const result = await query<StepEvent>(
    `SELECT step_id, kind, ref, created_at
       FROM plan_step_events
      WHERE task_id = $1
      ORDER BY created_at DESC, id DESC
      LIMIT $2`,
    [taskId, Math.min(Math.max(1, limit), MAX_STEP_EVENTS_READ)],
    PROGRESS_QUERY_TIMEOUT_MS,
  );
  return result.rows;
}

/** The step an ask was sent for, or null when it was sent outside any step. */
export async function stepOfAsk(taskId: number, askId: number): Promise<string | null> {
  const result = await query<{ step_id: string }>(
    `SELECT step_id FROM plan_step_events
      WHERE task_id = $1 AND kind = $2 AND ref = $3
      ORDER BY id DESC
      LIMIT 1`,
    [taskId, StepEventKind.Sent, String(askId)],
    PROGRESS_QUERY_TIMEOUT_MS,
  );
  return result.rows[0]?.step_id ?? null;
}

/**
 * Record an event only if this exact one (goal, step, kind, ref) is not there
 * yet; true when it was written now. A retried wake must not count one answer
 * twice or move the plan twice.
 */
export async function recordStepEventOnce(
  taskId: number,
  stepId: string,
  kind: StepEventKind,
  ref: string | null = null,
): Promise<boolean> {
  const result = await query(
    `INSERT INTO plan_step_events (task_id, step_id, kind, ref)
     SELECT $1::int, $2::text, $3::text, $4::text
      WHERE NOT EXISTS (
        SELECT 1 FROM plan_step_events
         WHERE task_id = $1::int AND step_id = $2::text AND kind = $3::text
           AND ref IS NOT DISTINCT FROM $4::text
      )`,
    [taskId, stepId, kind, ref],
    PROGRESS_QUERY_TIMEOUT_MS,
  );
  return (result.rowCount ?? 0) > 0;
}
