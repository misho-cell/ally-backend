import { query } from '../../db/postgres/client';
import { buildSearchTerms, toWordStartPattern } from './transliterate';
import { getExcludedPhones } from '../block.service';
import { normalizePhone } from '../phone';
import { applyFacts, ContactFactFields, fetchFactsForPhones } from './factEnrichment';
import { fetchMembersForPhones, isMemberPhone } from './membership';

const FUZZY_THRESHOLD = 0.45;
const RESULT_LIMIT = 20;
// The fuzzy pass leans on the functional trigram index idx_user_tags_norm_trgm.
// Until that index is built (out of band, see migration 036) the pass would
// seq-scan; a short timeout makes it fail fast and be skipped, leaving the exact
// search untouched, instead of dragging every tag query.
const FUZZY_TIMEOUT_MS = 5_000;

interface TagRow {
  phone: string;
  name: string | null;
  all_tags: string[];
  employer: string | null;
  jobPosition: string | null;
  city: string | null;
}

// The user's OWN contacts — the phones they actually have (from any tag or alias
// they saved). Recall then matches AGGREGATED tags (from every contributor) on
// these phones, so a contact surfaces by a crowd tag on their profile even if
// the user never personally typed it — the fix for "search only saw my own tags".
const MY_CONTACTS_CTE = `mine AS (
     SELECT phone FROM "UserTags"  WHERE "contactId" = $1
     UNION
     SELECT phone FROM "UserAlias" WHERE "contactId" = $1
   )`;

// Aggregate the display fields for a set of matched phones: the user's OWN alias
// for the name, every contributor's tags, and the registered profile fields.
const AGG_SELECT = `h.phone,
        COALESCE(MAX(ua.alias), MAX(u.name)) AS name,
        array_agg(DISTINCT ut.tag)           AS all_tags,
        MAX(u.employer)                      AS employer,
        MAX(u."jobPosition")                 AS "jobPosition",
        MAX(u.city)                          AS city`;
const AGG_JOINS = `FROM hits h
   JOIN "UserTags"       ut ON ut.phone = h.phone
   LEFT JOIN "UserAlias" ua ON ua.phone = h.phone AND ua."contactId" = $1
   LEFT JOIN "UserPhone" up ON up.phone = h.phone
   LEFT JOIN "User"      u  ON u.id     = up."userId"`;

/** Exact word-start match over aggregated tags, plus the real distinct-contact count. */
async function runExactSearch(
  userId: string,
  terms: string[],
  blockedPhones: string[],
): Promise<{ rows: TagRow[]; total: number }> {
  const tagCondition = terms.map((_, i) => `LOWER(t.tag) ~ $${i + 2}`).join(' OR ');
  const blockParamIdx = terms.length + 2;
  const [result, countResult] = await Promise.all([
    query<TagRow>(
      `WITH ${MY_CONTACTS_CTE},
       hits AS (
         SELECT DISTINCT t.phone
         FROM "UserTags" t
         WHERE t.phone IN (SELECT phone FROM mine)
           AND (${tagCondition})
           AND t.phone != ALL($${blockParamIdx})
       )
       SELECT ${AGG_SELECT}
       ${AGG_JOINS}
       GROUP BY h.phone
       ORDER BY MAX(ut."weightCount") DESC
       LIMIT ${RESULT_LIMIT}`,
      [userId, ...terms, blockedPhones],
    ),
    query<{ total: string }>(
      `WITH ${MY_CONTACTS_CTE}
       SELECT COUNT(DISTINCT t.phone) AS total
       FROM "UserTags" t
       WHERE t.phone IN (SELECT phone FROM mine)
         AND (${tagCondition})
         AND t.phone != ALL($${blockParamIdx})`,
      [userId, ...terms, blockedPhones],
    ),
  ]);
  return { rows: result.rows, total: Number(countResult.rows[0]?.total ?? result.rows.length) };
}

