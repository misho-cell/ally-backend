// Shared SQL assembly for multi-word search ranking. A query is split into
// per-word variant groups (see buildWordGroups); a contact's "word_hits" is the
// count of DISTINCT query words it matched, so the intersection (all words)
// ranks above partial matches — the fix for a common word (Axel ≈150) burying a
// rare one (Dachi) in a two-word query (search Bug 2).

export interface GroupSql {
  readonly patterns: string[];
  readonly matchAny: string; // "(w0 patterns) OR (w1 patterns) OR ..." — matched ANY word
  readonly wordHits: string; // "bool_or(w0)::int + bool_or(w1)::int + ..." — # distinct words matched
  readonly nextParamIdx: number;
}

/**
 * Build the WHERE / ranking SQL fragments from per-word pattern groups. Each
 * word becomes an OR-group of its variant patterns; `cond(i)` renders the match
 * test for parameter placeholder $i (the caller controls which column(s) it
 * tests). Patterns are returned flattened in parameter order.
 */
export function buildGroupSql(
  wordGroups: readonly string[][],
  firstParamIdx: number,
  cond: (paramIdx: number) => string,
): GroupSql {
  const patterns: string[] = [];
  const groupExprs: string[] = [];
  let idx = firstParamIdx;
  for (const group of wordGroups) {
    const parts: string[] = [];
    for (const pattern of group) {
      patterns.push(pattern);
      parts.push(cond(idx));
      idx += 1;
    }
    groupExprs.push(`(${parts.join(' OR ')})`);
  }
  return {
    patterns,
    matchAny: groupExprs.join(' OR '),
    wordHits: groupExprs.map((e) => `bool_or(${e})::int`).join(' + '),
    nextParamIdx: idx,
  };
}
