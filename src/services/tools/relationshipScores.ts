import { query } from '../../db/postgres/client';

const SCORE_TIMEOUT_MS = 3_000;

export interface RelationshipInfo {
  readonly relationship: string; // family | close | professional | formal
  readonly strength: number; // 0..1
}

/**
 * The enrichment job has been computing per-edge relationship scores (type +
 * strength from alias keywords and bidirectionality) all along — this is the
 * first consumer. Returns the OWNER's score toward each phone. Best-effort:
 * an error returns an empty map and never fails the search.
 */
export async function fetchRelationshipForPhones(
  userId: string,
  phones: string[],
): Promise<Map<string, RelationshipInfo>> {
  if (phones.length === 0) return new Map();
  try {
    const result = await query<{
      contact_phone: string;
      relationship_type: string;
      strength_score: number;
    }>(
      `SELECT contact_phone, relationship_type, strength_score
       FROM contact_relationship_scores
       WHERE user_id = $1::int AND contact_phone = ANY($2)`,
      [userId, phones],
      SCORE_TIMEOUT_MS,
    );
    return new Map(
      result.rows.map((r) => [
        r.contact_phone,
        { relationship: r.relationship_type, strength: Number(r.strength_score) },
      ]),
    );
  } catch {
    return new Map();
  }
}
