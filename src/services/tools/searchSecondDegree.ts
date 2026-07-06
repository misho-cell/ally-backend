import { query } from '../../db/postgres/client';

const SECOND_DEGREE_QUERY_TIMEOUT_MS = 10_000;
import { getSession } from '../../db/neo4j/client';
import { getCompositeKeyForUser } from '../../services/neo4j.keys';
import { buildSearchTerms } from './transliterate';
import { getExcludedPhones } from '../block.service';
import { normalizePhone } from '../phone';

const MAX_FRIEND_PHONES = 3000;
// Same threshold as the direct tag search; matching runs only over friends'
// tags (already narrowed by the friend_users join), so no dedicated index is
// needed for it to stay fast.
const FUZZY_THRESHOLD = 0.45;

export async function searchSecondDegree(userId: string, tagQuery: string): Promise<object> {
  try {
    let userKey: string;
    try {
      userKey = await getCompositeKeyForUser(Number(userId));
    } catch {
      return { found: false, reason: 'user_phone_not_found' };
    }

    // Step 1: get direct contact keys from Neo4j (capped to avoid large payloads).
    // Use indexed lookup: try composite key first, then fall back to individual phones
    // for legacy nodes that haven't been migrated yet (before neo4j_backfill runs).
    const userPhones = userKey.split('-');
    const session = getSession();
    let friendKeys: string[] = [];
    try {
      const neo4jResult = await session.run(
        `MATCH (me:AllyNode {phoneKey: $userKey})-[:CONTACT]->(friend:AllyNode)
         RETURN DISTINCT friend.phoneKey AS phoneKey
         LIMIT ${MAX_FRIEND_PHONES}`,
        { userKey },
        { timeout: 8000 },
      );
      friendKeys = neo4jResult.records
        .map((r) => r.get('phoneKey') as string | null)
        .filter((p): p is string => p !== null);

      // Fallback: if composite key node has no contacts, try each individual phone key.
      // Old nodes use a single phone as the key instead of the composite format.
      if (friendKeys.length === 0 && userPhones.length > 1) {
        const fallback = await session.run(
          `UNWIND $userPhones AS phone
           MATCH (me:AllyNode {phoneKey: phone})-[:CONTACT]->(friend:AllyNode)
           RETURN DISTINCT friend.phoneKey AS phoneKey
           LIMIT ${MAX_FRIEND_PHONES}`,
          { userPhones },
          { timeout: 8000 },
        );
        friendKeys = fallback.records
          .map((r) => r.get('phoneKey') as string | null)
          .filter((p): p is string => p !== null);
      }
    } catch (neo4jErr) {
      console.error('searchSecondDegree neo4j error:', (neo4jErr as Error).message);
      return { found: false, reason: 'neo4j_unavailable' };
    } finally {
      await session.close();
    }

    if (friendKeys.length === 0) return { found: false, reason: 'no_contacts_in_graph' };

    const blockedPhones = await getExcludedPhones(userId);
    const blockedSet = new Set(blockedPhones.map(normalizePhone));
    const isExcluded = (phone: string): boolean => blockedSet.has(normalizePhone(phone));

    // Composite keys (e.g. "+99551111-+99599999") must be expanded to individual phones
    // before matching against UserPhone which stores one row per phone.
    // Blocked phones are removed here to exclude them as intermediaries (via).
    const friendPhones = [...new Set(friendKeys.flatMap((k) => k.split('-')))].filter(
      (p) => !isExcluded(p),
    );

    if (friendPhones.length === 0) return { found: false, reason: 'no_contacts_in_graph' };

    // Step 2: search friends' contacts in PostgreSQL — filter first, join last
    const terms = buildSearchTerms(tagQuery);
    // Tags are single words — use exact match (= ANY) so indexes are usable
    const exactTerms = terms.map((t) => t.toLowerCase());
    // Aliases are full names — need substring LIKE
    const likeTerms = terms.map((t) => '%' + t + '%');

    // $3 = exact terms array, $4..$N = LIKE patterns for aliases, $(N+1) = blocked phones
    const aliasConds = likeTerms.map((_, i) => `LOWER(ua_m.alias) LIKE $${i + 4}`).join(' OR ');
    const blockParamIdx = likeTerms.length + 4;

    const result = await query<{
      phone: string;
      target_user_id: number | null;
      name: string | null;
      via_names: string[] | null;
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
         WHERE normalize_search_token(ut.tag)
                 = ANY(ARRAY(SELECT normalize_search_token(t) FROM unnest($3::text[]) AS t))
            OR EXISTS (
                 SELECT 1 FROM unnest($3::text[]) AS t
                 WHERE similarity(normalize_search_token(ut.tag), normalize_search_token(t))
                       > ${FUZZY_THRESHOLD}
               )
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
       SELECT m.phone,
              MAX(up_t."userId")                                               AS target_user_id,
              COALESCE(MAX(u_t.name), MAX(ua_t.alias))                        AS name,
              array_agg(DISTINCT COALESCE(ua_via.alias, u_via.name))
                FILTER (WHERE COALESCE(ua_via.alias, u_via.name) IS NOT NULL) AS via_names,
              MAX(u_t.employer)                                                AS employer,
              MAX(u_t."jobPosition")                                           AS "jobPosition"
       FROM matches m
       JOIN friend_users fu         ON fu."userId" = m."contactId"
       LEFT JOIN "UserAlias" ua_t   ON ua_t.phone  = m.phone AND ua_t."contactId" = m."contactId"
       LEFT JOIN "UserPhone"  up_t  ON up_t.phone  = m.phone
       LEFT JOIN "User"       u_t   ON u_t.id      = up_t."userId"
       LEFT JOIN "UserAlias" ua_via ON ua_via.phone = fu.via_phone AND ua_via."contactId" = $1
       LEFT JOIN "User"      u_via  ON u_via.id     = fu."userId"
       LEFT JOIN "UserAlias" ua_own ON ua_own.phone = m.phone AND ua_own."contactId" = $1
       WHERE ua_own.phone IS NULL
         AND m.phone != ALL($${blockParamIdx})
       GROUP BY m.phone
       LIMIT 20`,
      [userId, friendPhones, exactTerms, ...likeTerms, blockedPhones],
      SECOND_DEGREE_QUERY_TIMEOUT_MS,
    );

    const rows = result.rows.filter((r) => !isExcluded(r.phone));
    if (rows.length === 0) return { found: false, reason: 'no_matches' };

    return {
      found: true,
      count: rows.length,
      results: rows.map((row) => ({
        phone: row.phone,
        name: row.name ?? null,
        employer: row.employer ?? null,
        jobPosition: row.jobPosition ?? null,
        via: row.via_names ?? [],
        // Internal identifiers for agent use — never displayed to the user.
        // target_user_id is set when the person is a registered Ally user;
        // target_phone is set when they are not (unregistered contact).
        ...(row.target_user_id != null
          ? { target_user_id: row.target_user_id }
          : { target_phone: row.phone }),
      })),
    };
  } catch (err) {
    console.error('searchSecondDegree error:', (err as Error).message);
    return { found: false, error: (err as Error).message };
  }
}
