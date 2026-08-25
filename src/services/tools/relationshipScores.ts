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

export type HumanTier = 'green' | 'blue' | 'yellow' | 'red';

/**
 * A tier a HUMAN set by hand — today, only the old-Ally colour classification
 * (migration 080), backfilled from UserConnection.weight/relationshipStatus.
 * Deliberately a separate table and a separate fetch from
 * fetchRelationshipForPhones' machine-computed strength_score: ticket 6
 * task 4's conflict rule is that a hand-set value is never overwritten by a
 * computed one, and both must be readable for the same contact — merging
 * them into one field would make that impossible to tell apart later.
 */
export async function fetchHumanTierForPhones(
  userId: string,
  phones: string[],
): Promise<Map<string, HumanTier>> {
  if (phones.length === 0) return new Map();
  try {
    const result = await query<{ contact_phone: string; tier: HumanTier }>(
      `SELECT contact_phone, tier
       FROM human_relationship_tiers
       WHERE user_id = $1::int AND contact_phone = ANY($2)`,
      [userId, phones],
      SCORE_TIMEOUT_MS,
    );
    return new Map(result.rows.map((r) => [r.contact_phone, r.tier]));
  } catch {
    return new Map();
  }
}
