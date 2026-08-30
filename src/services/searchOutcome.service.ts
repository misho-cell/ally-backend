import { query } from '../db/postgres/client';
import { queueFollowUp } from './pendingUpdates.service';
import { armSearchDebrief } from './debrief.service';

const QUERY_TIMEOUT_MS = 8_000;
// Ticket 6, founder's answer ②: "success for us is when user get his
// problem solved" — a returned name is never proof of anything. Six rungs;
// a row moves forward through them as the conversation actually happens,
// never marked successful just because a name came out of the search.
export const SEARCH_OUTCOMES = [
  'no_result',
  'refused',
  'accepted',
  'sent',
  'replied',
  'followed_up',
] as const;
export type SearchOutcome = (typeof SEARCH_OUTCOMES)[number];

export function isSearchOutcome(value: string): value is SearchOutcome {
  return (SEARCH_OUTCOMES as readonly string[]).includes(value);
}

const FOLLOW_UP_DELAY_DAYS = 7;
const FOLLOW_UP_KIND = 'search_followup';

export interface RecordOutcomeInput {
  searchId: number;
  userId: string;
  outcome: SearchOutcome;
  reason?: string | null;
  worked?: boolean | null;
}

/**
 * Advance one search_activity row to its next real outcome. Scoped to the
 * caller's own row (user_id = $2) — a search_id is never trusted alone, the
 * same rule as every phone/contact reference in this codebase. Reaching
 * 'sent' schedules the one-week "did it actually work" check through T9's
 * existing pending_updates path — no new follow-up mechanism, per the
 * founder's own instruction to reuse it.
 */
export async function recordSearchOutcome(input: RecordOutcomeInput): Promise<boolean> {
  // COALESCE on outcome_worked: a later ladder move without the worked flag
  // must never erase a recorded success/failure (live-caught 30 Aug: the chat
  // tool had no worked field, the model advanced the rung, and A's "it worked"
  // was overwritten with NULL and silently lost).
  const result = await query(
    `UPDATE search_activity
     SET outcome = $3, outcome_reason = $4,
         outcome_worked = COALESCE($5, outcome_worked), outcome_updated_at = NOW()
     WHERE id = $1 AND user_id = $2`,
    [input.searchId, input.userId, input.outcome, input.reason ?? null, input.worked ?? null],
    QUERY_TIMEOUT_MS,
  );
  const updated = (result.rowCount ?? 0) > 0;

  if (updated && input.outcome === 'sent') {
    await queueFollowUp(
      input.userId,
      null,
      FOLLOW_UP_KIND,
      { search_id: input.searchId },
      FOLLOW_UP_DELAY_DAYS,
    );
  }

  // D49: an accepted name arms the 3-day debrief ("how did it actually go?").
  // Best-effort — the outcome write above must stand even if arming fails.
  if (updated && input.outcome === 'accepted') {
    await armSearchDebrief(input.userId, input.searchId).catch((err: unknown) =>
      // eslint-disable-next-line no-console
      console.error('[debrief] search arm failed:', (err as Error).message),
    );
  }

  return updated;
}