/**
 * Spelling-tolerant pass over the NORMALIZED tag (normalize_search_token folds
 * gh/kh/zh/ts/q/x drift), so ღ-drift spellings and typos — buralteri / bugalteri
 * / buhalteri — reach each other via trigram similarity. Best-effort: if pg_trgm
 * or the functional index is missing it returns nothing rather than failing the
 * whole search.
 */
async function runFuzzySearch(
  userId: string,
  terms: readonly string[],
  blockedPhones: string[],
): Promise<TagRow[]> {
  try {
    const conds = terms
      .map(
        (_, i) =>
          `similarity(normalize_search_token(t.tag), normalize_search_token($${i + 2})) > $${terms.length + 2}`,
      )
      .join(' OR ');
    const blockParamIdx = terms.length + 3;
    const result = await query<TagRow>(
      `WITH ${MY_CONTACTS_CTE},
       hits AS (
         SELECT DISTINCT t.phone
         FROM "UserTags" t
         WHERE t.phone IN (SELECT phone FROM mine)
           AND (${conds})
           AND t.phone != ALL($${blockParamIdx})
       )
       SELECT ${AGG_SELECT}
       ${AGG_JOINS}
       GROUP BY h.phone
       ORDER BY MAX(similarity(normalize_search_token(ut.tag), normalize_search_token($2))) DESC
       LIMIT ${RESULT_LIMIT}`,
      [userId, ...terms, FUZZY_THRESHOLD, blockedPhones],
      FUZZY_TIMEOUT_MS,
    );
    return result.rows;
  } catch {
    // pg_trgm/index not available or the pass timed out — the exact search stands.
    return [];
  }
}

function shape(
  row: TagRow,
  facts: Map<string, ContactFactFields>,
  members: Set<string>,
  approximate: boolean,
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
  const withMember = { ...base, is_member: isMemberPhone(members, row.phone) };
  return approximate ? { ...withMember, approximate: true } : withMember;
}

export async function searchByTag(userId: string, tagQuery: string): Promise<object> {
  try {
    const blockedPhones = await getExcludedPhones(userId);
    const excludedSet = new Set(blockedPhones.map(normalizePhone));
    const isExcluded = (phone: string): boolean => excludedSet.has(normalizePhone(phone));

    const rawTerms = buildSearchTerms(tagQuery);
    if (rawTerms.length === 0) return { found: false, query: tagQuery };

    const exact = await runExactSearch(userId, rawTerms.map(toWordStartPattern), blockedPhones);
    const exactRows = exact.rows.filter((r) => !isExcluded(r.phone));

    // Always union the fuzzy pass so a query for one ღ-spelling also surfaces the
    // others (they otherwise return disjoint sets). Fuzzy-only hits are marked
    // approximate; exact hits keep priority and are never re-flagged.
    const seen = new Set(exactRows.map((r) => normalizePhone(r.phone)));
    const fuzzyRows = (await runFuzzySearch(userId, rawTerms, blockedPhones)).filter(
      (r) => !isExcluded(r.phone) && !seen.has(normalizePhone(r.phone)),
    );

    if (exactRows.length === 0 && fuzzyRows.length === 0) return { found: false, query: tagQuery };

    const allPhones = [...exactRows, ...fuzzyRows].map((r) => r.phone);
    const [facts, members] = await Promise.all([
      fetchFactsForPhones(userId, allPhones),
      fetchMembersForPhones(allPhones),
    ]);
    const results = [
      ...exactRows.map((r) => shape(r, facts, members, false)),
      ...fuzzyRows.map((r) => shape(r, facts, members, true)),
    ];
    const payload: Record<string, unknown> = {
      found: true,
      count: results.length,
      total: exact.total + fuzzyRows.length,
      results,
    };
    // Whole result is approximate only when nothing matched exactly.
    if (exactRows.length === 0) payload.fuzzy = true;
    return payload;
  } catch (err) {
    console.error('searchByTag error:', (err as Error).message);
    return { found: false, error: (err as Error).message };
  }
}
