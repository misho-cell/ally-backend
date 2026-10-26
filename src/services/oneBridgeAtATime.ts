import { query } from '../db/postgres/client';

/**
 * #7630 (Misho, 26 Oct: „ერთთან"): Lasha's request for Beso went to four
 * bridges inside eleven seconds, and Beso heard about it twice. One person is
 * reached through one bridge at a time: the next goes only after the first
 * declines, or after a day with no answer. The plan card still names every
 * bridge (#6304); only the sending waits.
 */
export const NEXT_BRIDGE_AFTER_HOURS = 24;
const QUERY_TIMEOUT_MS = 5_000;

export interface PendingBridge {
  readonly mediatorName: string;
  readonly hoursAgo: number;
}

interface BridgeTarget {
  readonly requesterUserId: string;
  readonly mediatorUserId: number;
  readonly targetUserId: number | null;
  readonly targetName: string;
}

/** Another bridge already asked about this person, still unanswered inside the day; else null. */
export async function bridgeAlreadyAsked(target: BridgeTarget): Promise<PendingBridge | null> {
  const result = await query<{ mediator_name: string | null; hours_ago: number }>(
    `SELECT NULLIF(TRIM(u.name), '') AS mediator_name,
            FLOOR(EXTRACT(EPOCH FROM (NOW() - ir.created_at)) / 3600)::int AS hours_ago
       FROM introduction_requests ir
       LEFT JOIN "User" u ON u.id = ir.mediator_user_id
      WHERE ir.requester_user_id = $1
        AND ir.mediator_user_id IS NOT NULL AND ir.mediator_user_id <> $2::int
        AND ir.status = 'pending'
        AND ir.created_at > NOW() - make_interval(hours => $5)
        AND (($3::int IS NOT NULL AND ir.target_user_id = $3::int)
             OR ($3::int IS NULL AND LOWER(TRIM(ir.target_name)) = LOWER(TRIM($4))))
      ORDER BY ir.created_at DESC
      LIMIT 1`,
    [
      target.requesterUserId,
      target.mediatorUserId,
      target.targetUserId,
      target.targetName,
      NEXT_BRIDGE_AFTER_HOURS,
    ],
    QUERY_TIMEOUT_MS,
  );
  const row = result.rows[0];
  return row ? { mediatorName: row.mediator_name ?? '', hoursAgo: row.hours_ago } : null;
}

/** What the run is told, and tells the owner in one line. */
export function oneBridgeAtATimeNote(pending: PendingBridge, targetName: string): string {
  const waitHours = Math.max(1, NEXT_BRIDGE_AFTER_HOURS - pending.hoursAgo);
  return (
    `${targetName}-ზე უკვე ვკითხე ${pending.mediatorName || 'სხვა შუამავალს'} — ერთ ადამიანთან ` +
    'ერთდროულად ერთი შუამავლის გზით მივდივართ. შემდეგ შუამავალს ვკითხავ, თუ ეს უარს იტყვის ' +
    `ან ${waitHours} საათში არ უპასუხებს. მომხმარებელს ეს ერთი ხაზით უთხარი; გეგმა არ იცვლება.`
  );
}
