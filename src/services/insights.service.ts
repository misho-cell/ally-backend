import { query } from '../db/postgres/client';
import { normalizePhone } from './phone';
import { ContactInsight, ContactInsightWithFieldContext, InsightField } from '../types';

const INSIGHT_FIELD_SELECT = `
  SELECT
    id,
    field_key AS "fieldKey",
    field_label AS "fieldLabel",
    field_description AS "fieldDescription",
    is_active AS "isActive",
    created_at AS "createdAt"
  FROM insight_fields
`;

/** A refusal the doors turn into an answer, never a raw failure. */
export class InsightRefusedError extends Error {}

export async function getInsightFields(): Promise<InsightField[]> {
  const result = await query<InsightField>(
    `${INSIGHT_FIELD_SELECT} WHERE is_active = true ORDER BY created_at ASC`,
  );
  return result.rows;
}

export async function getAllInsightFields(): Promise<InsightField[]> {
  const result = await query<InsightField>(`${INSIGHT_FIELD_SELECT} ORDER BY created_at ASC`);
  return result.rows;
}

/**
 * ⚠️ THE LIVE DOOR IS `chat.service.ts`'s DISPATCHER, NOT THE TOOL WRAPPER.
 *
 * `tools/save_contact_insight.ts` and `tools/get_contact_insight.ts` look like
 * the entry points and are not: `getContactInsightTools` is consumed only by
 * `toAnthropicTool`, which reads `name`, `description` and `parameters` and
 * never touches `execute`. Those closures do not run. The dispatcher calls
 * THESE functions directly.
 *
 * This is written down because guarding the wrappers instead of these is a
 * mistake already made once, on 27 September — the tests passed, the guard was
 * real, and it sat in a function nothing invokes.
 */
export const INSIGHT_NEEDS_A_CONTACT = 'Pass the phone id from a search result.';
export const INSIGHT_NEEDS_A_NAME = 'Pass the contact name.';
export const INSIGHT_NEEDS_DATA = 'Pass collected_data as an object.';

export async function getContactInsight(
  userId: string,
  neo4jContactId: string,
): Promise<ContactInsight | null> {
  // No insight is ever stored under a phone with no digits in it, so asking
  // for one is answered without a query. See the note on the save below for
  // why that matters rather than being a tidy-up.
  if (!normalizePhone(neo4jContactId)) return null;
  const result = await query<ContactInsight>(
    `SELECT id, user_id AS "userId", neo4j_contact_id AS "neo4jContactId", neo4j_contact_name AS "neo4jContactName", data, created_at AS "createdAt", updated_at AS "updatedAt" FROM contact_insights WHERE user_id = $1 AND neo4j_contact_id = $2`,
    [userId, normalizePhone(neo4jContactId)],
  );

  return result.rows[0] ?? null;
}

export async function saveContactInsight(
  userId: string,
  neo4jContactId: string,
  contactName: string,
  newData: Record<string, unknown>,
): Promise<ContactInsight> {
  // The row is keyed `(user_id, normalizePhone(neo4jContactId))` and merged
  // with `data = contact_insights.data || EXCLUDED.data`, so every save whose
  // phone holds no digits lands on the ONE row keyed `''` and mixes two
  // people's notes together under the later name. `neo4j_contact_name` and
  // `data` are both NOT NULL, so an omitted field is a database error rather
  // than a refusal the model can act on.
  if (!normalizePhone(neo4jContactId)) throw new InsightRefusedError(INSIGHT_NEEDS_A_CONTACT);
  if (contactName.trim() === '') throw new InsightRefusedError(INSIGHT_NEEDS_A_NAME);
  if (newData === null || typeof newData !== 'object' || Array.isArray(newData)) {
    throw new InsightRefusedError(INSIGHT_NEEDS_DATA);
  }
  const result = await query<ContactInsight>(
    `INSERT INTO contact_insights (user_id, neo4j_contact_id, neo4j_contact_name, data)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id, neo4j_contact_id)
     DO UPDATE SET data = contact_insights.data || EXCLUDED.data,
                   neo4j_contact_name = EXCLUDED.neo4j_contact_name,
                   updated_at = NOW()
     RETURNING id, user_id AS "userId", neo4j_contact_id AS "neo4jContactId", neo4j_contact_name AS "neo4jContactName", data, created_at AS "createdAt", updated_at AS "updatedAt"`,
    [userId, normalizePhone(neo4jContactId), contactName, newData],
  );

  if (result.rowCount === 0) {
    throw new Error('Unable to save contact insight');
  }

  // A saved `relationship` is the user's own word on how close this person is —
  // the score that ranks search results must hear it NOW, not at the next
  // nightly run (ticket 4 item 4B.5: five "ახლო მეგობარი" notes, score still
  // formal 0.4). Fire-and-forget; a failure leaves the old score, never blocks
  // the save.
  if (typeof newData.relationship === 'string' && newData.relationship.trim() !== '') {
    void recomputeScoreForContact(userId, result.rows[0].neo4jContactId).catch((err: unknown) => {
      // eslint-disable-next-line no-console
      console.warn('[insights] score recompute failed:', (err as Error).message);
    });
  }

  return result.rows[0];
}

