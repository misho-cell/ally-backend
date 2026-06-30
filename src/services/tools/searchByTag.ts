import { query } from '../../db/postgres/client';
import { buildSearchTerms } from './transliterate';
import { getExcludedPhones } from '../block.service';
import { normalizePhone } from '../phone';

const FUZZY_THRESHOLD = 0.35;

export async function searchByTag(userId: string, tagQuery: string): Promise<object> {
  try {
    const blockedPhones = await getExcludedPhones(userId);
    const excludedSet = new Set(blockedPhones.map(normalizePhone));
    const isExcluded = (phone: string): boolean => excludedSet.has(normalizePhone(phone));
    const terms = buildSearchTerms(tagQuery).map((t) => '%' + t + '%');
    const tagCondition = terms.map((_, i) => `LOWER(ut.tag) LIKE $${i + 2}`).join(' OR ');
    const blockParamIdx = terms.length + 2;

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
       LEFT JOIN "UserAlias" ua ON ua.phone = ut.phone AND ua."contactId" = ut."contactId"
       LEFT JOIN "UserPhone" up ON up.phone  = ut.phone
       LEFT JOIN "User"      u  ON u.id      = up."userId"
       WHERE ut."contactId" = $1
         AND (${tagCondition})
         AND ut.phone != ALL($${blockParamIdx})
       GROUP BY ut.phone
       ORDER BY MAX(ut."weightCount") DESC
       LIMIT 20`,
      [userId, ...terms, blockedPhones],
    );

    const rows = result.rows.filter((r) => !isExcluded(r.phone));

    if (rows.length === 0) {
      // Fallback: fuzzy similarity search via pg_trgm (catches typos and transliteration variants)
      try {
        const fuzzyTerms = buildSearchTerms(tagQuery).map((t) => t.toLowerCase());
        const fuzzyConds = fuzzyTerms
          .map((_, i) => `similarity(LOWER(ut.tag), $${i + 2}) > ${FUZZY_THRESHOLD}`)
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
          `SELECT ut.phone,
                  COALESCE(MAX(ua.alias), MAX(u.name)) AS name,
                  array_agg(DISTINCT ut.tag)            AS all_tags,
                  MAX(u.employer)                       AS employer,
                  MAX(u."jobPosition")                  AS "jobPosition",
                  MAX(u.city)                           AS city
           FROM "UserTags" ut
           LEFT JOIN "UserAlias" ua ON ua.phone = ut.phone AND ua."contactId" = ut."contactId"
           LEFT JOIN "UserPhone" up ON up.phone  = ut.phone
           LEFT JOIN "User"      u  ON u.id      = up."userId"
           WHERE ut."contactId" = $1
             AND (${fuzzyConds})
             AND ut.phone != ALL($${fuzzyBlockParamIdx})
           GROUP BY ut.phone
           ORDER BY MAX(ut."weightCount") DESC
           LIMIT 20`,
          [userId, ...fuzzyTerms, blockedPhones],
        );

        const fuzzyRows = fuzzyResult.rows.filter((r) => !isExcluded(r.phone));
        if (fuzzyRows.length > 0) {
          return {
            found: true,
            count: fuzzyRows.length,
            fuzzy: true,
            results: fuzzyRows.map((row) => ({
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
      return { found: false, query: tagQuery };
    }

    return {
      found: true,
      count: rows.length,
      results: rows.map((row) => ({
        phone: row.phone,
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
