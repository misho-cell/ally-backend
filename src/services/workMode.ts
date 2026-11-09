import { query } from '../db/postgres/client';

/**
 * Misho, 8 Nov: two ways to work a goal.
 *  - Plan (the default): the owner agrees the plan, and its one yes covers it.
 *  - Free: the owner's standing yes on this topic — „write to whoever is needed,
 *    bring me the result". The server approves the plans the run proposes; the
 *    walls stay (two asks a day per person, pacing, opt-outs, never the owner's
 *    phonebook numbers without his word), a goal writes to at most
 *    FREE_MODE_PEOPLE_PER_DAY new people a day, and the owner hears once each
 *    evening whom it wrote to.
 * Which mode the owner chose is the model's reading of his words (#8779); the
 * server keeps it and enforces it.
 */
export enum WorkMode {
  Plan = 'plan',
  Free = 'free',
}

/** Misho, 9 Nov: at least ten people a day. */
export const FREE_MODE_PEOPLE_PER_DAY = 10;
const WORK_MODE_TIMEOUT_MS = 3_000;
export const LOCAL_ZONE = 'Asia/Tbilisi';

/** The start of today in LOCAL_ZONE, for a query whose parameter $n is the zone. */
export function localDayStartSql(zoneParam: number): string {
  return `(date_trunc('day', NOW() AT TIME ZONE $${zoneParam}) AT TIME ZONE $${zoneParam})`;
}

export function workModeFrom(value: unknown): WorkMode | null {
  return value === WorkMode.Free ? WorkMode.Free : value === WorkMode.Plan ? WorkMode.Plan : null;
}

/** The goal's mode; plan when it cannot be read — the safer of the two. */
export async function goalWorkMode(taskId: number): Promise<WorkMode> {
  try {
    const result = await query<{ work_mode: string }>(
      'SELECT work_mode FROM tasks WHERE id = $1 LIMIT 1',
      [taskId],
      WORK_MODE_TIMEOUT_MS,
    );
    return workModeFrom(result.rows[0]?.work_mode) ?? WorkMode.Plan;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(`[work-mode] goal ${taskId}: mode not read:`, (err as Error).message);
    return WorkMode.Plan;
  }
}

/** Sets the mode of the owner's own open goal; false when no such goal. */
export async function setGoalWorkMode(
  userId: string,
  taskId: number,
  mode: WorkMode,
): Promise<boolean> {
  const result = await query(
    `UPDATE tasks SET work_mode = $3, updated_at = NOW()
      WHERE id = $1 AND user_id = $2 AND status = 'open'`,
    [taskId, userId, mode],
    WORK_MODE_TIMEOUT_MS,
  );
  return (result.rowCount ?? 0) > 0;
}

/**
 * Whether a free-mode goal may write to this person today: someone it already wrote to
 * today goes on; a new person only while fewer than FREE_MODE_PEOPLE_PER_DAY were written to.
 */
export async function freeModeRoomFor(taskId: number, toUserId: number): Promise<boolean> {
  const result = await query<{ people: number; already: boolean }>(
    `SELECT COUNT(DISTINCT to_user_id)::int AS people,
            BOOL_OR(to_user_id = $2) AS already
       FROM task_asks
      WHERE task_id = $1
        AND created_at >= ${localDayStartSql(3)}`,
    [taskId, toUserId, LOCAL_ZONE],
    WORK_MODE_TIMEOUT_MS,
  );
  const row = result.rows[0];
  return row?.already === true || (row?.people ?? 0) < FREE_MODE_PEOPLE_PER_DAY;
}

/** What the run is told when a free-mode goal has written to its day's share of people. */
export const FREE_MODE_DAY_IS_FULL =
  `Not sent: this goal works in free mode and has written to ${FREE_MODE_PEOPLE_PER_DAY} new ` +
  'people today, the daily limit. Set the goal’s wake for tomorrow morning with set_task_wake ' +
  'and write to this person then. Do not tell the owner it went.';

/** What the run is told when its plan was approved by the goal's standing yes. */
export const FREE_MODE_APPROVED_NOTE =
  'This goal works in free mode: the owner gave a standing yes on this topic, so the server ' +
  'has approved the plan and started it. Do not ask him to approve or confirm anything. Tell ' +
  'him in one line what you are doing now; he hears in the evening whom you wrote to.';
