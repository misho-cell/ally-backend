import { query } from '../db/postgres/client';
import { computeRelationshipScore, hasFamilyKeyword } from './enrichment.service';

/**
 * #7232 (Misho's yes, 23 Oct): the stored „family" scores made by the old
 * substring rule are read again with the whole-word rule (d6726259). On 22 Oct
 * 110,707 of 110,709 family rows carried only that signal — every „-შვილი"
 * surname, მამალაძე, a ძმაკაცი.
 *
 * Only a row whose sole reason was the label word is touched: an owner's own
 * statement (explicit_insight) or the old Ally sort keeps its score. A label
 * that still holds a family word stays family. The rest are scored again from
 * the same label, as the enrichment would score them today. Batched, so one
 * call never holds the table long; called again until nothing is left.
 */
const RECOUNT_QUERY_TIMEOUT_MS = 30_000;
/** Owners per call: their rows are read whole, so no phone ever serves as a cursor (D149). */
export const MAX_RECOUNT_OWNERS = 50;

interface FamilyRow {
  readonly user_id: number;
  readonly contact_phone: string;
  readonly alias: string | null;
  readonly bidirectional: boolean;
}

export interface FamilyRecount {
  readonly checked: number;
  readonly changed: number;
  readonly stillFamily: number;
  /** The owner to continue after; null when every owner has been read. */
  readonly nextAfterUserId: number | null;
}

/** A family score whose only reason was a word in the label. */
function keywordOnlyFamily(row: string): string {
  return `${row}.relationship_type = 'family'
        AND ${row}.signals->>'family_keyword' = 'true'
        AND ${row}.signals->>'explicit_insight' IS NULL
        AND ${row}.signals->>'old_ally_status' IS NULL`;
}

async function nextOwners(afterUserId: number, owners: number): Promise<number[]> {
  const result = await query<{ user_id: number }>(
    `SELECT DISTINCT crs.user_id FROM contact_relationship_scores crs
      WHERE ${keywordOnlyFamily('crs')} AND crs.user_id > $1
      ORDER BY crs.user_id
      LIMIT $2`,
    [afterUserId, owners],
    RECOUNT_QUERY_TIMEOUT_MS,
  );
  return result.rows.map((r) => r.user_id);
}

async function keywordOnlyFamilyRows(ownerIds: readonly number[]): Promise<FamilyRow[]> {
  const result = await query<FamilyRow>(
    `SELECT crs.user_id, crs.contact_phone,
            (SELECT ua.alias FROM "UserAlias" ua
              WHERE ua."contactId" = crs.user_id
                AND regexp_replace(ua.phone, '\\D', '', 'g') = regexp_replace(crs.contact_phone, '\\D', '', 'g')
              ORDER BY ua.created_at LIMIT 1) AS alias,
            COALESCE((crs.signals->>'bidirectional')::boolean, false) AS bidirectional
       FROM contact_relationship_scores crs
      WHERE crs.user_id = ANY($1::int[]) AND ${keywordOnlyFamily('crs')}`,
    [ownerIds],
    RECOUNT_QUERY_TIMEOUT_MS,
  );
  return result.rows;
}

async function rescore(row: FamilyRow): Promise<boolean> {
  const score = computeRelationshipScore(row.alias ?? '', row.bidirectional);
  if (score.relationship_type === 'family') return false;
  await query(
    `UPDATE contact_relationship_scores
        SET relationship_type = $3, strength_score = $4, signals = $5, computed_at = NOW()
      WHERE user_id = $1 AND contact_phone = $2 AND relationship_type = 'family'`,
    [row.user_id, row.contact_phone, score.relationship_type, score.strength_score, score.signals],
    RECOUNT_QUERY_TIMEOUT_MS,
  );
  return true;
}

/** One batch of owners after the given one; a label that is still family is passed over. */
export async function recountFamilyBatch(owners: number, afterUserId = 0): Promise<FamilyRecount> {
  const ownerIds = await nextOwners(afterUserId, owners);
  const rows = ownerIds.length === 0 ? [] : await keywordOnlyFamilyRows(ownerIds);
  let changed = 0;
  for (const row of rows) {
    if (row.alias !== null && hasFamilyKeyword(row.alias)) continue;
    if (await rescore(row)) changed += 1;
  }
  return {
    checked: rows.length,
    changed,
    stillFamily: rows.length - changed,
    nextAfterUserId: ownerIds.length < owners ? null : (ownerIds[ownerIds.length - 1] ?? null),
  };
}
