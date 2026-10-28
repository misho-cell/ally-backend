import { query } from '../db/postgres/client';

/**
 * #7659 (founder's case register, L95/L96/L103/L104/L106, 22–25 Oct): several
 * small asks reached one person one after another, and new ones went to people
 * who had not opened the last. A person hears from the same asker again only
 * after seeing what they were sent; the next question waits for the message
 * after that.
 *
 * ON by Misho's yes of 26 Oct (the note is model-facing text, D44); it
 * replaces row 205's „a later nudge stays legal" for unseen asks.
 */
export const PACE_UNTIL_SEEN_ON = true;

const UNSEEN_LOOKUP_TIMEOUT_MS = 4_000;
/** An unseen ask older than this no longer holds the next one; askExpiry closes such asks anyway. */
const UNSEEN_HOLD_DAYS = 14;

/** Has this asker an ask to this person that they have not opened yet? */
export async function previousAskUnseen(fromUserId: string, toUserId: number): Promise<boolean> {
  const result = await query<{ found: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM task_asks
        WHERE from_user_id = $1::int AND to_user_id = $2::int
          AND status = 'sent' AND seen_at IS NULL
          AND created_at > NOW() - ($3 || ' days')::INTERVAL
     ) AS found`,
    [fromUserId, toUserId, UNSEEN_HOLD_DAYS],
    UNSEEN_LOOKUP_TIMEOUT_MS,
  );
  return result.rows[0]?.found === true;
}

/**
 * What the asking run is told (Misho's yes, 26 Oct). #7659 (tester 77420): the
 * question is kept and goes by itself once they have read the earlier one.
 */
export function previousAskUnseenNote(toName: string): string {
  return (
    `${toName}-ს წინა შეტყობინება ჯერ არ უნახავს — ახალს ახლა არ ვუგზავნით. ეს კითხვა შენახულია ` +
    'და თავისით გაიგზავნება, როგორც კი წინას ნახავს; მფლობელს ასე უთხარი. ამასობაში სხვა ' +
    'ადამიანებით, მეორე წრით და ვებით გააგრძელე.'
  );
}

const HOLD_QUERY_TIMEOUT_MS = 4_000;
const RELEASED_PER_READ = 5;

/** Keeps a held question for this pair, once per goal while one waits. */
export async function keepHeldAsk(
  taskId: number,
  fromUserId: string,
  toUserId: number,
  contactPhone: string,
  question: string,
): Promise<void> {
  await query(
    `INSERT INTO pace_held_asks (task_id, from_user_id, to_user_id, contact_phone, question)
     SELECT $1, $2::int, $3, $4, $5
      WHERE NOT EXISTS (SELECT 1 FROM pace_held_asks
                         WHERE task_id = $1 AND to_user_id = $3 AND released_at IS NULL)`,
    [taskId, fromUserId, toUserId, contactPhone, question],
    HOLD_QUERY_TIMEOUT_MS,
  );
}

export interface HeldAsk {
  readonly id: number;
  readonly task_id: number;
  readonly from_user_id: number;
  readonly contact_phone: string;
  readonly question: string;
}

/** The held questions to this reader, claimed so no other read sends them too. */
export async function claimHeldAsks(readerUserId: string): Promise<HeldAsk[]> {
  const result = await query<HeldAsk>(
    `UPDATE pace_held_asks SET released_at = NOW()
      WHERE id IN (SELECT id FROM pace_held_asks
                    WHERE to_user_id = $1::int AND released_at IS NULL
                      AND created_at > NOW() - ($2 || ' days')::INTERVAL
                    ORDER BY id LIMIT $3)
      RETURNING id, task_id, from_user_id, contact_phone, question`,
    [readerUserId, UNSEEN_HOLD_DAYS, RELEASED_PER_READ],
    HOLD_QUERY_TIMEOUT_MS,
  );
  return result.rows;
}

export async function noteHeldAskOutcome(id: number, outcome: string): Promise<void> {
  await query(
    `UPDATE pace_held_asks SET outcome = $2 WHERE id = $1`,
    [id, outcome],
    HOLD_QUERY_TIMEOUT_MS,
  );
}
