import { query } from '../../db/postgres/client';
import { buildSearchTerms, buildRawWordGroups, toWordStartPattern } from './transliterate';
import { likePatterns } from './wordMatch';
import { getExcludedPhones } from '../block.service';
import { normalizePhone } from '../phone';
import { applyFacts, ContactFactFields, fetchFactsForPhones } from './factEnrichment';
import { fetchMembersForPhones, isMemberPhone } from './membership';
import { OWNERSHIP } from './searchResultMeta';

const FUZZY_THRESHOLD = 0.45;
const RESULT_LIMIT = 20;

interface NameRow {
  phone: string;
  name: string | null;
  saved_as: string | null;
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
  return {
    ...base,
    is_member: isMemberPhone(members, row.phone),
    ownership: OWNERSHIP.DIRECT,
    saved_as: row.saved_as ?? null,
  };
}

export async function searchContactByName(userId: string, nameQuery: string): Promise<object> {
  try {
    const blockedPhones = await getExcludedPhones(userId);
    // Normalized set catches format variants the SQL exact match would miss.
    const excludedSet = new Set(blockedPhones.map(normalizePhone));
    const isExcluded = (phone: string): boolean => excludedSet.has(normalizePhone(phone));
    // Word-start regex matches a name part by prefix ("gio" → "Giorgi") without
    // matching a fragment inside another word ("japan" ↛ "Japaridze") (ISSUE 3).
    const rawGroups = buildRawWordGroups(nameQuery);
    if (rawGroups.length === 0) return { found: false, query: nameQuery };
    // Match each query word across ALL of a contact's labels — every
    // contributor's alias, the registered name, AND every tag — on the user's
    // OWN contacts (the "mine" set). So a surname another contributor added
    // ("Salome Jojua") surfaces her even when the user saved her as just "Salome"
    // (Bug 1), and a person is found by a nickname/group tag as readily as by
    // their display name. word_hits (distinct query words matched across labels)
    // ranks the one matching every word first ("Dachi Axel" → the person with the
    // `dachi` tag AND `axel`, not the ~150 who match one — Bug 2). Alias/name
    // candidates use an index-backed trigram LIKE (idx_user_alias_trgm) then
    // refine to word-start — no full labels seq-scan (that measured ~3s and
    // tipped heavier queries past the statement timeout → empty results).
    const groupRegex = rawGroups.map((grp) => grp.map(toWordStartPattern));
    const allRegex = groupRegex.flat();
    const allLike = likePatterns(rawGroups.flat());
    // $1 userId, $2 allRegex[], $3 allLike[], $4..$(3+G) per-group regex[], last = blocked
    const groupParamStart = 4;
    const blockParamIdx = groupParamStart + groupRegex.length;
    const wordHits = groupRegex
      .map((_, i) => `bool_or(label ~ ANY($${groupParamStart + i}))::int`)
      .join(' + ');
    const params = [userId, allRegex, allLike, ...groupRegex, blockedPhones];
    const mineCte = `mine AS (
       SELECT phone FROM "UserTags"  WHERE "contactId" = $1
       UNION
       SELECT phone FROM "UserAlias" WHERE "contactId" = $1
     )`;
    // Only the matching labels of the mine-phones (index-backed candidates).
    const matchedCte = `matched AS (
       SELECT a.phone, LOWER(a.alias) AS label
       FROM "UserAlias" a
       WHERE a.phone IN (SELECT phone FROM mine)
         AND LOWER(a.alias) LIKE ANY($3) AND LOWER(a.alias) ~ ANY($2)
       UNION ALL
       SELECT up2.phone, LOWER(u2.name) AS label
       FROM "User" u2
       JOIN "UserPhone" up2 ON up2."userId" = u2.id
       WHERE up2.phone IN (SELECT phone FROM mine) AND u2.name IS NOT NULL
         AND LOWER(u2.name) LIKE ANY($3) AND LOWER(u2.name) ~ ANY($2)
       UNION ALL
       SELECT t.phone, LOWER(t.tag) AS label
       FROM "UserTags" t
       WHERE t.phone IN (SELECT phone FROM mine) AND LOWER(t.tag) ~ ANY($2)
     )`;
    const hitsCte = `hits AS (
       SELECT phone, (${wordHits}) AS word_hits
       FROM matched
       WHERE phone != ALL($${blockParamIdx})
       GROUP BY phone
     )`;
    const aggSelect = `SELECT h.phone,
              COALESCE(MAX(ua.alias), MAX(u.name)) AS name,
              MAX(ua.alias)                        AS saved_as,
              array_agg(DISTINCT ut.tag)           AS all_tags,
              MAX(u.employer)                      AS employer,
              MAX(u."jobPosition")                 AS "jobPosition",
              MAX(u.city)                          AS city
       FROM hits h
       LEFT JOIN "UserAlias" ua ON ua.phone = h.phone AND ua."contactId" = $1
       LEFT JOIN "UserTags"  ut ON ut.phone = h.phone
       LEFT JOIN "UserPhone" up ON up.phone = h.phone
       LEFT JOIN "User"      u  ON u.id     = up."userId"
       GROUP BY h.phone`;

    const [result, countResult] = await Promise.all([
      query<{
        phone: string;
        name: string | null;
        saved_as: string | null;
        all_tags: string[];
        employer: string | null;
        jobPosition: string | null;
        city: string | null;
      }>(
        `WITH ${mineCte}, ${matchedCte}, ${hitsCte}
         ${aggSelect}
         ORDER BY MAX(h.word_hits) DESC, MAX(ua.alias)
         LIMIT ${RESULT_LIMIT}`,
        params,
      ),
      query<{ total: string }>(
        `WITH ${mineCte}, ${matchedCte}
         SELECT COUNT(DISTINCT phone) AS total
         FROM matched
         WHERE phone != ALL($${blockParamIdx})`,
        params,
      ),
    ]);

    const rows = result.rows.filter((r) => !isExcluded(r.phone));
    const total = Number(countResult.rows[0]?.total ?? rows.length);

    if (rows.length === 0) {
      // Fallback: fuzzy similarity search via pg_trgm (catches typos like livingston/livingstone)
      try {
        const fuzzyTerms = nameQuery
          .trim()
          .split(/\s+/)
          .filter(Boolean)
          .flatMap((word) => buildSearchTerms(word))
          .map((t) => t.toLowerCase());
        const fuzzyConds = fuzzyTerms
          .map(
            (_, i) =>
              `word_similarity($${i + 2}, LOWER(a.alias)) > ${FUZZY_THRESHOLD} OR word_similarity($${i + 2}, LOWER(u2.name)) > ${FUZZY_THRESHOLD}`,
          )
          .join(' OR ');
        const fuzzyBlockParamIdx = fuzzyTerms.length + 2;
        const fuzzyMineCte = `mine AS (
           SELECT phone FROM "UserTags"  WHERE "contactId" = $1
           UNION
           SELECT phone FROM "UserAlias" WHERE "contactId" = $1
         )`;

        const fuzzyResult = await query<{
          phone: string;
          name: string | null;
          saved_as: string | null;
          all_tags: string[];
          employer: string | null;
          jobPosition: string | null;
          city: string | null;
        }>(
          `WITH ${fuzzyMineCte},
           hits AS (
             SELECT DISTINCT a.phone
             FROM "UserAlias" a
             LEFT JOIN "UserPhone" up2 ON up2.phone = a.phone
             LEFT JOIN "User"      u2  ON u2.id     = up2."userId"
             WHERE a.phone IN (SELECT phone FROM mine)
               AND (${fuzzyConds})
               AND a.phone != ALL($${fuzzyBlockParamIdx})
           )
           SELECT h.phone,
                  COALESCE(MAX(ua.alias), MAX(u.name)) AS name,
                  MAX(ua.alias)                        AS saved_as,
                  array_agg(DISTINCT ut.tag)           AS all_tags,
                  MAX(u.employer)                      AS employer,
                  MAX(u."jobPosition")                 AS "jobPosition",
                  MAX(u.city)                          AS city
           FROM hits h
           LEFT JOIN "UserAlias" ua ON ua.phone = h.phone AND ua."contactId" = $1
           LEFT JOIN "UserTags"  ut ON ut.phone = h.phone
           LEFT JOIN "UserPhone" up ON up.phone = h.phone
           LEFT JOIN "User"      u  ON u.id     = up."userId"
           GROUP BY h.phone
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
