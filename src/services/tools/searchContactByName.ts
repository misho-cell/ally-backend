import { query } from '../../db/postgres/client';
import { buildSearchTerms } from './transliterate';
import { getExcludedPhones } from '../block.service';

const FUZZY_THRESHOLD = 0.35;

export async function searchContactByName(userId: string, nameQuery: string): Promise<object> {
  try {
    const blockedPhones = await getExcludedPhones(userId);
    const terms = buildSearchTerms(nameQuery).map((t) => '%' + t + '%');
    const nameCondition = terms
      .map((_, i) => `LOWER(ua.alias) LIKE $${i + 2} OR LOWER(u.name) LIKE $${i + 2}`)
      .join(' OR ');
    const blockParamIdx = terms.length + 2;

    const result = await query<{
      phone: string;
      name: string | null;
      all_tags: string[];
      employer: string | null;
      jobPosition: string | null;
      city: string | null;
    }>(
      `SELECT ua.phone,
              COALESCE(MAX(ua.alias), MAX(u.name)) AS name,
              array_agg(DISTINCT ut.tag)            AS all_tags,
              MAX(u.employer)                       AS employer,
              MAX(u."jobPosition")                  AS "jobPosition",
              MAX(u.city)                           AS city
       FROM "UserAlias" ua
       LEFT JOIN "UserTags"  ut ON ut.phone = ua.phone AND ut."contactId" = ua."contactId"
       LEFT JOIN "UserPhone" up ON up.phone  = ua.phone
       LEFT JOIN "User"      u  ON u.id      = up."userId"
       WHERE ua."contactId" = $1
         AND (${nameCondition})
         AND ua.phone != ALL($${blockParamIdx})
       GROUP BY ua.phone
       ORDER BY MAX(ua.alias)
       LIMIT 20`,
      [userId, ...terms, blockedPhones],
    );

    if (result.rows.length === 0) {
      // Fallback: fuzzy similarity search via pg_trgm (catches typos like livingston/livingstone)
      try {
        const fuzzyTerms = buildSearchTerms(nameQuery).map((t) => t.toLowerCase());
        const fuzzyConds = fuzzyTerms
          .map(
            (_, i) =>
              `word_similarity($${i + 2}, LOWER(ua.alias)) > ${FUZZY_THRESHOLD} OR word_similarity($${i + 2}, LOWER(u.name)) > ${FUZZY_THRESHOLD}`,
          )
          .join(' OR ');
        const fuzzyBlockParamIdx = fuzzyTerms.length + 2;

        const fuzzyResult = await query<{
          phone: string;
          name: string | null;
          all_tags: string[];
          employer: string | null;
          jobPosition: string | null;
          city: string | null;
        }>(
          `SELECT ua.phone,
                  COALESCE(MAX(ua.alias), MAX(u.name)) AS name,
                  array_agg(DISTINCT ut.tag)            AS all_tags,
                  MAX(u.employer)                       AS employer,
                  MAX(u."jobPosition")                  AS "jobPosition",
                  MAX(u.city)                           AS city
           FROM "UserAlias" ua
           LEFT JOIN "UserTags"  ut ON ut.phone = ua.phone AND ut."contactId" = ua."contactId"
           LEFT JOIN "UserPhone" up ON up.phone  = ua.phone
           LEFT JOIN "User"      u  ON u.id      = up."userId"
           WHERE ua."contactId" = $1
             AND (${fuzzyConds})
             AND ua.phone != ALL($${fuzzyBlockParamIdx})
           GROUP BY ua.phone
           ORDER BY MAX(ua.alias)
           LIMIT 20`,
          [userId, ...fuzzyTerms, blockedPhones],
        );

        if (fuzzyResult.rows.length > 0) {
          return {
            found: true,
            count: fuzzyResult.rows.length,
            fuzzy: true,
            results: fuzzyResult.rows.map((row) => ({
              phone: row.phone,
              name: row.name ?? null,
              tags: (row.all_tags || []).filter(Boolean),
              employer: row.employer ?? null,
              jobPosition: row.jobPosition ?? null,
              city: row.city ?? null,
            })),
          };
        }
      } catch {
        // pg_trgm not available — skip fuzzy fallback
      }
      return { found: false, query: nameQuery };
    }

    return {
      found: true,
      count: result.rows.length,
      results: result.rows.map((row) => ({
        phone: row.phone,
        name: row.name ?? null,
        tags: (row.all_tags || []).filter(Boolean),
        employer: row.employer ?? null,
        jobPosition: row.jobPosition ?? null,
        city: row.city ?? null,
      })),
    };
  } catch (err) {
    console.error('searchContactByName error:', (err as Error).message);
    return { found: false, error: (err as Error).message };
  }
}
