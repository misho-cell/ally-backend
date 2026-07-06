import { query } from '../../db/postgres/client';
import { buildSearchTerms, toWordStartPattern } from './transliterate';
import { getExcludedPhones } from '../block.service';
import { normalizePhone } from '../phone';
import { applyFacts, ContactFactFields, fetchFactsForPhones } from './factEnrichment';

const FUZZY_THRESHOLD = 0.45;
const RESULT_LIMIT = 20;
// The fuzzy pass leans on the functional trigram index idx_user_tags_norm_trgm.
// Until that index is built (out of band, see migration 036) the pass would
// seq-scan; a short timeout makes it fail fast and be skipped, leaving the exact
// search untouched, instead of dragging every tag query.
const FUZZY_TIMEOUT_MS = 3_000;

interface TagRow {
  phone: string;
  name: string | null;
  all_tags: string[];
  employer: string | null;
  jobPosition: string | null;
  city: string | null;
}

const TAG_SELECT = `ut.phone,
        COALESCE(MAX(ua.alias), MAX(u.name)) AS name,
        array_agg(DISTINCT ut.tag)            AS all_tags,
        MAX(u.employer)                       AS employer,
        MAX(u."jobPosition")                  AS "jobPosition",
        MAX(u.city)                           AS city`;
const TAG_JOINS = `FROM "UserTags" ut
   LEFT JOIN "UserAlias" ua ON ua.phone = ut.phone AND ua."contactId" = ut."contactId"
   LEFT JOIN "UserPhone" up ON up.phone  = ut.phone
   LEFT JOIN "User"      u  ON u.id      = up."userId"`;

/** Exact word-start match plus the real (unbounded) distinct-contact count. */
async function runExactSearch(
  userId: string,
  terms: string[],
  blockedPhones: string[],
): Promise<{ rows: TagRow[]; total: number }> {
  const tagCondition = terms.map((_, i) => `LOWER(ut.tag) ~ $${i + 2}`).join(' OR ');
  const blockParamIdx = terms.length + 2;
  const [result, countResult] = await Promise.all([
    query<TagRow>(
      `SELECT ${TAG_SELECT}
       ${TAG_JOINS}
       WHERE ut."contactId" = $1
         AND (${tagCondition})
         AND ut.phone != ALL($${blockParamIdx})
       GROUP BY ut.phone
       ORDER BY MAX(ut."weightCount") DESC
       LIMIT ${RESULT_LIMIT}`,
      [userId, ...terms, blockedPhones],
    ),
    query<{ total: string }>(
      `SELECT COUNT(DISTINCT ut.phone) AS total
       FROM "UserTags" ut
       WHERE ut."contactId" = $1
         AND (${tagCondition})
         AND ut.phone != ALL($${blockParamIdx})`,
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
          `similarity(normalize_search_token(ut.tag), normalize_search_token($${i + 2})) > $${terms.length + 2}`,
      )
      .join(' OR ');
    const blockParamIdx = terms.length + 3;
    const result = await query<TagRow>(
      `SELECT ${TAG_SELECT}
       ${TAG_JOINS}
       WHERE ut."contactId" = $1
         AND (${conds})
         AND ut.phone != ALL($${blockParamIdx})
       GROUP BY ut.phone
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
  return approximate ? { ...base, approximate: true } : base;
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

    const facts = await fetchFactsForPhones(
      userId,
      [...exactRows, ...fuzzyRows].map((r) => r.phone),
    );
    const results = [
      ...exactRows.map((r) => shape(r, facts, false)),
      ...fuzzyRows.map((r) => shape(r, facts, true)),
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
