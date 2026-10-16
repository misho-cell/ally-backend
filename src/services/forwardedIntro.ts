import { query } from '../db/postgres/client';

const LOOKUP_TIMEOUT_MS = 3_000;

/** The owner's request a link is answering in their own request thread. */
export interface RequestPassedOn {
  readonly ownerUserId: string;
  readonly targetName: string;
  /** The owner's reason, already worded about the owner when it was first stored. */
  readonly reason: string | null;
  readonly ownerTaskId: number | null;
}

interface ParentRow {
  readonly requester_user_id: number;
  readonly target_name: string;
  readonly message: string | null;
  readonly requester_task_id: number | null;
}

/**
 * 5347 (tester 61837): link A, asked to introduce the owner to T, wrote „I don't
 * know her, but B does — ask B in my name". A's assistant opened a request of
 * A's own, so B read „A's assistant asks you to introduce A to T" and the
 * owner's need became A's. In A's own request thread the request that goes on
 * is the owner's: this is it, or null anywhere else (a direct request has no
 * one further to pass it to).
 */
export async function requestThisThreadPassesOn(
  userId: string,
  threadId: number,
): Promise<RequestPassedOn | null> {
  const result = await query<ParentRow>(
    `SELECT ir.requester_user_id, ir.target_name, ir.message, ir.requester_task_id
       FROM threads t
       JOIN introduction_requests ir ON ir.id = t.introduction_request_id
      WHERE t.id = $1 AND t.user_id = $2 AND t.type = 'incoming_request'
        AND ir.mediator_user_id = $2::int AND ir.ask_type <> 'direct'
      LIMIT 1`,
    [threadId, userId],
    LOOKUP_TIMEOUT_MS,
  );
  const row = result.rows[0];
  if (row === undefined) return null;
  return {
    ownerUserId: String(row.requester_user_id),
    targetName: row.target_name,
    reason: row.message,
    ownerTaskId: row.requester_task_id,
  };
}
