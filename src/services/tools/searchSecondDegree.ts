import pool, { query } from '../../db/postgres/client';

const SECOND_DEGREE_QUERY_TIMEOUT_MS = 30_000;
import { getSession } from '../../db/neo4j/client';
import { buildSearchTerms } from './transliterate';

const MAX_FRIEND_PHONES = 300;

export async function searchSecondDegree(userId: string, tagQuery: string): Promise<object> {
  try {
    const phoneResult = await pool.query<{ phone: string }>(
      'SELECT phone FROM "UserPhone" WHERE "userId" = $1 LIMIT 1',
      [userId],
    );
    if (phoneResult.rows.length === 0) return { found: false, reason: 'user_phone_not_found' };
    const userPhone = phoneResult.rows[0].phone;

    // Step 1: get direct contact phones from Neo4j (capped to avoid large payloads)
    const session = getSession();
    let friendPhones: string[] = [];
    try {
      const neo4jResult = await session.run(
        `MATCH (me:AllyNode {phoneKey: $userPhone})-[:CONTACT]->(friend:AllyNode)
         RETURN DISTINCT friend.phoneKey AS phoneKey
         LIMIT ${MAX_FRIEND_PHONES}`,
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

    // Step 2: search friends' contacts in PostgreSQL — filter first, join last
    const terms = buildSearchTerms(tagQuery);
    const searchTerms = terms.map((t) => '%' + t + '%');
    const tagConds = searchTerms.map((_, i) => `LOWER(ut.tag) LIKE $${i + 3}`).join(' OR ');
    const aliasConds = searchTerms.map((_, i) => `LOWER(ua_m.alias) LIKE $${i + 3}`).join(' OR ');

    const result = await query<{
      phone: string;
      name: string | null;
      via_name: string | null;
      employer: string | null;
      jobPosition: string | null;
    }>(
      `WITH friend_users AS (
         SELECT up."userId", up.phone AS via_phone
         FROM "UserPhone" up
         WHERE up.phone = ANY($2)
       ),
       tag_hits AS (
         SELECT ut.phone, ut."contactId"
         FROM "UserTags" ut
         JOIN friend_users fu ON fu."userId" = ut."contactId"
         WHERE ${tagConds}
       ),
       alias_hits AS (
         SELECT ua_m.phone, ua_m."contactId"
         FROM "UserAlias" ua_m
         JOIN friend_users fu ON fu."userId" = ua_m."contactId"
         WHERE ${aliasConds}
       ),
       matches AS (
         SELECT phone, "contactId" FROM tag_hits
         UNION
         SELECT phone, "contactId" FROM alias_hits
       )
       SELECT DISTINCT ON (m.phone)
              m.phone,
              COALESCE(ua_t.alias, u_t.name)          AS name,
              COALESCE(ua_via.alias, u_via.name)       AS via_name,
              u_t.employer                             AS employer,
              u_t."jobPosition"                        AS "jobPosition"
       FROM matches m
       JOIN friend_users fu        ON fu."userId" = m."contactId"
       LEFT JOIN "UserAlias" ua_t  ON ua_t.phone = m.phone  AND ua_t."contactId" = m."contactId"
       LEFT JOIN "UserPhone"  up_t ON up_t.phone = m.phone
       LEFT JOIN "User"       u_t  ON u_t.id     = up_t."userId"
       LEFT JOIN "UserAlias" ua_via ON ua_via.phone = fu.via_phone AND ua_via."contactId" = $1
       LEFT JOIN "User"      u_via  ON u_via.id    = fu."userId"
       LEFT JOIN "UserAlias" ua_own ON ua_own.phone = m.phone AND ua_own."contactId" = $1
       WHERE ua_own.phone IS NULL
       ORDER BY m.phone
       LIMIT 20`,
      [userId, friendPhones, ...searchTerms],
      SECOND_DEGREE_QUERY_TIMEOUT_MS,
    );

    if (result.rows.length === 0) return { found: false, reason: 'no_matches' };

    return {
      found: true,
      count: result.rows.length,
      results: result.rows.map((row) => ({
        name: row.name ?? null,
        employer: row.employer ?? null,
        jobPosition: row.jobPosition ?? null,
        tags: [],
        via: row.via_name ?? null,
      })),
    };
  } catch (err) {
    console.error('searchSecondDegree error:', (err as Error).message);
    return { found: false, error: (err as Error).message };
  }
}
