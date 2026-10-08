import { query } from '../db/postgres/client';
import { askStateOf, AskState } from './askState';
import type { AdminAskRow } from '../types';

/**
 * #1684 (A1): the per-user admin page lists the person's asks with their
 * states. Until now it showed two counts, and „why is this goal stuck" meant a
 * second page and a guess.
 */
const QUERY_TIMEOUT_MS = 8_000;
const MAX_ASKS_LISTED = 50;

interface AskRowDb {
  id: number;
  task_id: number;
  direction: 'sent' | 'received';
  other_user_id: number;
  other_name: string | null;
  status: string;
  created_at: Date;
  seen_at: Date | null;
  later_until: Date | null;
  answered_at: Date | null;
  declined_at: Date | null;
  expired_at: Date | null;
  prematch?: string | null;
  prematch_source?: string | null;
}

function iso(value: Date | null): string | null {
  return value === null ? null : new Date(value).toISOString();
}

function closedAt(row: AskRowDb, state: AskState): string | null {
  if (state === AskState.Expired) return iso(row.expired_at);
  if (state === AskState.Declined) return iso(row.declined_at ?? row.answered_at);
  if (state === AskState.Answered) return iso(row.answered_at);
  return null;
}

export function toAdminAskRow(row: AskRowDb, now: Date): AdminAskRow {
  const state = askStateOf(row, now);
  return {
    id: row.id,
    task_id: row.task_id,
    direction: row.direction,
    other_user_id: row.other_user_id,
    other_name: row.other_name,
    state,
    sent_at: iso(row.created_at) ?? '',
    seen_at: iso(row.seen_at),
    later_until: iso(row.later_until),
    // A „no" is a close, not an answer (tester 41786).
    first_answer_at: state === AskState.Answered ? iso(row.answered_at) : null,
    closed_at: closedAt(row, state),
    // 1694 (A11): the recipient-side pre-match word, for the admin only.
    prematch: row.prematch ?? null,
    prematch_source: row.prematch_source ?? null,
  };
}

export async function getUserAsks(userId: number): Promise<AdminAskRow[]> {
  const result = await query<AskRowDb>(
    `SELECT ta.id, ta.task_id,
            CASE WHEN ta.from_user_id = $1 THEN 'sent' ELSE 'received' END AS direction,
            CASE WHEN ta.from_user_id = $1 THEN ta.to_user_id ELSE ta.from_user_id END
              AS other_user_id,
            u.name AS other_name, ta.status, ta.created_at, ta.seen_at, ta.later_until,
            ta.answered_at, ta.declined_at, ta.expired_at, ta.prematch, ta.prematch_source
       FROM task_asks ta
       LEFT JOIN "User" u
         ON u.id = CASE WHEN ta.from_user_id = $1 THEN ta.to_user_id ELSE ta.from_user_id END
      WHERE ta.from_user_id = $1 OR ta.to_user_id = $1
      ORDER BY ta.created_at DESC
      LIMIT $2`,
    [userId, MAX_ASKS_LISTED],
    QUERY_TIMEOUT_MS,
  );
  const now = new Date();
  return result.rows.map((row) => toAdminAskRow(row, now));
}
