import { query } from '../../db/postgres/client';

export async function searchContactByName(nameQuery: string): Promise<object> {
  try {
    const searchTerm = '%' + nameQuery.toLowerCase() + '%';

    const result = await query<{
      phone: string;
      all_aliases: string[];
      all_tags: string[];
      registered_name: string | null;
      city: string | null;
      jobPosition: string | null;
      employer: string | null;
    }>(
      `SELECT
         ua.phone,
         array_agg(DISTINCT ua.alias)  AS all_aliases,
         array_agg(DISTINCT ut.tag)    AS all_tags,
         MAX(u.name)                   AS registered_name,
         MAX(u.city)                   AS city,
         MAX(u."jobPosition")          AS "jobPosition",
         MAX(u.employer)               AS employer
       FROM "UserAlias" ua
       LEFT JOIN "UserTags"  ut ON ut.phone  = ua.phone
       LEFT JOIN "UserPhone" up ON up.phone  = ua.phone
       LEFT JOIN "User"      u  ON u.id      = up."userId"
       WHERE LOWER(ua.alias) LIKE $1
          OR LOWER(u.name)   LIKE $1
       GROUP BY ua.phone
       ORDER BY COUNT(DISTINCT ua.alias) DESC
       LIMIT 20`,
      [searchTerm],
    );

    if (result.rows.length === 0) {
      return { found: false, query: nameQuery };
    }

    return {
      found: true,
      count: result.rows.length,
      results: result.rows.map((row) => {
        const cleanAliases = (row.all_aliases || []).filter(Boolean);
        const cleanTags = (row.all_tags || []).filter(Boolean);
        const bestName = row.registered_name ?? cleanAliases[0] ?? null;
        return {
          name: bestName,
          aliases: cleanAliases,
          tags: cleanTags,
          city: row.city ?? null,
          jobPosition: row.jobPosition ?? null,
          employer: row.employer ?? null,
        };
      }),
    };
  } catch (err) {
    console.error('searchContactByName error:', (err as Error).message);
    return { found: false, error: (err as Error).message };
  }
}
