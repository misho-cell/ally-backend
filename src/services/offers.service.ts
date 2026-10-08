import { query } from '../db/postgres/client';

/**
 * 1698 (A15): what a member is open to — „if anyone needs hospitality in
 * Adjara, I'm interested". Since automatic answers were switched off (D669) it
 * had nowhere to live, and a declared openness is the strongest willingness
 * signal there is. Stored in the assistant's one-line wording, never his
 * typed words; read by pre-matching and the matcher only.
 */
const QUERY_TIMEOUT_MS = 5_000;
export const MAX_OFFER_CHARS = 200;
export const MAX_FIELD_CHARS = 60;
/** A person says what he is open to a handful of times, not hundreds. */
export const MAX_ACTIVE_OFFERS = 20;
const ADMIN_OFFER_LIMIT = 50;

export interface Offer {
  readonly id: number;
  readonly text: string;
  readonly field: string | null;
  readonly created_at: string;
}

export class OfferRefused extends Error {}

/** Saves one offer; refused when the text is empty or the owner already holds the most. */
export async function saveOffer(
  userId: string,
  text: string,
  field: string | null,
): Promise<Offer> {
  const line = text.trim().slice(0, MAX_OFFER_CHARS);
  if (line === '') throw new OfferRefused('Pass `text`: the one line the owner confirmed.');
  const held = await query<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM offers WHERE user_id = $1::int AND active`,
    [userId],
    QUERY_TIMEOUT_MS,
  );
  if ((held.rows[0]?.n ?? 0) >= MAX_ACTIVE_OFFERS) {
    throw new OfferRefused('The owner already has the most offers saved; one must go first.');
  }
  const cleanField = field?.trim().toLowerCase().slice(0, MAX_FIELD_CHARS) || null;
  const saved = await query<Offer>(
    `INSERT INTO offers (user_id, text, field) VALUES ($1::int, $2, $3)
     RETURNING id, text, field, created_at`,
    [userId, line, cleanField],
    QUERY_TIMEOUT_MS,
  );
  return saved.rows[0];
}

/** The owner's own active offers, newest first. */
export async function listOffers(userId: string): Promise<Offer[]> {
  const result = await query<Offer>(
    `SELECT id, text, field, created_at FROM offers
      WHERE user_id = $1::int AND active
      ORDER BY id DESC LIMIT $2`,
    [userId, MAX_ACTIVE_OFFERS],
    QUERY_TIMEOUT_MS,
  );
  return result.rows;
}

/** „Forget that": the offer stops counting. False when it is not the owner's or already gone. */
export async function deleteOffer(userId: string, offerId: number): Promise<boolean> {
  if (!Number.isInteger(offerId) || offerId <= 0) return false;
  const result = await query(
    `UPDATE offers SET active = FALSE WHERE id = $1 AND user_id = $2::int AND active`,
    [offerId, userId],
    QUERY_TIMEOUT_MS,
  );
  return (result.rowCount ?? 0) > 0;
}

/** Every offer of one member, the switched-off ones too — the admin per-user page only. */
export async function offersForAdmin(
  userId: number,
): Promise<Array<Offer & { readonly active: boolean }>> {
  const result = await query<Offer & { active: boolean }>(
    `SELECT id, text, field, created_at, active FROM offers
      WHERE user_id = $1::int ORDER BY id DESC LIMIT $2`,
    [userId, ADMIN_OFFER_LIMIT],
    QUERY_TIMEOUT_MS,
  );
  return result.rows;
}
