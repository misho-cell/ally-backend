import { query } from '../db/postgres/client';
import { confirmedWarmTieSql } from './chorusCap';

/**
 * H (Misho, 5 Oct): pending Chorus asks whose inviter holds no confirmed warm
 * tie to the target are held for good by D544 — the send refuses them every
 * time. They are closed as 'withdrawn' with this reason; nothing is sent and
 * nothing is deleted. The undo puts exactly these rows back to 'pending'.
 */
export const NO_CONFIRMED_TIE_REASON = 'no confirmed tie';
const WITHDRAWN_STATE = 'withdrawn';
const PENDING_STATE = 'pending';
const UNCONFIRMED_QUERY_TIMEOUT_MS = 15_000;

export interface UnconfirmedAsksCount {
  readonly asks: number;
  readonly on_open_campaigns: number;
  readonly campaigns: number;
}

export interface UnconfirmedAsksChange {
  readonly changed: number;
  readonly participant_ids: readonly number[];
}

const UNCONFIRMED_PENDING_SQL = `
  FROM invite_campaign_participants p
  JOIN invite_campaigns c ON c.id = p.campaign_id
  WHERE p.state = $1
    AND NOT ${confirmedWarmTieSql('p.inviter_user_id', 'c.target_phone')}`;

/** How many pending asks would close — the preview before the write. */
export async function countUnconfirmedPendingAsks(): Promise<UnconfirmedAsksCount> {
  const result = await query<{ asks: number; on_open_campaigns: number; campaigns: number }>(
    `SELECT COUNT(*)::int AS asks,
            COUNT(*) FILTER (WHERE c.status = 'open')::int AS on_open_campaigns,
            COUNT(DISTINCT c.id)::int AS campaigns
     ${UNCONFIRMED_PENDING_SQL}`,
    [PENDING_STATE],
    UNCONFIRMED_QUERY_TIMEOUT_MS,
  );
  const row = result.rows[0];
  return {
    asks: row?.asks ?? 0,
    on_open_campaigns: row?.on_open_campaigns ?? 0,
    campaigns: row?.campaigns ?? 0,
  };
}

/** Closes every pending ask without a confirmed tie; one statement, so all or none. */
export async function withdrawUnconfirmedPendingAsks(): Promise<UnconfirmedAsksChange> {
  const result = await query<{ id: number }>(
    `UPDATE invite_campaign_participants
     SET state = $2, closed_reason = $3, state_updated_at = NOW()
     WHERE id IN (SELECT p.id ${UNCONFIRMED_PENDING_SQL})
     RETURNING id`,
    [PENDING_STATE, WITHDRAWN_STATE, NO_CONFIRMED_TIE_REASON],
    UNCONFIRMED_QUERY_TIMEOUT_MS,
  );
  return changeOf(result.rows);
}

/** The undo: every ask closed for this reason goes back to pending, where D544 still holds it. */
export async function restoreWithdrawnAsks(): Promise<UnconfirmedAsksChange> {
  const result = await query<{ id: number }>(
    `UPDATE invite_campaign_participants
     SET state = $1, closed_reason = NULL, state_updated_at = NOW()
     WHERE state = $2 AND closed_reason = $3
     RETURNING id`,
    [PENDING_STATE, WITHDRAWN_STATE, NO_CONFIRMED_TIE_REASON],
    UNCONFIRMED_QUERY_TIMEOUT_MS,
  );
  return changeOf(result.rows);
}

function changeOf(rows: readonly { id: number }[]): UnconfirmedAsksChange {
  const ids = rows.map((row) => row.id).sort((a, b) => a - b);
  return { changed: ids.length, participant_ids: ids };
}
