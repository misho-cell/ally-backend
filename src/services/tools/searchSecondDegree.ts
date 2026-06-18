import pool, { query } from '../../db/postgres/client';
import { getSession } from '../../db/neo4j/client';
import { buildSearchTerms } from './transliterate';

export async function searchSecondDegree(userId: string, tagQuery: string): Promise<object> {
  try {
    const phoneResult = await pool.query<{ phone: string }>(
      'SELECT phone FROM "UserPhone" WHERE "userId" = $1 LIMIT 1',
      [userId],
    );
    if (phoneResult.rows.length === 0) return { found: false, reason: 'user_phone_not_found' };
    const userPhone = phoneResult.rows[0].phone;

    // Get direct contact phones from Neo4j graph
    const session = getSession();
    let friendPhones: string[] = [];
    try {
      const neo4jResult = await session.run(
        `MATCH (me:AllyNode {phoneKey: $userPhone})-[:CONTACT]->(friend:AllyNode)
         RETURN DISTINCT friend.phoneKey AS phoneKey`,
        { userPhone },
        { timeout: 8000 },
      );
      friendPhones = neo4jResult.records
        .map((r) => r.get('phoneKey') as string | null)
        .filter((p): p is string => p !== null);
    } finally {
      await session.close();
    }

    if (friendPhones.length === 0) return { found: false, reason: 'no_contacts_in_graph' };

    // Search PostgreSQL contacts of those friends by tag/alias
    const terms = buildSearchTerms(tagQuery);
    const searchTerms = terms.map((t) => '%' + t + '%');
    const aliasCondition = searchTerms
      .map((_, i) => `LOWER(ua2.alias) LIKE $${i + 3}`)
      .join(' OR ');
    const tagCondition = searchTerms
      .map((_, i) => `LOWER(ut.tag) LIKE $${i + 3}`)
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
              ua2.phone                                     AS phone,
              COALESCE(ua2.alias, u2.name)                  AS name,
              COALESCE(ua_misho.alias, u_via.name)          AS via_name,
              u2.employer                                   AS employer,
              u2."jobPosition"                              AS "jobPosition",
              COALESCE(
                (SELECT array_agg(DISTINCT ut2.tag)
                 FROM "UserTags" ut2
                 WHERE ut2.phone = ua2.phone AND ut2."contactId" = up_via."userId"),
                ARRAY[]::text[]
              )                                             AS all_tags
       FROM "UserPhone" up_via
       JOIN "UserAlias" ua2
         ON ua2."contactId" = up_via."userId"
       LEFT JOIN "UserAlias" ua_misho
         ON ua_misho.phone = up_via.phone AND ua_misho."contactId" = $1
       LEFT JOIN "User" u_via
         ON u_via.id = up_via."userId"
       LEFT JOIN "UserPhone" up2
         ON up2.phone = ua2.phone
       LEFT JOIN "User" u2
         ON u2.id = up2."userId"
       WHERE up_via.phone = ANY($2)
         AND ua2.phone NOT IN (
           SELECT phone FROM "UserAlias" WHERE "contactId" = $1
         )
         AND (
           (${aliasCondition})
           OR EXISTS (
             SELECT 1 FROM "UserTags" ut
             WHERE ut.phone       = ua2.phone
               AND ut."contactId" = up_via."userId"
               AND (${tagCondition})
           )
         )
       ORDER BY ua2.phone, up_via."userId"
       LIMIT 20`,
      [userId, friendPhones, ...searchTerms],
    );

    if (result.rows.length === 0) return { found: false, reason: 'no_matches' };

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
