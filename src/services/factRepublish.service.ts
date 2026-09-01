import { query } from '../db/postgres/client';
import {
  FACT_FIELD_TYPES,
  moderateNotePublicity,
  runSemanticMatching,
  trustedFactCuratorIds,
} from './contactFacts.service';

/**
 * One-off repair pass over facts already in the database.
 *
 * The fenced-JSON bug (see modelJson.ts) meant no fact ever became public:
 * 1,051 rows sat private, each one already "moderated" or already carrying a
 * second source. Fixing the parser only changes what happens to NEW saves —
 * this pass re-runs the same two decisions over the stock, plus publishes the
 * trusted curators' core facts under the founder's 1 Sep ruling.
 *
 * Paced by `limit` and idempotent: every step only ever looks at rows that are
 * still private, so re-running it costs one query and finds nothing.
 */

const REPUBLISH_QUERY_TIMEOUT_MS = 15_000;
// Model calls run in small waves: fast enough to clear the stock in a few
// passes, small enough that a batch always answers inside the proxy's window.
const MODERATION_WAVE_SIZE = 5;

export interface RepublishResult {
  curator_core_published: number;
  free_form_checked: number;
  free_form_published: number;
  core_groups_checked: number;
  core_facts_published: number;
}

interface PrivateFactRow {
  id: number;
  field_type: string;
  value: string;
}

/**
 * The founder's ruling: a trusted curator's core fact is public as written.
 * Pure SQL, no model call — the curator's own value is the canonical.
 */
async function publishCuratorCoreFacts(): Promise<number> {
  const ids = trustedFactCuratorIds();
  if (ids.length === 0) return 0;

  const result = await query(
    `UPDATE contact_facts
     SET is_public = true, canonical_value = value, updated_at = NOW()
     WHERE submitted_by_user_id = ANY($1)
       AND field_type = ANY($2)
       AND is_public = false
       AND retracted_at IS NULL`,
    [ids as string[], FACT_FIELD_TYPES as readonly string[]],
    REPUBLISH_QUERY_TIMEOUT_MS,
  );
  return result.rowCount ?? 0;
}

/** Re-ask the moderator about private free-form facts, in small waves. */
async function remoderateFreeFormFacts(
  limit: number,
): Promise<{ checked: number; published: number }> {
  const candidates = await query<PrivateFactRow>(
    `SELECT id, field_type, value FROM contact_facts
     WHERE is_public = false AND retracted_at IS NULL
       AND field_type <> ALL($1)
     ORDER BY id
     LIMIT $2`,
    [FACT_FIELD_TYPES as readonly string[], limit],
    REPUBLISH_QUERY_TIMEOUT_MS,
  );

  let published = 0;
  for (let i = 0; i < candidates.rows.length; i += MODERATION_WAVE_SIZE) {
    const wave = candidates.rows.slice(i, i + MODERATION_WAVE_SIZE);
    const verdicts = await Promise.all(
      wave.map((row) => moderateNotePublicity(row.field_type, row.value)),
    );
    const publishable = wave.filter((_, index) => verdicts[index]).map((row) => row.id);
    if (publishable.length === 0) continue;
    const updated = await query(
      `UPDATE contact_facts
       SET is_public = true, canonical_value = value, moderated_at = NOW(), updated_at = NOW()
       WHERE id = ANY($1)`,
      [publishable],
      REPUBLISH_QUERY_TIMEOUT_MS,
    );
    published += updated.rowCount ?? 0;
  }
  return { checked: candidates.rows.length, published };
}

interface CoreGroup {
  neo4j_contact_id: string;
  field_type: string;
}

/** Re-run crowd confirmation for one (contact, field) group. */
async function reconfirmGroup(group: CoreGroup): Promise<number> {
  const facts = await query<PrivateFactRow>(
    `SELECT id, field_type, value FROM contact_facts
     WHERE neo4j_contact_id = $1 AND field_type = $2 AND retracted_at IS NULL
     ORDER BY id`,
    [group.neo4j_contact_id, group.field_type],
    REPUBLISH_QUERY_TIMEOUT_MS,
  );
  if (facts.rows.length < 2) return 0;

  const match = await runSemanticMatching(
    group.field_type,
    facts.rows.map((f) => f.value),
  );
  if (!match.canonical || match.matching_indices.length < 2) return 0;

  const ids = match.matching_indices
    .filter((index) => index >= 0 && index < facts.rows.length)
    .map((index) => facts.rows[index].id);
  if (ids.length < 2) return 0;

  const updated = await query(
    `UPDATE contact_facts SET is_public = true, canonical_value = $1, updated_at = NOW()
     WHERE id = ANY($2)`,
    [match.canonical, ids],
    REPUBLISH_QUERY_TIMEOUT_MS,
  );
  return updated.rowCount ?? 0;
}

/** Core facts that already have two independent submitters but no public row. */
async function reconfirmCoreFacts(limit: number): Promise<{ groups: number; published: number }> {
  const groups = await query<CoreGroup>(
    `SELECT neo4j_contact_id, field_type
     FROM contact_facts
     WHERE field_type = ANY($1) AND retracted_at IS NULL
     GROUP BY neo4j_contact_id, field_type
     HAVING COUNT(DISTINCT submitted_by_user_id) >= 2
        AND COUNT(*) FILTER (WHERE is_public) = 0
     LIMIT $2`,
    [FACT_FIELD_TYPES as readonly string[], limit],
    REPUBLISH_QUERY_TIMEOUT_MS,
  );

  let published = 0;
  for (const group of groups.rows) {
    published += await reconfirmGroup(group);
  }
  return { groups: groups.rows.length, published };
}

export async function republishFacts(limit: number): Promise<RepublishResult> {
  const curatorPublished = await publishCuratorCoreFacts();
  const freeForm = await remoderateFreeFormFacts(limit);
  const core = await reconfirmCoreFacts(limit);
  return {
    curator_core_published: curatorPublished,
    free_form_checked: freeForm.checked,
    free_form_published: freeForm.published,
    core_groups_checked: core.groups,
    core_facts_published: core.published,
  };
}
