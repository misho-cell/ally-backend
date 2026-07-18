// Shared helpers for multi-word contact search. A query is split into per-word
// variant groups (see buildRawWordGroups); a contact's "word_hits" is the count
// of DISTINCT query words it matched, so the intersection (all words) ranks
// above partial matches — the fix for a common word (Axel ≈150) burying a rare
// one (Dachi) in a two-word query (search Bug 2).

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
