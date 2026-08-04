// Shared SQL assembly for multi-word contact search. A query is split into
// per-word variant groups (see buildRawWordGroups); a contact's "word_hits" is
// the count of DISTINCT query words it matched, so the intersection (all words)
// ranks above partial matches — the fix for a common word (Axel ≈150) burying a
// rare one (Dachi) in a two-word query (search Bug 2).

import { toWordStartPattern } from './transliterate';

export interface ExactMatchSql {
  /** `matched AS (…)` — every branch driven FROM mine, one placeholder per pattern. */
  readonly matchedCte: string;
  /** `bool_or(…)::int + …` — # of distinct query words matched, per contact. */
  readonly wordHits: string;
  /** One flat array shared by the page and count queries — every entry referenced. */
  readonly params: unknown[];
  /** Placeholder index of the blocked-phones array (the last parameter). */
  readonly blockIdx: number;
}

/**
 * Build the matched-labels CTE and its parameters for the exact search, shared
 * by the tag and name tools. Design constraints learned in production:
 *  - every branch joins FROM mine (materialized, a few thousand phones) and is
 *    filtered in memory over that small set — the phone btree indexes drive the
 *    plan, and label filters must NEVER tempt the planner into the trigram GIN
 *    indexes: on this database pg_trgm extracts almost no trigrams from
 *    Georgian script (show_trgm('შენგელია') → 1 gram vs 10 for the Latin
 *    form), so a KA pattern turns a GIN scan into a near-full-index scan and a
 *    statement timeout — every Georgian-script query errored while Latin
 *    worked. The `(expr || '')` wrapper makes the filter expression differ from
 *    the indexed expression, deterministically forcing the mine-driven plan for
 *    every script.
 *  - every pattern is its OWN placeholder, never `ANY(array)`, and the page +
 *    count queries share one gap-free parameter array (an unreferenced bind
 *    parameter is a Postgres error).
 */
export function buildExactMatchSql(
  userId: string,
  rawGroups: readonly string[][],
  blockedPhones: readonly string[],
): ExactMatchSql {
  const groupRegex = rawGroups.map((g) => g.map(toWordStartPattern));
  const allRegex = groupRegex.flat();
  // Candidate gate: normalized-trigram LIKE, indexable for EVERY script
  // (normalize_search_token transliterates KA→ASCII — migration 043). Without
  // this gate a large account's full crowd rows get regex-scanned and time out;
  // sub-trigram terms are dropped (they can't use the index).
  const gateTerms = [...new Set(rawGroups.flat())].filter((t) => t.length >= 3);

  const regexStart = 2; // $1 = userId
  const gateStart = regexStart + allRegex.length;
  // The facts branch gets its OWN userId placeholder with an explicit ::int
  // cast — $1's inferred type depends on the "contactId" columns and must not
  // leak into an integer comparison.
  const factsUserIdx = gateStart + gateTerms.length;
  const blockIdx = factsUserIdx + 1;

  // The || '' wrapper is THE point — see the function comment (KA trigram gap).
  const regexOr = (col: string): string => {
    const expr = `(LOWER(${col}) || '')`;
    const parts = Array.from({ length: allRegex.length }, (_, i) => `${expr} ~ $${regexStart + i}`);
    return `(${parts.join(' OR ')})`;
  };

  // Normalized-trigram candidate gate, then word-start regex refine. The gate
  // uses the norm GIN indexes (ASCII for every script) to cut millions of rows
  // to a small candidate set; the refine regex carries the || '' wrapper so the
  // planner never touches the RAW trigram indexes (near-useless for KA text).
  // Empty gate (all sub-trigram terms) degrades to the mine-scoped scan.
  const gateOr = (col: string): string =>
    gateTerms.length > 0
      ? `(${gateTerms
          .map(
            (_, i) =>
              `normalize_search_token(${col}) LIKE '%' || normalize_search_token($${gateStart + i}) || '%'`,
          )
          .join(' OR ')})`
      : 'TRUE';

  // priority: a hit on a STRUCTURED field (registered jobPosition/employer, or
  // a saved occupation/employer/industry fact) is a stronger signal than a hit
  // inside a name/tag token — "gita" must surface the chairman of GITA above
  // nineteen people whose NAME contains Gita. Name/tag/alias branches carry 1,
  // structured branches 2; the tools order by word_hits first, then priority.
  // The structured branches skip the norm-trigram gate on purpose: they are
  // mine-scoped joins over small sets (registered contacts / the user's own
  // facts), with no trigram indexes to mislead the planner.
  const matchedCte = `matched AS (
     SELECT t.phone, LOWER(t.tag) AS label, 1 AS priority
     FROM "UserTags" t
     WHERE t.phone IN (SELECT phone FROM mine)
       AND ${gateOr('t.tag')} AND ${regexOr('t.tag')}
     UNION ALL
     SELECT a.phone, LOWER(a.alias) AS label, 1 AS priority
     FROM "UserAlias" a
     WHERE a.phone IN (SELECT phone FROM mine)
       AND ${gateOr('a.alias')} AND ${regexOr('a.alias')}
     UNION ALL
     SELECT up2.phone, LOWER(u2.name) AS label, 1 AS priority
     FROM "UserPhone" up2
     JOIN "User" u2 ON u2.id = up2."userId"
     WHERE up2.phone IN (SELECT phone FROM mine) AND u2.name IS NOT NULL
       AND ${gateOr('u2.name')} AND ${regexOr('u2.name')}
     UNION ALL
     SELECT up3.phone,
            LOWER(COALESCE(u3."jobPosition", '') || ' ' || COALESCE(u3.employer, '')) AS label,
            2 AS priority
     FROM "UserPhone" up3
     JOIN "User" u3 ON u3.id = up3."userId"
     WHERE up3.phone IN (SELECT phone FROM mine)
       AND (u3."jobPosition" IS NOT NULL OR u3.employer IS NOT NULL)
       AND ${regexOr(`COALESCE(u3."jobPosition", '') || ' ' || COALESCE(u3.employer, '')`)}
     UNION ALL
     SELECT cf.neo4j_contact_id AS phone, LOWER(cf.value) AS label, 2 AS priority
     FROM contact_facts cf
     WHERE cf.neo4j_contact_id IN (SELECT phone FROM mine)
       AND cf.field_type IN ('occupation', 'employer', 'industry')
       AND (cf.submitted_by_user_id = $${factsUserIdx}::int OR cf.is_public = true)
       AND ${regexOr('cf.value')}
   )`;

  let cursor = regexStart;
  const wordHits = groupRegex
    .map((group) => {
      const clause = Array.from({ length: group.length }, (_, i) => `label ~ $${cursor + i}`).join(
        ' OR ',
      );
      cursor += group.length;
      return `bool_or(${clause})::int`;
    })
    .join(' + ');

  return {
    matchedCte,
    wordHits,
    params: [userId, ...allRegex, ...gateTerms, userId, [...blockedPhones]],
    blockIdx,
  };
}
