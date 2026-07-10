import { query } from '../../db/postgres/client';
import { buildSearchTerms, toWordStartPattern } from './transliterate';
import { getExcludedPhones } from '../block.service';
import { normalizePhone } from '../phone';
import { applyFacts, ContactFactFields, fetchFactsForPhones } from './factEnrichment';
import { fetchMembersForPhones, isMemberPhone } from './membership';

const FUZZY_THRESHOLD = 0.45;
const RESULT_LIMIT = 20;

interface NameRow {
  phone: string;
  name: string | null;
  all_tags: string[];
  employer: string | null;
  jobPosition: string | null;
  city: string | null;
}

function toRow(
  row: NameRow,
  facts: Map<string, ContactFactFields>,
  members: Set<string>,
): Record<string, unknown> {
  const base = applyFacts(
    {
      phone: row.phone,
      name: row.name ?? null,
      tags: (row.all_tags || []).filter(Boolean),
      employer: row.employer ?? null,
      jobPosition: row.jobPosition ?? null,
      city: row.city ?? null,
    },
    facts,
  );
  return { ...base, is_member: isMemberPhone(members, row.phone) };
}

export async function searchContactByName(userId: string, nameQuery: string): Promise<object> {
  try {
    const blockedPhones = await getExcludedPhones(userId);
    // Normalized set catches format variants the SQL exact match would miss.
    const excludedSet = new Set(blockedPhones.map(normalizePhone));
    const isExcluded = (phone: string): boolean => excludedSet.has(normalizePhone(phone));
    const rawTerms = buildSearchTerms(nameQuery);
    if (rawTerms.length === 0) return { found: false, query: nameQuery };
    // Word-start regex matches a name part by prefix ("gio" → "Giorgi") without
    // matching a fragment inside another word ("japan" ↛ "Japaridze") (ISSUE 3).
    const terms = rawTerms.map(toWordStartPattern);
    const nameCondition = terms
      .map((_, i) => `LOWER(ua.alias) ~ $${i + 2} OR LOWER(u.name) ~ $${i + 2}`)
      .join(' OR ');
    const blockParamIdx = terms.length + 2;

    const [result, countResult] = await Promise.all([
      query<{
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
         LIMIT ${RESULT_LIMIT}`,
        [userId, ...terms, blockedPhones],
      ),
      query<{ total: string }>(
        `SELECT COUNT(DISTINCT ua.phone) AS total
         FROM "UserAlias" ua
         LEFT JOIN "UserPhone" up ON up.phone = ua.phone
         LEFT JOIN "User"      u  ON u.id     = up."userId"
         WHERE ua."contactId" = $1
           AND (${nameCondition})
           AND ua.phone != ALL($${blockParamIdx})`,
        [userId, ...terms, blockedPhones],
      ),
    ]);

    const rows = result.rows.filter((r) => !isExcluded(r.phone));
    const total = Number(countResult.rows[0]?.total ?? rows.length);

    if (rows.length === 0) {
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

        const fuzzyRows = fuzzyResult.rows.filter((r) => !isExcluded(r.phone));
        if (fuzzyRows.length > 0) {
          const fuzzyPhones = fuzzyRows.map((r) => r.phone);
          const [facts, members] = await Promise.all([
            fetchFactsForPhones(userId, fuzzyPhones),
            fetchMembersForPhones(fuzzyPhones),
          ]);
          return {
            found: true,
            count: fuzzyRows.length,
            total: fuzzyRows.length,
            fuzzy: true,
            results: fuzzyRows.map((row) => toRow(row, facts, members)),
          };
        }
      } catch {
        // pg_trgm not available — skip fuzzy fallback
      }
      return { found: false, query: nameQuery };
    }

    const phones = rows.map((r) => r.phone);
    const [facts, members] = await Promise.all([
      fetchFactsForPhones(userId, phones),
      fetchMembersForPhones(phones),
    ]);
    return {
      found: true,
      count: rows.length,
      total,
      results: rows.map((row) => toRow(row, facts, members)),
    };
  } catch (err) {
    console.error('searchContactByName error:', (err as Error).message);
    return { found: false, error: (err as Error).message };
  }
}
