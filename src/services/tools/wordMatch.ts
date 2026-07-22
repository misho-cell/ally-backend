// Shared SQL assembly for multi-word contact search. A query is split into
// per-word variant groups (see buildRawWordGroups); a contact's "word_hits" is
// the count of DISTINCT query words it matched, so the intersection (all words)
// ranks above partial matches — the fix for a common word (Axel ≈150) burying a
// rare one (Dachi) in a two-word query (search Bug 2).

import { toWordStartPattern } from './transliterate';

// pg_trgm builds 3-character grams, so a LIKE pattern with fewer than 3
// significant chars ('%2%') can't use the GIN index and forces a full seq-scan
// of the alias table — which tipped "Radiatori 2" past the statement timeout.
const MIN_TRIGRAM_CHARS = 3;

// Turn raw terms into `%term%` LIKE patterns for an index-backed trigram
// candidate scan (idx_user_alias_trgm / GIN). Terms shorter than a trigram are
// dropped — they can't use the index, and they still count toward word_hits
// ranking (evaluated by regex over the already-narrowed match set). LIKE
// metacharacters in the term are escaped so a stray % or _ can't widen the match.
export function likePatterns(terms: readonly string[]): string[] {
  return terms
    .filter((t) => t.length >= MIN_TRIGRAM_CHARS)
    .map((t) => '%' + t.replace(/[\\%_]/g, '\\$&') + '%');
}

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
 *  - every pattern is its OWN placeholder (`x LIKE $3 OR x LIKE $4`), never
 *    `ANY(array)`: the planner can BitmapOr per-pattern over the trigram
 *    indexes, and the page + count queries can share one gap-free parameter
 *    array (an unreferenced bind parameter is a Postgres error);
 *  - every branch joins FROM mine (materialized, a few thousand phones), so the
 *    plan walks the user's own contacts via the phone indexes instead of
 *    scanning the multi-million-row alias/tag/user tables — which is what
 *    pushed the name search past the statement timeout at prod scale.
 */
export function buildExactMatchSql(
  userId: string,
  rawGroups: readonly string[][],
  blockedPhones: readonly string[],
): ExactMatchSql {
  const groupRegex = rawGroups.map((g) => g.map(toWordStartPattern));
  const allRegex = groupRegex.flat();
  const allLike = likePatterns(rawGroups.flat());

  const regexStart = 2; // $1 = userId
  const likeStart = regexStart + allRegex.length;
  const blockIdx = likeStart + allLike.length;

  const orOver = (expr: string, op: string, start: number, count: number): string =>
    Array.from({ length: count }, (_, i) => `${expr} ${op} $${start + i}`).join(' OR ');

  const regexOr = (expr: string): string => `(${orOver(expr, '~', regexStart, allRegex.length)})`;
  // No LIKE pattern survives for an all-short-token query ("2") — fall back to
  // the regex filter alone so the SQL stays well-formed (still mine-scoped).
  const likeOr = (expr: string): string =>
    allLike.length > 0 ? `(${orOver(expr, 'LIKE', likeStart, allLike.length)})` : regexOr(expr);

  const matchedCte = `matched AS (
     SELECT t.phone, LOWER(t.tag) AS label
     FROM mine m
     JOIN "UserTags" t ON t.phone = m.phone
     WHERE ${regexOr('LOWER(t.tag)')}
     UNION ALL
     SELECT a.phone, LOWER(a.alias) AS label
     FROM mine m
     JOIN "UserAlias" a ON a.phone = m.phone
     WHERE ${likeOr('LOWER(a.alias)')} AND ${regexOr('LOWER(a.alias)')}
     UNION ALL
     SELECT up2.phone, LOWER(u2.name) AS label
     FROM mine m
     JOIN "UserPhone" up2 ON up2.phone = m.phone
     JOIN "User"      u2  ON u2.id     = up2."userId"
     WHERE u2.name IS NOT NULL
       AND ${likeOr('LOWER(u2.name)')} AND ${regexOr('LOWER(u2.name)')}
   )`;

  let cursor = regexStart;
  const wordHits = groupRegex
    .map((group) => {
      const clause = orOver('label', '~', cursor, group.length);
      cursor += group.length;
      return `bool_or(${clause})::int`;
    })
    .join(' + ');

  return {
    matchedCte,
    wordHits,
    params: [userId, ...allRegex, ...allLike, [...blockedPhones]],
    blockIdx,
  };
}
