import { query, backgroundQuery } from '../../db/postgres/client';

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

// Live-caught (25 Aug), the outage this batching exists to prevent: the
// original backfill was one INSERT joining UserConnectionPhone's ~7.26M rows
// against UserConnection, inside the migration's own transaction — on the
// DEFAULT pool, whose connections are opened with statement_timeout=8000
// (client.ts). Measured directly against prod: even the SMALLEST tier
// alone, as a bare SELECT with no write and no sort, took 11.3s — already
// past that 8s ceiling on its own, before the real query's sort and INSERT
// cost anything. The migration rolled back and the app crash-looped on
// every boot (migrations re-run on startup). Two fixes, both required: (1)
// backgroundQuery, whose pool opens connections at statement_timeout=30000
// — an 8s ceiling was never going to fit this job, no matter how it's
// batched; (2) a 100,000-id range on UserConnectionPhone's own primary key
// per query, ~3s measured, an index range scan instead of a full table
// scan every batch.
const BACKFILL_BATCH_SIZE = 100_000;

export interface TierBackfillResult {
  batches: number;
  inserted: number;
  maxId: number;
}

/**
 * Walks UserConnectionPhone in id-order batches, inserting each phone's
 * old-Ally colour tier. ON CONFLICT DO NOTHING means whichever UserConnection
 * row for a given (user, phone) pair is visited FIRST wins — id order, not
 * tier priority, decides ties. Ties (the same user classifying the same
 * phone under two different UserConnection rows) are rare and this is a
 * one-time historical backfill, not a live-correctness path, so an
 * occasional non-warmest tier on a duplicate is an acceptable trade against
 * the alternative (a single unbounded sorted query — the one that caused
 * the outage). Safe to re-run: already-inserted pairs are skipped.
 */
export async function backfillHumanRelationshipTiers(): Promise<TierBackfillResult> {
  const maxIdResult = await backgroundQuery<{ max: number | null }>(
    `SELECT MAX(id) AS max FROM "UserConnectionPhone"`,
  );
  const maxId = Number(maxIdResult.rows[0]?.max ?? 0);

  let batches = 0;
  let inserted = 0;
  for (let cursor = 0; cursor < maxId; cursor += BACKFILL_BATCH_SIZE) {
    const result = await backgroundQuery(
      `INSERT INTO human_relationship_tiers (user_id, contact_phone, tier, source, set_at)
       SELECT uc."originUserId", ucp.phone,
         CASE uc."relationshipStatus"
           WHEN 'allies' THEN 'green'
           WHEN 'loyal' THEN 'blue'
           WHEN 'connections' THEN 'yellow'
           WHEN 'contacts' THEN 'red'
         END,
         'old_ally_classify',
         NOW()
       FROM "UserConnectionPhone" ucp
       JOIN "UserConnection" uc ON uc.id = ucp."connectionId"
       WHERE ucp.id > $1 AND ucp.id <= $2
         AND uc."relationshipStatus" IN ('allies', 'loyal', 'connections', 'contacts')
       ON CONFLICT (user_id, contact_phone) DO NOTHING`,
      [cursor, cursor + BACKFILL_BATCH_SIZE],
    );
    batches++;
    inserted += result.rowCount ?? 0;
  }
  return { batches, inserted, maxId };
}
