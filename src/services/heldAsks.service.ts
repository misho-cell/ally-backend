import { query } from '../db/postgres/client';

/**
 * The tester's 983: a question an APPROVED plan was going to send, held only
 * by the recipient's 24-hour limit. Board #391: at the goal's wake after the
 * reopening the server sends it itself (heldAskSend.service) — no guessing
 * whether the window reopened, no second yes from the owner (D119).
 */
const QUERY_TIMEOUT_MS = 5_000;
const MAX_HELD_PER_WAKE = 10;

export interface HeldAsk {
  readonly id: number;
  readonly to_user_id: number;
  readonly contact_name: string;
  /** The phone id the plan named; null on rows held before it was kept. */
  readonly contact_phone: string | null;
  readonly question: string;
  readonly reopens_at: string;
}

export interface HoldAskInput {
  readonly taskId: number;
  readonly toUserId: number;
  readonly contactName: string;
  readonly contactPhone: string;
  readonly question: string;
  readonly reopensAt: Date;
}

/** Records one held question, once per goal and person. */
export async function holdAsk(input: HoldAskInput): Promise<void> {
  await query(
    `INSERT INTO held_asks (task_id, to_user_id, contact_name, contact_phone, question, reopens_at)
     SELECT $1, $2, $3, $4, $5, $6
      WHERE NOT EXISTS (SELECT 1 FROM held_asks
                         WHERE task_id = $1 AND to_user_id = $2 AND released_at IS NULL)`,
    [
      input.taskId,
      input.toUserId,
      input.contactName,
      input.contactPhone,
      input.question,
      input.reopensAt,
    ],
    QUERY_TIMEOUT_MS,
  );
}

/** The held questions whose window has reopened, marked as released so each goes once. */
export async function releaseDueHeldAsks(taskId: number): Promise<HeldAsk[]> {
  const result = await query<{
    id: number;
    to_user_id: number;
    contact_name: string;
    contact_phone: string | null;
    question: string;
    reopens_at: Date | string;
  }>(
    `UPDATE held_asks SET released_at = NOW()
      WHERE id IN (SELECT id FROM held_asks
                    WHERE task_id = $1 AND released_at IS NULL AND reopens_at <= NOW()
                    ORDER BY id LIMIT ${MAX_HELD_PER_WAKE})
      RETURNING id, to_user_id, contact_name, contact_phone, question, reopens_at`,
    [taskId],
    QUERY_TIMEOUT_MS,
  );
  return result.rows.map((r) => ({
    id: r.id,
    to_user_id: r.to_user_id,
    contact_name: r.contact_name,
    contact_phone: r.contact_phone,
    question: r.question,
    reopens_at: new Date(r.reopens_at).toISOString(),
  }));
}

/** A question that went after all is no longer held. */
export async function releaseHeldAsk(taskId: number, toUserId: number): Promise<void> {
  await query(
    `UPDATE held_asks SET released_at = NOW()
      WHERE task_id = $1 AND to_user_id = $2 AND released_at IS NULL`,
    [taskId, toUserId],
    QUERY_TIMEOUT_MS,
  );
}

/** #1684: a goal's questions still held, for the per-person state lines. */
export interface OpenHeldAsk {
  readonly to_user_id: number;
  readonly contact_name: string;
  readonly reopens_at: string;
}

export async function openHeldAsksForTask(taskId: number): Promise<OpenHeldAsk[]> {
  const result = await query<OpenHeldAsk>(
    `SELECT to_user_id, contact_name, reopens_at FROM held_asks
      WHERE task_id = $1 AND released_at IS NULL
      ORDER BY created_at LIMIT $2`,
    [taskId, MAX_HELD_PER_WAKE],
    QUERY_TIMEOUT_MS,
  );
  return result.rows;
}
