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

    const result = await query<{ phone: string; all_tags: string[] }>(
      `SELECT ut.phone, array_agg(DISTINCT ut.tag) AS all_tags
       FROM "UserTags" ut
       WHERE ut.phone = ANY($1)
         AND LOWER(ut.tag) LIKE $2
       GROUP BY ut.phone
       ORDER BY MAX(ut."weightCount") DESC
       LIMIT 20`,
      [phones, searchTerm],
    );

    const q = tagQuery.toLowerCase();
    const neo4jMatches = Array.from(contactMap.entries())
      .filter(
        ([, info]) =>
          info.name?.toLowerCase().includes(q) ||
          info.employer?.toLowerCase().includes(q) ||
          info.jobPosition?.toLowerCase().includes(q),
      )
      .map(([phone]) => phone);

    const tagPhones = new Set(result.rows.map((r) => r.phone));
    const allMatchPhones = Array.from(new Set([...tagPhones, ...neo4jMatches]));

    if (allMatchPhones.length === 0) {
      return { found: false, query: tagQuery };
    }

    const tagsMap = new Map(result.rows.map((r) => [r.phone, (r.all_tags || []).filter(Boolean)]));

    return {
      found: true,
      count: allMatchPhones.length,
      results: allMatchPhones.slice(0, 20).map((phone) => {
        const neo4j = contactMap.get(phone);
        return {
          name: neo4j?.name ?? null,
          tags: tagsMap.get(phone) ?? [],
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
