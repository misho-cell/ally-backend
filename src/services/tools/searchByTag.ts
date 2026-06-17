import { query } from '../../db/postgres/client';

export async function searchByTag(userId: string, tagQuery: string): Promise<object> {
  try {
    const searchTerm = '%' + tagQuery.toLowerCase() + '%';

    const result = await query<{
      phone: string;
      name: string | null;
      all_tags: string[];
      employer: string | null;
      jobPosition: string | null;
      city: string | null;
    }>(
      `SELECT ut.phone,
              COALESCE(MAX(ua.alias), MAX(u.name)) AS name,
              array_agg(DISTINCT ut.tag)            AS all_tags,
              MAX(u.employer)                       AS employer,
              MAX(u."jobPosition")                  AS "jobPosition",
              MAX(u.city)                           AS city
       FROM "UserTags" ut
       LEFT JOIN "UserAlias" ua ON ua.phone = ut.phone AND ua."userId" = ut."userId"
       LEFT JOIN "UserPhone" up ON up.phone  = ut.phone
       LEFT JOIN "User"      u  ON u.id      = up."userId"
       WHERE ut."userId" = $1
         AND LOWER(ut.tag) LIKE $2
       GROUP BY ut.phone
       ORDER BY MAX(ut."weightCount") DESC
       LIMIT 20`,
      [userId, searchTerm],
    );

    if (result.rows.length === 0) {
      return { found: false, query: tagQuery };
    }

    return {
      found: true,
      count: result.rows.length,
      results: result.rows.map((row) => ({
        name: row.name ?? null,
        tags: (row.all_tags || []).filter(Boolean),
        employer: row.employer ?? null,
        jobPosition: row.jobPosition ?? null,
        city: row.city ?? null,
      })),
    };
  } catch (err) {
    console.error('searchByTag error:', (err as Error).message);
    return { found: false, error: (err as Error).message };
  }
}
