import { query } from '../../db/postgres/client';
import { getUserContactMap } from './getUserContactMap';

export async function searchByTag(userId: string, tagQuery: string): Promise<object> {
  try {
    const contactMap = await getUserContactMap(userId);

    if (contactMap.size === 0) {
      return { found: false, query: tagQuery };
    }

    const phones = Array.from(contactMap.keys());
    const searchTerm = '%' + tagQuery.toLowerCase() + '%';

    const result = await query<{
      phone: string;
      all_tags: string[];
      registered_name: string | null;
    }>(
      `SELECT
         ut.phone,
         array_agg(DISTINCT ut.tag) AS all_tags,
         MAX(u.name)                AS registered_name
       FROM "UserTags" ut
       LEFT JOIN "UserPhone" up ON up.phone  = ut.phone
       LEFT JOIN "User"      u  ON u.id      = up."userId"
       WHERE ut.phone = ANY($1)
         AND LOWER(ut.tag) LIKE $2
       GROUP BY ut.phone
       ORDER BY MAX(ut."weightCount") DESC
       LIMIT 20`,
      [phones, searchTerm],
    );

    if (result.rows.length === 0) {
      return { found: false, query: tagQuery };
    }

    return {
      found: true,
      count: result.rows.length,
      results: result.rows.map((row) => {
        const neo4j = contactMap.get(row.phone);
        const cleanTags = (row.all_tags || []).filter(Boolean);
        return {
          name: neo4j?.name ?? row.registered_name ?? null,
          tags: cleanTags,
          employer: neo4j?.employer ?? null,
          jobPosition: neo4j?.jobPosition ?? null,
          city: neo4j?.city ?? null,
        };
      }),
    };
  } catch (err) {
    console.error('searchByTag error:', (err as Error).message);
    return { found: false, error: (err as Error).message };
  }
}
