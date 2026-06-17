import { query } from '../../db/postgres/client';
import { getUserContactMap } from './getUserContactMap';

export async function searchContactByName(userId: string, nameQuery: string): Promise<object> {
  try {
    const contactMap = await getUserContactMap(userId);

    if (contactMap.size === 0) {
      return { found: false, query: nameQuery };
    }

    const q = nameQuery.toLowerCase();

    const neo4jMatches = Array.from(contactMap.entries())
      .filter(([, info]) => info.name?.toLowerCase().includes(q))
      .map(([phone]) => phone);

    const phones = Array.from(contactMap.keys());
    const searchTerm = '%' + q + '%';

    const pgResult = await query<{
      phone: string;
      all_tags: string[];
      registered_name: string | null;
    }>(
      `SELECT
         up.phone,
         array_agg(DISTINCT ut.tag) AS all_tags,
         MAX(u.name)                AS registered_name
       FROM "UserPhone" up
       LEFT JOIN "UserTags" ut ON ut.phone  = up.phone
       LEFT JOIN "User"     u  ON u.id      = up."userId"
       WHERE up.phone = ANY($1)
         AND LOWER(u.name) LIKE $2
       GROUP BY up.phone`,
      [phones, searchTerm],
    );

    const pgPhones = pgResult.rows.map((r) => r.phone);
    const allMatchPhones = Array.from(new Set([...neo4jMatches, ...pgPhones]));

    if (allMatchPhones.length === 0) {
      return { found: false, query: nameQuery };
    }

    const tagsResult = await query<{ phone: string; all_tags: string[] }>(
      `SELECT phone, array_agg(DISTINCT tag) AS all_tags
       FROM "UserTags"
       WHERE phone = ANY($1)
       GROUP BY phone`,
      [allMatchPhones],
    );

    const tagsMap = new Map(tagsResult.rows.map((r) => [r.phone, r.all_tags.filter(Boolean)]));
    const pgMap = new Map(pgResult.rows.map((r) => [r.phone, r.registered_name]));

    return {
      found: true,
      count: allMatchPhones.length,
      results: allMatchPhones.slice(0, 20).map((phone) => {
        const neo4j = contactMap.get(phone);
        return {
          name: neo4j?.name ?? pgMap.get(phone) ?? null,
          tags: tagsMap.get(phone) ?? [],
          employer: neo4j?.employer ?? null,
          jobPosition: neo4j?.jobPosition ?? null,
          city: neo4j?.city ?? null,
        };
      }),
    };
  } catch (err) {
    console.error('searchContactByName error:', (err as Error).message);
    return { found: false, error: (err as Error).message };
  }
}
