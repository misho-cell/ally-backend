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

export async function getContactInsight(
  userId: string,
  neo4jContactId: string,
): Promise<ContactInsight | null> {
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

  return result.rows[0];
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
