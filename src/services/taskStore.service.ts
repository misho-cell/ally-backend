import { query } from '../db/postgres/client';

const QUERY_TIMEOUT_MS = 8_000;
const OPEN_TASKS_LIMIT = 50;

export const TASK_TYPES = ['solve', 'reach'] as const;
export const TASK_STATUSES = ['open', 'paused', 'closed'] as const;
export type TaskType = (typeof TASK_TYPES)[number];
export type TaskStatus = (typeof TASK_STATUSES)[number];

export interface Task {
  id: number;
  title: string;
  description: string | null;
  task_type: string;
  status: string;
  permission_granted: boolean;
  created_at: string;
  last_activity_at: string;
}

export function isTaskType(v: string): v is TaskType {
  return (TASK_TYPES as readonly string[]).includes(v);
}

export function isTaskStatus(v: string): v is TaskStatus {
  return (TASK_STATUSES as readonly string[]).includes(v);
}

/** Save a goal as a standing task. Returns the new task id. */
export async function createTask(
  userId: string,
  title: string,
  description: string | null,
  taskType: TaskType,
): Promise<{ id: number }> {
  const result = await query<{ id: number }>(
    `INSERT INTO tasks (user_id, title, description, task_type)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [userId, title, description, taskType],
    QUERY_TIMEOUT_MS,
  );
  return { id: result.rows[0].id };
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
