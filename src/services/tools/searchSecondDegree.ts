import { query } from '../../db/postgres/client';
import { buildSearchTerms } from './transliterate';

export async function searchSecondDegree(userId: string, tagQuery: string): Promise<object> {
  try {
    const terms = buildSearchTerms(tagQuery);
    const searchTerms = terms.map((t) => '%' + t + '%');

    // $1 = userId, $2...$N = search terms (same terms used for alias and tag conditions)
    const aliasCondition = searchTerms
      .map((_, i) => `LOWER(ua2.alias) LIKE $${i + 2}`)
      .join(' OR ');
    const tagCondition = searchTerms
      .map((_, i) => `LOWER(ut.tag) LIKE $${i + 2}`)
      .join(' OR ');

    const result = await query<{
      phone: string;
      name: string | null;
      via_name: string | null;
      employer: string | null;
      jobPosition: string | null;
      all_tags: string[];
    }>(
      `SELECT DISTINCT ON (ua2.phone)
              ua2.phone                              AS phone,
              COALESCE(ua2.alias, u2.name)           AS name,
              COALESCE(ua_via.alias, u_via.name)     AS via_name,
              u2.employer                            AS employer,
              u2."jobPosition"                       AS "jobPosition",
              COALESCE(
                (SELECT array_agg(DISTINCT ut2.tag)
                 FROM "UserTags" ut2
                 WHERE ut2.phone = ua2.phone AND ut2."contactId" = up_via."userId"),
                ARRAY[]::text[]
              )                                      AS all_tags
       FROM "UserAlias" ua_via
       JOIN "UserPhone" up_via ON up_via.phone = ua_via.phone
       JOIN "UserAlias" ua2    ON ua2."contactId" = up_via."userId"
       LEFT JOIN "UserPhone" up2  ON up2.phone  = ua2.phone
       LEFT JOIN "User"      u2   ON u2.id      = up2."userId"
       LEFT JOIN "User"      u_via ON u_via.id  = up_via."userId"
       WHERE ua_via."contactId" = $1
         AND ua2.phone NOT IN (
           SELECT phone FROM "UserAlias" WHERE "contactId" = $1
         )
         AND (
           (${aliasCondition})
           OR EXISTS (
             SELECT 1 FROM "UserTags" ut
             WHERE ut.phone      = ua2.phone
               AND ut."contactId" = up_via."userId"
               AND (${tagCondition})
           )
         )
       ORDER BY ua2.phone, ua_via.alias
       LIMIT 20`,
      [userId, ...searchTerms],
    );

    if (result.rows.length === 0) {
      return { found: false, reason: 'no_matches' };
    }

    return {
      found: true,
      count: result.rows.length,
      results: result.rows.map((row) => ({
        name: row.name ?? null,
        employer: row.employer ?? null,
        jobPosition: row.jobPosition ?? null,
        tags: (row.all_tags || []).filter(Boolean),
        via: row.via_name ?? null,
      })),
    };
  } catch (err) {
    console.error('searchSecondDegree error:', (err as Error).message);
    return { found: false, error: (err as Error).message };
  }
}
