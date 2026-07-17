// Shared helpers for multi-word contact search. A query is split into per-word
// variant groups (see buildRawWordGroups); a contact's "word_hits" is the count
// of DISTINCT query words it matched, so the intersection (all words) ranks
// above partial matches — the fix for a common word (Axel ≈150) burying a rare
// one (Dachi) in a two-word query (search Bug 2).

// Turn raw terms into `%term%` LIKE patterns for an index-backed trigram
// candidate scan (idx_user_alias_trgm / GIN). LIKE metacharacters in the term
// are escaped so a stray % or _ in a name can't widen the match.
export function likePatterns(terms: readonly string[]): string[] {
  return terms.map((t) => '%' + t.replace(/[\\%_]/g, '\\$&') + '%');
}
