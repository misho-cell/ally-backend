import { query } from '../db/postgres/client';
import { nameAsSavedBySql } from './savedNameSql';

/**
 * The frontend's 14 Oct 14:10Z item 5 („ჩემი თხოვნების მდგომარეობა" on the
 * path page): the introductions this person asked for, newest first, each with
 * the go-between as THEY saved them, the person to meet, the goal and its state.
 * Only their own requests; the go-between's answer text is not part of it.
 */
const QUERY_TIMEOUT_MS = 5_000;
export const MAX_MY_REQUESTS = 50;

export enum MyRequestState {
  Sent = 'sent',
  Accepted = 'accepted',
  Declined = 'declined',
  Expired = 'expired',
  Cancelled = 'cancelled',
}

export interface MyIntroRequest {
  readonly id: number;
  readonly mediator_name: string | null;
  readonly target_name: string;
  readonly goal_id: number | null;
  readonly thread_id: number | null;
  readonly state: MyRequestState;
  readonly created_at: string;
  readonly answered_at: string | null;
}

const STATE_OF: Readonly<Record<string, MyRequestState>> = {
  pending: MyRequestState.Sent,
  accepted: MyRequestState.Accepted,
  declined: MyRequestState.Declined,
  expired: MyRequestState.Expired,
  cancelled: MyRequestState.Cancelled,
};

interface Row {
  readonly id: number;
  readonly mediator_name: string | null;
  readonly target_name: string;
  readonly goal_id: number | null;
  readonly thread_id: number | null;
  readonly status: string;
  readonly created_at: string;
  readonly answered_at: string | null;
}

export async function myIntroRequests(userId: number): Promise<MyIntroRequest[]> {
  const result = await query<Row>(
    `SELECT ir.id, ${nameAsSavedBySql('ir.requester_user_id', 'ir.mediator_user_id')} AS mediator_name,
            ir.target_name, ir.requester_task_id AS goal_id,
            COALESCE(ir.requester_thread_id, ir.origin_thread_id) AS thread_id,
            ir.status, ir.created_at, ir.responded_at AS answered_at
       FROM introduction_requests ir
      WHERE ir.requester_user_id = $1
      ORDER BY ir.created_at DESC
      LIMIT $2`,
    [userId, MAX_MY_REQUESTS],
    QUERY_TIMEOUT_MS,
  );
  return result.rows.map((r) => ({
    id: r.id,
    mediator_name: r.mediator_name,
    target_name: r.target_name,
    goal_id: r.goal_id,
    thread_id: r.thread_id,
    state: STATE_OF[r.status] ?? MyRequestState.Sent,
    created_at: new Date(r.created_at).toISOString(),
    answered_at: r.answered_at === null ? null : new Date(r.answered_at).toISOString(),
  }));
}
