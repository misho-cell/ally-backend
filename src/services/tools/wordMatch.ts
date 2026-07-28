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

  const regexStart = 2; // $1 = userId
  const blockIdx = regexStart + allRegex.length;

  // The || '' wrapper is THE point — see the function comment (KA trigram gap).
  const regexOr = (col: string): string => {
    const expr = `(LOWER(${col}) || '')`;
    const parts = Array.from({ length: allRegex.length }, (_, i) => `${expr} ~ $${regexStart + i}`);
    return `(${parts.join(' OR ')})`;
  };

  // CROSS JOIN LATERAL forces a nested loop from mine (a few thousand rows)
  // into the per-phone btree indexes. A plain JOIN let the planner pick a
  // hash join with a FULL seq-scan of the multi-million-row tables (regex
  // evaluated on every row) — statement timeouts survived the GIN removal.
  const matchedCte = `matched AS (
     SELECT l.phone, l.label
     FROM mine m
     CROSS JOIN LATERAL (
       SELECT t.phone, LOWER(t.tag) AS label
       FROM "UserTags" t
       WHERE t.phone = m.phone AND ${regexOr('t.tag')}
     ) l
     UNION ALL
     SELECT l.phone, l.label
     FROM mine m
     CROSS JOIN LATERAL (
       SELECT a.phone, LOWER(a.alias) AS label
       FROM "UserAlias" a
       WHERE a.phone = m.phone AND ${regexOr('a.alias')}
     ) l
     UNION ALL
     SELECT l.phone, l.label
     FROM mine m
     CROSS JOIN LATERAL (
       SELECT up2.phone, LOWER(u2.name) AS label
       FROM "UserPhone" up2
       JOIN "User" u2 ON u2.id = up2."userId"
       WHERE up2.phone = m.phone AND u2.name IS NOT NULL
         AND ${regexOr('u2.name')}
     ) l
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
    params: [userId, ...allRegex, [...blockedPhones]],
    blockIdx,
  };
}
