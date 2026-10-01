import { query } from '../db/postgres/client';

/**
 * The tester's 983: a question an APPROVED plan was going to send, held only
 * by the recipient's 24-hour limit. At the goal's wake after the reopening the
 * run is told exactly what is waiting — no guessing whether the window
 * reopened, no second yes from the owner (D119).
 */
const QUERY_TIMEOUT_MS = 5_000;
const MAX_HELD_PER_WAKE = 10;

export interface HeldAsk {
  readonly id: number;
  readonly contact_name: string;
  readonly question: string;
  readonly reopens_at: string;
}

/** Records one held question, once per goal and person. */
export async function holdAsk(
  taskId: number,
  toUserId: number,
  contactName: string,
  question: string,
  reopensAt: Date,
): Promise<void> {
  await query(
    `INSERT INTO held_asks (task_id, to_user_id, contact_name, question, reopens_at)
     SELECT $1, $2, $3, $4, $5
      WHERE NOT EXISTS (SELECT 1 FROM held_asks
                         WHERE task_id = $1 AND to_user_id = $2 AND released_at IS NULL)`,
    [taskId, toUserId, contactName, question, reopensAt],
    QUERY_TIMEOUT_MS,
  );
}

/** The held questions whose window has reopened, marked as told so each is said once. */
export async function releaseDueHeldAsks(taskId: number): Promise<HeldAsk[]> {
  const result = await query<{
    id: number;
    contact_name: string;
    question: string;
    reopens_at: Date | string;
  }>(
    `UPDATE held_asks SET released_at = NOW()
      WHERE id IN (SELECT id FROM held_asks
                    WHERE task_id = $1 AND released_at IS NULL AND reopens_at <= NOW()
                    ORDER BY id LIMIT ${MAX_HELD_PER_WAKE})
      RETURNING id, contact_name, question, reopens_at`,
    [taskId],
    QUERY_TIMEOUT_MS,
  );
  return result.rows.map((r) => ({
    id: r.id,
    contact_name: r.contact_name,
    question: r.question,
    reopens_at: new Date(r.reopens_at).toISOString(),
  }));
}

/** A question that went after all is no longer held. */
export async function releaseHeldAsk(taskId: number, toUserId: number): Promise<void> {
  await query(
    `UPDATE held_asks SET released_at = NOW()
      WHERE task_id = $1 AND to_user_id = $2 AND released_at IS NULL`,
    [taskId, toUserId],
    QUERY_TIMEOUT_MS,
  );
}

/**
 * What the wake run is told. In Georgian like the engine's other events; the
 * run answers in the owner's language whatever this is written in.
 */
export function heldAsksWakeNote(held: readonly HeldAsk[]): string {
  const lines = held.map((h) => `• ${h.contact_name}: „${h.question}"`).join('\n');
  return (
    'ეს კითხვები მხოლოდ მიმღების 24-საათიანმა ზღვარმა შეაჩერა და ის ზღვარი უკვე გაიხსნა:\n' +
    `${lines}\n` +
    'გეგმა დამტკიცებულია — ეს თვითონ არის თანხმობა (D119). თითოეული ახლავე გაუგზავნე ' +
    'ask_contact-ით, იმავე ტექსტით. მფლობელს ხელახლა არ ჰკითხო, „ალბათ" არ დაწერო და ' +
    'ზღვარზე არ ილაპარაკო. გაგზავნის შემდეგ ერთი ხაზი: ვის მიეწერა.'
  );
}
