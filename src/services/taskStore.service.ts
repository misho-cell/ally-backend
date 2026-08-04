import { query } from '../db/postgres/client';

const QUERY_TIMEOUT_MS = 8_000;
const OPEN_TASKS_LIMIT = 50;

export const TASK_TYPES = ['solve', 'reach'] as const;
export const TASK_STATUSES = ['open', 'paused', 'closed'] as const;
export type TaskType = (typeof TASK_TYPES)[number];
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_AUTONOMY_MODES = ['ask_first', 'autonomous'] as const;
export type TaskAutonomy = (typeof TASK_AUTONOMY_MODES)[number];

export function isTaskAutonomy(v: string): v is TaskAutonomy {
  return (TASK_AUTONOMY_MODES as readonly string[]).includes(v);
}

export interface Task {
  id: number;
  title: string;
  description: string | null;
  task_type: string;
  status: string;
  permission_granted: boolean;
  thread_id: number | null;
  autonomy: string;
  brief: string | null;
  next_wake_at: string | null;
  created_at: string;
  last_activity_at: string;
}

export function isTaskType(v: string): v is TaskType {
  return (TASK_TYPES as readonly string[]).includes(v);
}

export function isTaskStatus(v: string): v is TaskStatus {
  return (TASK_STATUSES as readonly string[]).includes(v);
}

/**
 * Save a goal as a standing task, bound to the thread it was created in
 * (1 task = 1 thread — the engine wakes the task INTO that thread).
 */
