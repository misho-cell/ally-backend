import { query } from '../db/postgres/client';
import { queueResult } from './pendingUpdates.service';

/**
 * ROW 275 / §55 — AN INTRODUCTION REQUEST NOBODY ANSWERED.
 *
 * D496, the founder, 25 September: „introduction requests unanswered for 14
 * days expire; the asker is told and may ask again; the helper sees 'expired';
 * applies to the 16 old ones."
 *
 * Sixteen have been pending since between 19 June and 5 September. Every one
 * of them is a person who asked for something and has heard nothing since —
 * request 1057 has waited since 5 September and is the one Lika could not
 * answer because it arrived under somebody else's buttons. „Pending" is the
 * truthful word for the row and the wrong word for the situation: nothing is
 * pending about a question asked in June.
 *
 * ⚠️ FOURTEEN DAYS IS NOT A NEW NUMBER, and it must not become one.
 * `requestIntroduction` already refuses to call a request „already sent" after
 * the same fourteen days, with the same reasoning written next to it: „a
 * mediator who has not looked in a fortnight is not about to". That rule and
 * this one are the same fact about the same row, so they read one constant.
 * Two numbers about one thing is the fault this codebase keeps paying for.
 */
import { UNANSWERED_IS_STALE_DAYS } from './tools/requestIntroduction';

export { UNANSWERED_IS_STALE_DAYS as EXPIRES_AFTER_DAYS };

const EXPIRY_TIMEOUT_MS = 8_000;
const EXPIRED_STATUS = 'expired';
const EXPIRED_KIND = 'intro_expired';
/** A sweep touches real people's rows; a runaway one must not touch all of them. */
const MOST_PER_SWEEP = 50;

export interface ExpiredRequest {
  readonly id: number;
  readonly requester_user_id: string;
  readonly target_name: string | null;
  readonly days_waiting: number;
}

/**
 * ⚠️ THE SAME CLAUSE AS THE SWEEP, LITERALLY, because a dry run that reads a
 * different set from the thing it is previewing is worse than no dry run: it
 * shows somebody sixteen rows and changes seventeen. The WHERE lives here once
 * and both readers take it.
 */
const PAST_THE_DEADLINE = `
     FROM introduction_requests ir
    WHERE ir.status = 'pending'
      AND COALESCE(ir.responded_at, ir.created_at) < NOW() - ($1 || ' days')::INTERVAL`;

/** What a sweep WOULD expire. Reads only; nothing is written and nobody is told. */
export async function introductionsThatWouldExpire(): Promise<ExpiredRequest[]> {
  const result = await query<ExpiredRequest>(
    `SELECT ir.id,
            ir.requester_user_id,
            ir.target_name,
            FLOOR(EXTRACT(EPOCH FROM (NOW() - ir.created_at)) / 86400)::int AS days_waiting
     ${PAST_THE_DEADLINE}
     ORDER BY ir.created_at
     LIMIT $2`,
    [UNANSWERED_IS_STALE_DAYS, MOST_PER_SWEEP],
    EXPIRY_TIMEOUT_MS,
  );
  return result.rows;
}

/**
 * The requests that have run out of time, marked expired, returned so their
 * askers can be told.
 *
 * ⚠️ IT RETURNS THE ROWS IT CHANGED, and that is the whole shape of it. A
 * sweep that marks rows and says „done" leaves the telling to a second query
 * that may read a different set — and the person whose request quietly died is
 * exactly the person this row exists for. What was expired and who is told
 * come from one statement.
 */
export async function expireUnansweredRequests(limit = MOST_PER_SWEEP): Promise<ExpiredRequest[]> {
  const result = await query<ExpiredRequest>(
    `WITH stale AS (
       SELECT id FROM introduction_requests
        WHERE status = 'pending'
          AND COALESCE(responded_at, created_at) < NOW() - ($2 || ' days')::INTERVAL
        ORDER BY created_at
        LIMIT $3
     )
     UPDATE introduction_requests ir
        SET status = $1, responded_at = NOW()
       FROM stale
      WHERE ir.id = stale.id
     RETURNING ir.id,
               ir.requester_user_id,
               ir.target_name,
               FLOOR(EXTRACT(EPOCH FROM (NOW() - ir.created_at)) / 86400)::int AS days_waiting`,
    [EXPIRED_STATUS, UNANSWERED_IS_STALE_DAYS, Math.max(1, Math.min(limit, MOST_PER_SWEEP))],
    EXPIRY_TIMEOUT_MS,
  );
  return result.rows;
}

/**
 * Tell each asker, once, through the queue every other update uses.
 *
 * ⚠️ THE ASKER IS TOLD; THE HELPER IS NOT CHASED. Somebody who has not
 * answered in a fortnight has already said what they are going to say, and a
 * card telling them they missed something is a reproach nobody asked us to
 * deliver. They see „expired" if they look — that is D496's word — and nothing
 * arrives on their phone.
 */
export async function tellAskersTheirRequestExpired(
  expired: readonly ExpiredRequest[],
): Promise<number> {
  let told = 0;
  for (const request of expired) {
    await queueResult(request.requester_user_id, null, EXPIRED_KIND, {
      request_id: request.id,
      who: request.target_name,
      days_waiting: request.days_waiting,
      instruction:
        `An introduction the user asked for ${request.days_waiting} days ago was never answered, ` +
        `so it has expired and nobody will be chased about it. The user is being shown this as ` +
        `its own message with buttons. If they want to try again, request_introduction is open ` +
        `to them — the expired one no longer blocks it. Do not write to the person who did not ` +
        `answer, and do not present the silence as their refusal: they may never have seen it.`,
    });
    told += 1;
  }
  return told;
}
