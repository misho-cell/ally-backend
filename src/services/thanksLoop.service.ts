import { query } from '../db/postgres/client';
import { queueResult } from './pendingUpdates.service';

const THANKS_LOOP_QUERY_TIMEOUT_MS = 8_000;
const THANKS_LOOP_KIND = 'thanks_loop';

// Ticket 6, engine T12: "when an invited user hits his first confirmed
// result: one-tap consent prompt to him; on yes, a pending message (via T9)
// to his inviter carrying BOTH facts — he got a real result and he is
// thankful." "Via T9" turned out to already be real: pendingUpdates.service
// (queueResult/getPendingUpdates) is the exact "surfaced at conversation
// start" mechanism T9 describes — searchOutcome.service's own 7-day
// follow-up already reuses it. T12 needed no new delivery path, only the
// trigger and the consent gate.

// A generous ceiling, not the feature's real limit — per spec, "per-user
// frequency cap via T10" reused as a philosophy (env-configurable, never
// hardcoded), not literally T10's growth-ask counter, which is a different
// action (an ask sent TO someone, not a passive thanks notification).
const MAX_THANKS_PER_INVITER_PER_MONTH = Number(
  process.env.THANKS_LOOP_MAX_PER_INVITER_PER_MONTH ?? 20,
);

/**
 * Offers the one-tap consent prompt the FIRST time (and only the first time
 * — the table's own primary key enforces that) an invited user's search
 * reaches a real confirmed result. Called from the record_search_outcome
 * case handler right after a successful 'accepted' write.
 */
export async function maybeOfferThanksLoop(userId: string, outcome: string): Promise<boolean> {
  if (outcome !== 'accepted') return false;

  const firstEver = await query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM search_activity WHERE user_id = $1 AND outcome = 'accepted'`,
    [userId],
    THANKS_LOOP_QUERY_TIMEOUT_MS,
  );
  if (Number(firstEver.rows[0]?.count ?? 0) !== 1) return false;

  const inviterResult = await query<{ inviterReferralUserId: number | null }>(
    `SELECT "inviterReferralUserId" FROM "User" WHERE id = $1::int LIMIT 1`,
    [userId],
    THANKS_LOOP_QUERY_TIMEOUT_MS,
  );
  const inviterUserId = inviterResult.rows[0]?.inviterReferralUserId ?? null;
  if (inviterUserId === null) return false;

  const inserted = await query<{ invited_user_id: number }>(
    `INSERT INTO thanks_loop_offers (invited_user_id, inviter_user_id)
     VALUES ($1::int, $2)
     ON CONFLICT (invited_user_id) DO NOTHING
     RETURNING invited_user_id`,
    [userId, inviterUserId],
    THANKS_LOOP_QUERY_TIMEOUT_MS,
  );
  return inserted.rows.length > 0;
}

async function inviterUnderCap(inviterUserId: number): Promise<boolean> {
  const result = await query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM thanks_loop_offers
     WHERE inviter_user_id = $1 AND state = 'consented'
       AND responded_at > date_trunc('month', NOW())`,
    [inviterUserId],
    THANKS_LOOP_QUERY_TIMEOUT_MS,
  );
  return Number(result.rows[0]?.count ?? 0) < MAX_THANKS_PER_INVITER_PER_MONTH;
}

export interface ThanksLoopResponseOutcome {
  sent: boolean;
  error?: string;
}

/**
 * The invitee's own tap. "Without the tap, nothing is ever sent" — sending
 * happens ONLY on this call, with consented=true, against an 'offered' row;
 * every other path (decline, no offer, already responded, cap reached)
 * leaves the inviter untouched.
 */
export async function respondToThanksLoopOffer(
  invitedUserId: string,
  consented: boolean,
): Promise<ThanksLoopResponseOutcome> {
  const offer = await query<{ inviter_user_id: number; state: string }>(
    `SELECT inviter_user_id, state FROM thanks_loop_offers WHERE invited_user_id = $1::int LIMIT 1`,
    [invitedUserId],
    THANKS_LOOP_QUERY_TIMEOUT_MS,
  );
  const row = offer.rows[0];
  if (!row) return { sent: false, error: 'No pending thanks-loop offer for this user.' };
  if (row.state !== 'offered') return { sent: false, error: 'Already responded.' };

  if (!consented || !(await inviterUnderCap(row.inviter_user_id))) {
    await query(
      `UPDATE thanks_loop_offers SET state = 'declined', responded_at = NOW() WHERE invited_user_id = $1::int`,
      [invitedUserId],
      THANKS_LOOP_QUERY_TIMEOUT_MS,
    );
    return { sent: false };
  }

  const nameResult = await query<{ name: string }>(
    `SELECT name FROM "User" WHERE id = $1::int LIMIT 1`,
    [invitedUserId],
    THANKS_LOOP_QUERY_TIMEOUT_MS,
  );
  const firstName = (nameResult.rows[0]?.name ?? '').trim().split(/\s+/)[0] || null;

  await queueResult(String(row.inviter_user_id), null, THANKS_LOOP_KIND, {
    invited_first_name: firstName,
    instruction:
      'Someone you invited to Netai just got a real result and wanted you to know they are ' +
      'thankful. Tell the owner this warmly, in one or two sentences. Never mention what they ' +
      'searched for, who it was about, or any other detail — only that it helped and they are ' +
      'grateful.',
  });
  await query(
    `UPDATE thanks_loop_offers SET state = 'consented', responded_at = NOW() WHERE invited_user_id = $1::int`,
    [invitedUserId],
    THANKS_LOOP_QUERY_TIMEOUT_MS,
  );
  return { sent: true };
}
