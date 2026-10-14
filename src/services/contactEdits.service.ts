import { query } from '../db/postgres/client';
import { submitContactFact } from './contactFacts.service';
import { markContactDeceased } from './deceased.service';
import { normalizePhone, phoneDigits } from './phone';
import { removeContactFromNetwork } from './tools/removeContactFromNetwork';

/**
 * The frontend's 14 Oct 14:10Z item 1 (Misho asked for it): the contact's own
 * page lets the person correct what Netai keeps about one of their contacts —
 * their OWN facts, by id; an exclusion taken back; the contact removed from
 * their network or marked as passed away. Every write is by id or by the
 * contact the page was opened for, never by matching text, and touches only
 * what this person saved.
 */
const QUERY_TIMEOUT_MS = 5_000;
export const MAX_FACT_CHARS = 500;
/** A fact typed on the page is a note; the chat files typed facts the same way. */
const PAGE_FACT_FIELD = 'note';

export enum EditOutcome {
  Done = 'done',
  NotFound = 'not_found',
}

/** A fact the person types on the page, kept as their own note about the contact. */
export async function addOwnFact(userId: number, phone: string, text: string): Promise<void> {
  await submitContactFact(String(userId), phone, PAGE_FACT_FIELD, text.trim());
}

/** The person's own fact, corrected in place; another member's fact is never found. */
export async function correctOwnFact(
  userId: number,
  phone: string,
  factId: number,
  text: string,
): Promise<EditOutcome> {
  const result = await query(
    `UPDATE contact_facts
        SET value = $4, canonical_value = NULL, updated_at = NOW()
      WHERE id = $1 AND submitted_by_user_id = $2 AND neo4j_contact_id = $3
        AND retracted_at IS NULL`,
    [factId, String(userId), normalizePhone(phone), text.trim()],
    QUERY_TIMEOUT_MS,
  );
  return (result.rowCount ?? 0) > 0 ? EditOutcome.Done : EditOutcome.NotFound;
}

/** The person's own fact, forgotten: the row is deleted, as „forget it" in the chat does. */
export async function forgetOwnFact(
  userId: number,
  phone: string,
  factId: number,
): Promise<EditOutcome> {
  const result = await query(
    `DELETE FROM contact_facts
      WHERE id = $1 AND submitted_by_user_id = $2 AND neo4j_contact_id = $3`,
    [factId, String(userId), normalizePhone(phone)],
    QUERY_TIMEOUT_MS,
  );
  return (result.rowCount ?? 0) > 0 ? EditOutcome.Done : EditOutcome.NotFound;
}

/** One of the person's exclusions of this contact, taken back. */
export async function removeOwnExclusion(
  userId: number,
  phone: string,
  exclusionId: number,
): Promise<EditOutcome> {
  const result = await query(
    `DELETE FROM contact_exclusions WHERE id = $1 AND user_id = $2::int AND contact_phone = $3`,
    [exclusionId, userId, phoneDigits(phone)],
    QUERY_TIMEOUT_MS,
  );
  return (result.rowCount ?? 0) > 0 ? EditOutcome.Done : EditOutcome.NotFound;
}

/** The contact leaves the person's network (the chat's remove_contact_from_network). */
export async function removeFromNetwork(userId: number, phone: string): Promise<boolean> {
  return (await removeContactFromNetwork(String(userId), phone)).removed;
}

/** The contact is marked as passed away; Netai never suggests or asks them again. */
export async function markDeceased(userId: number, phone: string): Promise<boolean> {
  return (await markContactDeceased(String(userId), phone)).marked;
}
