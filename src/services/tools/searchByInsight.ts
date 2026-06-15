import { query } from '../../db/postgres/client';

export async function searchByInsight(searchQuery: string): Promise<object> {
  try {
    const searchTerm = '%' + searchQuery.toLowerCase() + '%';

    const result = await query<{
      neo4j_contact_id: string;
      neo4j_contact_name: string | null;
      data: Record<string, unknown>;
    }>(
      `SELECT
         neo4j_contact_id,
         neo4j_contact_name,
         data
       FROM contact_insights
       WHERE LOWER(neo4j_contact_name) LIKE $1
          OR LOWER(data::text)         LIKE $1
       ORDER BY updated_at DESC
       LIMIT 10`,
      [searchTerm]
    );

    if (result.rows.length === 0) {
      return { found: false, query: searchQuery };
    }

    return {
      found: true,
      count: result.rows.length,
      results: result.rows.map(row => ({
        name: row.neo4j_contact_name ?? null,
        info: row.data,
      })),
    };
  } catch (err) {
    console.error('searchByInsight error:', (err as Error).message);
    return { found: false, error: (err as Error).message };
  }
}
