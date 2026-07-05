import { query } from '../../db/postgres/client';
import { getExcludedPhoneSet } from '../block.service';
import { normalizePhone } from '../phone';

const RESULT_LIMIT = 20;
const SEARCH_TIMEOUT_MS = 10_000;

interface InsightHit {
  name: string | null;
  matched: string[];
  info: Record<string, unknown> | null;
  contact_id: string;
}

/**
 * Concept/fact search across everything saved about a contact:
 *   1. contact_facts — the facts the user saved (employer, occupation,
 *      industry, city) plus crowd-confirmed public facts on their own
 *      contacts. This is where "who invests", "who is a lawyer" actually live.
 *   2. contact_insights — AI enrichment data.
 * Results from both sources are merged by phone so one person appears once.
 */
async function searchFacts(
  userId: string,
  term: string,
): Promise<{ phone: string; name: string | null; matched: string[] }[]> {
  const result = await query<{ phone: string; name: string | null; matched: string[] }>(
    `SELECT cf.neo4j_contact_id AS phone,
            COALESCE(MAX(ua.alias), MAX(u.name)) AS name,
            array_agg(DISTINCT cf.field_type || ': ' || COALESCE(cf.canonical_value, cf.value))
              AS matched
     FROM contact_facts cf
     LEFT JOIN "UserAlias" ua ON ua.phone = cf.neo4j_contact_id AND ua."contactId" = $1
     LEFT JOIN "UserPhone" up ON up.phone = cf.neo4j_contact_id
     LEFT JOIN "User"      u  ON u.id     = up."userId"
     WHERE (
             cf.submitted_by_user_id = $1
             OR (cf.is_public = true
                 AND EXISTS (SELECT 1 FROM "UserAlias" ua2
                             WHERE ua2."contactId" = $1 AND ua2.phone = cf.neo4j_contact_id))
           )
       AND LOWER(COALESCE(cf.canonical_value, cf.value)) LIKE $2
     GROUP BY cf.neo4j_contact_id
     LIMIT $3`,
    [userId, term, RESULT_LIMIT],
    SEARCH_TIMEOUT_MS,
  );
  return result.rows;
}

async function searchInsights(
  term: string,
): Promise<{ neo4j_contact_id: string; neo4j_contact_name: string | null; data: Record<string, unknown> }[]> {
  const result = await query<{
    neo4j_contact_id: string;
    neo4j_contact_name: string | null;
    data: Record<string, unknown>;
  }>(
    `SELECT neo4j_contact_id, neo4j_contact_name, data
     FROM contact_insights
     WHERE LOWER(neo4j_contact_name) LIKE $1 OR LOWER(data::text) LIKE $1
     ORDER BY updated_at DESC
     LIMIT $2`,
    [term, RESULT_LIMIT],
    SEARCH_TIMEOUT_MS,
  );
  return result.rows;
}

export async function searchByInsight(userId: string, searchQuery: string): Promise<object> {
  try {
    const term = '%' + searchQuery.toLowerCase() + '%';

    // The two sources run independently: the contact_insights scan
    // (LOWER(data::text) LIKE over the whole table) can time out on a large
    // prod dataset, and that must NOT take down the facts channel — the primary
    // one for concept/memory search. allSettled isolates each failure.
    const [factSettled, insightSettled, excluded] = await Promise.all([
      Promise.allSettled([searchFacts(userId, term)]).then((r) => r[0]),
      Promise.allSettled([searchInsights(term)]).then((r) => r[0]),
      getExcludedPhoneSet(userId),
    ]);

    const factRows = factSettled.status === 'fulfilled' ? factSettled.value : [];
    const insightRows = insightSettled.status === 'fulfilled' ? insightSettled.value : [];
    if (factSettled.status === 'rejected') {
      console.error('searchByInsight facts query failed:', (factSettled.reason as Error).message);
    }
    if (insightSettled.status === 'rejected') {
      console.error(
        'searchByInsight insights query failed:',
        (insightSettled.reason as Error).message,
      );
    }

    // Merge by normalized phone; facts win on name, insights fill the info blob.
    const byPhone = new Map<string, InsightHit>();
    for (const row of factRows) {
      if (excluded.has(normalizePhone(row.phone))) continue;
      byPhone.set(normalizePhone(row.phone), {
        name: row.name ?? null,
        matched: (row.matched ?? []).filter(Boolean),
        info: null,
        contact_id: row.phone,
      });
    }
    for (const row of insightRows) {
      const key = normalizePhone(row.neo4j_contact_id);
      if (excluded.has(key)) continue;
      const existing = byPhone.get(key);
      if (existing) {
        existing.info = row.data;
        existing.name = existing.name ?? row.neo4j_contact_name ?? null;
      } else {
        byPhone.set(key, {
          name: row.neo4j_contact_name ?? null,
          matched: [],
          info: row.data,
          contact_id: row.neo4j_contact_id,
        });
      }
    }

    const results = [...byPhone.values()];
    if (results.length === 0) return { found: false, query: searchQuery };

    return { found: true, count: results.length, results };
  } catch (err) {
    console.error('searchByInsight error:', (err as Error).message);
    return { found: false, error: (err as Error).message };
  }
}