export async function createTask(
  userId: string,
  title: string,
  description: string | null,
  taskType: TaskType,
  threadId?: number,
  autonomy: TaskAutonomy = 'ask_first',
): Promise<{ id: number }> {
  const result = await query<{ id: number }>(
    `INSERT INTO tasks (user_id, title, description, task_type, thread_id, autonomy)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [userId, title, description, taskType, threadId ?? null, autonomy],
    QUERY_TIMEOUT_MS,
  );
  return { id: result.rows[0].id };
}

const TASK_COLUMNS = `id, title, description, task_type, status, permission_granted,
            thread_id, autonomy, brief, next_wake_at, created_at, last_activity_at`;

/** The open task bound to a thread — what makes a run a "task step" run. */
export async function getOpenTaskByThread(threadId: number): Promise<Task | null> {
  const result = await query<Task>(
    `SELECT ${TASK_COLUMNS} FROM tasks
     WHERE thread_id = $1 AND status = 'open'
     ORDER BY id DESC LIMIT 1`,
    [threadId],
    QUERY_TIMEOUT_MS,
  );
  return result.rows[0] ?? null;
}

export async function getTaskById(taskId: number): Promise<(Task & { user_id: string }) | null> {
  const result = await query<Task & { user_id: string }>(
    `SELECT user_id, ${TASK_COLUMNS} FROM tasks WHERE id = $1 LIMIT 1`,
    [taskId],
    QUERY_TIMEOUT_MS,
  );
  return result.rows[0] ?? null;
}

/** The model's operative plan for the task — rewritten as work progresses. */
export async function setTaskBrief(
  userId: string,
  taskId: number,
  brief: string,
): Promise<boolean> {
  const result = await query(
    `UPDATE tasks SET brief = $3, updated_at = NOW(), last_activity_at = NOW()
     WHERE id = $1 AND user_id = $2 AND status = 'open'`,
    [taskId, userId, brief],
    QUERY_TIMEOUT_MS,
  );
  return (result.rowCount ?? 0) > 0;
}

export async function setTaskAutonomy(
  userId: string,
  taskId: number,
  autonomy: TaskAutonomy,
): Promise<boolean> {
  const result = await query(
    `UPDATE tasks SET autonomy = $3, updated_at = NOW() WHERE id = $1 AND user_id = $2`,
    [taskId, userId, autonomy],
    QUERY_TIMEOUT_MS,
  );
  return (result.rowCount ?? 0) > 0;
}

/** Schedule the task's next self-wake (revisit, reminder, summary deadline). */
export async function setTaskWake(userId: string, taskId: number, hours: number): Promise<boolean> {
  const result = await query(
    `UPDATE tasks SET next_wake_at = NOW() + ($3 || ' hours')::interval, updated_at = NOW()
     WHERE id = $1 AND user_id = $2 AND status = 'open'`,
    [taskId, userId, hours],
    QUERY_TIMEOUT_MS,
  );
  return (result.rowCount ?? 0) > 0;
}

/** Open tasks whose wake time has arrived — the ticker's worklist. */
export async function getDueTasks(limit: number): Promise<Array<Task & { user_id: string }>> {
  const result = await query<Task & { user_id: string }>(
    `SELECT user_id, ${TASK_COLUMNS} FROM tasks
     WHERE status = 'open' AND next_wake_at IS NOT NULL AND next_wake_at <= NOW()
     ORDER BY next_wake_at ASC
     LIMIT $1`,
    [limit],
    QUERY_TIMEOUT_MS,
  );
  return result.rows;
}

/**
 * Open tasks with NO scheduled wake and no activity for a while — the nightly
 * review's worklist (the model re-checks the network for new matches).
 */
export async function getStaleOpenTasks(
  hoursQuiet: number,
  limit: number,
): Promise<Array<Task & { user_id: string }>> {
  const result = await query<Task & { user_id: string }>(
    `SELECT user_id, ${TASK_COLUMNS} FROM tasks
     WHERE status = 'open' AND next_wake_at IS NULL
       AND last_activity_at < NOW() - ($1 || ' hours')::interval
     ORDER BY last_activity_at ASC
     LIMIT $2`,
    [hoursQuiet, limit],
    QUERY_TIMEOUT_MS,
  );
  return result.rows;
}

export async function touchTaskActivity(taskId: number): Promise<void> {
  await query(
    `UPDATE tasks SET last_activity_at = NOW() WHERE id = $1`,
    [taskId],
    QUERY_TIMEOUT_MS,
  );
}

export async function clearTaskWake(taskId: number): Promise<void> {
  await query(`UPDATE tasks SET next_wake_at = NULL WHERE id = $1`, [taskId], QUERY_TIMEOUT_MS);
}

/** The user's tasks (open by default) — how a fresh chat learns what it was doing. */
export async function getMyTasks(userId: string, status?: TaskStatus): Promise<Task[]> {
  const result = await query<Task>(
    `SELECT id, title, description, task_type, status, permission_granted,
            created_at, last_activity_at
     FROM tasks
     WHERE user_id = $1 AND ($2::text IS NULL OR status = $2)
     ORDER BY last_activity_at DESC
     LIMIT $3`,
    [userId, status ?? null, OPEN_TASKS_LIMIT],
    QUERY_TIMEOUT_MS,
  );
  return result.rows;
}

/**
 * Pause / resume / close / edit a task. Only the owner's task is touched.
 * Returns false when no such task exists for the user (nothing updated).
 */
export async function updateTask(
  userId: string,
  taskId: number,
  status: TaskStatus,
  note?: string,
): Promise<boolean> {
  const result = await query(
    `UPDATE tasks
     SET status = $3,
         closed_reason = CASE WHEN $3 = 'closed' THEN $4 ELSE closed_reason END,
         updated_at = NOW(),
         last_activity_at = NOW()
     WHERE id = $1 AND user_id = $2`,
    [taskId, userId, status, note ?? null],
    QUERY_TIMEOUT_MS,
  );
  return (result.rowCount ?? 0) > 0;
}

/** Record the one blanket "ok to ask around" consent for a task. */
export async function grantTaskPermission(userId: string, taskId: number): Promise<boolean> {
  const result = await query(
    `UPDATE tasks
     SET permission_granted = true, updated_at = NOW(), last_activity_at = NOW()
     WHERE id = $1 AND user_id = $2`,
    [taskId, userId],
    QUERY_TIMEOUT_MS,
  );
  return (result.rowCount ?? 0) > 0;
}
