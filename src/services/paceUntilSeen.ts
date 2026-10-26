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

/** What the asking run is told (Misho's yes, 26 Oct). */
export function previousAskUnseenNote(toName: string): string {
  return (
    `${toName}-ს წინა შეტყობინება ჯერ არ უნახავს — ახალს არ ვუგზავნით, სანამ არ ნახავს. ` +
    'ეს კითხვა შემდეგ შეტყობინებაში ჩასვი, ერთად; ამასობაში სხვა ადამიანებით, მეორე წრით და ვებით გააგრძელე.'
  );
}