async function recomputeScoreForContact(userId: string, contactPhone: string): Promise<void> {
  const alias = await query<{ alias: string }>(
    `SELECT alias FROM "UserAlias" WHERE "contactId" = $1 AND phone = $2
     ORDER BY LENGTH(alias) DESC LIMIT 1`,
    [userId, contactPhone],
  );
  if (alias.rows.length === 0) return;
  const { getCompositeKeyForUser } = await import('./neo4j.keys');
  const { computeAndSaveSingleScore } = await import('./enrichment.service');
  const userKey = await getCompositeKeyForUser(Number(userId));
  await computeAndSaveSingleScore(Number(userId), userKey, contactPhone, alias.rows[0].alias);
}

export async function getInsightsByUser(userId: string): Promise<ContactInsightWithFieldContext[]> {
  const [insightResult, fields] = await Promise.all([
    query<ContactInsight>(
      `SELECT id, user_id AS "userId", neo4j_contact_id AS "neo4jContactId", neo4j_contact_name AS "neo4jContactName", data, created_at AS "createdAt", updated_at AS "updatedAt"
       FROM contact_insights
       WHERE user_id = $1
       ORDER BY updated_at DESC`,
      [userId],
    ),
    getAllInsightFields(),
  ]);

  return insightResult.rows.map((insight) => ({
    ...insight,
    fieldContext: fields,
  }));
}

export async function createInsightField(
  fieldKey: string,
  fieldLabel: string,
  fieldDescription: string,
): Promise<InsightField> {
  const result = await query<InsightField>(
    `INSERT INTO insight_fields (field_key, field_label, field_description)
     VALUES ($1, $2, $3)
     RETURNING id, field_key AS "fieldKey", field_label AS "fieldLabel", field_description AS "fieldDescription", is_active AS "isActive", created_at AS "createdAt"`,
    [fieldKey, fieldLabel, fieldDescription],
  );

  return result.rows[0];
}

export async function updateInsightField(
  id: string,
  fieldLabel: string,
  fieldDescription: string,
): Promise<InsightField> {
  const result = await query<InsightField>(
    `UPDATE insight_fields
     SET field_label = $2,
         field_description = $3
     WHERE id = $1
     RETURNING id, field_key AS "fieldKey", field_label AS "fieldLabel", field_description AS "fieldDescription", is_active AS "isActive", created_at AS "createdAt"`,
    [id, fieldLabel, fieldDescription],
  );

  if (result.rowCount === 0) {
    throw new Error('Insight field not found');
  }

  return result.rows[0];
}

export async function toggleInsightField(id: string): Promise<InsightField> {
  const result = await query<InsightField>(
    `UPDATE insight_fields
     SET is_active = NOT is_active
     WHERE id = $1
     RETURNING id, field_key AS "fieldKey", field_label AS "fieldLabel", field_description AS "fieldDescription", is_active AS "isActive", created_at AS "createdAt"`,
    [id],
  );

  if (result.rowCount === 0) {
    throw new Error('Insight field not found');
  }

  return result.rows[0];
}
