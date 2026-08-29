import { query } from '../db/postgres/client';
import { normalizePhone } from './phone';

const RELATIONSHIP_QUERY_TIMEOUT_MS = 8_000;
const MAX_RELATION_LEN = 60;
// D34's ranking half: an edge the SEARCHER recorded touching a result lifts
// via_warmth by this much (capped at the same ceiling via_warmth v2 uses).
// The reason itself never leaves the server.
export const RELATIONSHIP_WARMTH_BONUS = 0.2;
export const RELATIONSHIP_WARMTH_CAP = 0.95;
// A result with no computed warmth at all still gets the baseline + bonus —
// mirrors via_warmth v2's own 0.3 unscored-edge baseline.
export const RELATIONSHIP_WARMTH_BASELINE = 0.3;

// D34 (approved 29 Aug): "X is Y's brother" — a private edge between two of
// the user's contacts. Stored user-scoped, warms ranking, never spoken: the
// edge is not serialized into any response another surface could leak — only
// its numeric contribution to via_warmth survives (the signal_strength
// philosophy). The owner may be told their OWN record back (that is a
// return, not a disclosure); disclosable stays FALSE unless an admin raises
// it by hand.

export interface ContactRelationship {
  phone_a: string;
  phone_b: string;
  relation: string;
  created_at: string;
}

export interface SaveRelationshipOutcome {
  saved: boolean;
  /** The identical row already existed — treated as success (idempotent). */
  already?: boolean;
  error?: string;
}

/** One tie = one ordered pair, whichever order it was said in. */
function orderedPair(rawA: string, rawB: string): { a: string; b: string } | null {
  const a = normalizePhone(rawA);
  const b = normalizePhone(rawB);
  if (!a || !b || a === b) return null;
  return a < b ? { a, b } : { a: b, b: a };
}

export async function saveContactRelationship(
  userId: string,
  phoneARaw: string,
  phoneBRaw: string,
  relationRaw: string,
): Promise<SaveRelationshipOutcome> {
  const pair = orderedPair(phoneARaw, phoneBRaw);
  if (pair === null) {
    return { saved: false, error: 'Pass two DIFFERENT phone ids from search results.' };
  }
  const relation = relationRaw.trim().toLowerCase().slice(0, MAX_RELATION_LEN);
  if (!relation) return { saved: false, error: 'Pass a non-empty relation.' };

  const inserted = await query<{ id: number }>(
    `INSERT INTO contact_relationships (user_id, phone_a, phone_b, relation)
     VALUES ($1::int, $2, $3, $4)
     ON CONFLICT (user_id, phone_a, phone_b, relation) DO NOTHING
     RETURNING id`,
    [userId, pair.a, pair.b, relation],
    RELATIONSHIP_QUERY_TIMEOUT_MS,
  );
  return inserted.rows.length > 0 ? { saved: true } : { saved: true, already: true };
}

/**
 * Forget the user's own tie(s) between two contacts — all relations for the
 * pair when none is named. Same shape as every other own-record delete.
 */
export async function forgetContactRelationship(
  userId: string,
  phoneARaw: string,
  phoneBRaw: string,
  relationRaw?: string,
): Promise<{ removed: number; error?: string }> {
  const pair = orderedPair(phoneARaw, phoneBRaw);
  if (pair === null) {
    return { removed: 0, error: 'Pass two DIFFERENT phone ids from search results.' };
  }
  const relation = relationRaw?.trim().toLowerCase();
  const result = relation
    ? await query(
        `DELETE FROM contact_relationships
         WHERE user_id = $1::int AND phone_a = $2 AND phone_b = $3 AND relation = $4`,
        [userId, pair.a, pair.b, relation],
        RELATIONSHIP_QUERY_TIMEOUT_MS,
      )
    : await query(
        `DELETE FROM contact_relationships
         WHERE user_id = $1::int AND phone_a = $2 AND phone_b = $3`,
        [userId, pair.a, pair.b],
        RELATIONSHIP_QUERY_TIMEOUT_MS,
      );
  return { removed: result.rowCount ?? 0 };
}

/**
 * The owner's OWN records back — optionally filtered to ties touching one
 * contact. Telling a user what they themselves said is a return, never a
 * disclosure; this function must only ever serve the owning user's surface.
 */
export async function listOwnRelationships(
  userId: string,
  phoneRaw?: string,
): Promise<ContactRelationship[]> {
  const phone = phoneRaw ? normalizePhone(phoneRaw) : '';
  const result = phone
    ? await query<ContactRelationship>(
        `SELECT phone_a, phone_b, relation, created_at FROM contact_relationships
         WHERE user_id = $1::int AND (phone_a = $2 OR phone_b = $2)
         ORDER BY created_at DESC LIMIT 50`,
        [userId, phone],
        RELATIONSHIP_QUERY_TIMEOUT_MS,
      )
    : await query<ContactRelationship>(
        `SELECT phone_a, phone_b, relation, created_at FROM contact_relationships
         WHERE user_id = $1::int ORDER BY created_at DESC LIMIT 50`,
        [userId],
        RELATIONSHIP_QUERY_TIMEOUT_MS,
      );
  return result.rows;
}

/**
 * The ranking read (D34's "warms and stays silent"): which of these result
 * phones does the SEARCHER have a relationship edge touching? Returns only
 * membership — the relation text never leaves this module toward a search
 * response. Fail-soft: ranking must never break on this store.
 */
export async function relationshipTouchedPhones(
  userId: string,
  phones: string[],
): Promise<Set<string>> {
  if (phones.length === 0) return new Set();
  try {
    const result = await query<{ phone: string }>(
      `SELECT p.phone
       FROM UNNEST($2::text[]) AS p(phone)
       WHERE EXISTS (
         SELECT 1 FROM contact_relationships cr
         WHERE cr.user_id = $1::int AND (cr.phone_a = p.phone OR cr.phone_b = p.phone)
       )`,
      [userId, phones.map((p) => normalizePhone(p))],
      RELATIONSHIP_QUERY_TIMEOUT_MS,
    );
    return new Set(result.rows.map((r) => r.phone));
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[relationships] warmth read failed:', (err as Error).message);
    return new Set();
  }
}

/** The boost itself — one formula, used by every ranking caller. */
export function applyRelationshipWarmth(current: number | null | undefined): number {
  const base = current == null ? RELATIONSHIP_WARMTH_BASELINE : Number(current);
  return Math.min(RELATIONSHIP_WARMTH_CAP, base + RELATIONSHIP_WARMTH_BONUS);
}
