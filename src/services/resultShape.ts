/**
 * What a search's result looked like, in counts — never in people.
 *
 * Lived inside chat.service until row 291: the opening searches write the same
 * tool_call_log rows and logged no sample at all, because the only copy of
 * this function sat in a file they cannot import without a cycle.
 */

/**
 * ⚠️ ROW 321 — A SEARCH THAT TIMED OUT WAS TOLD TO THE MODEL AS „FOUND NOBODY".
 *
 * Giorgi, 29 September 08:47:01: both lawyer searches on his 1,174-contact
 * phonebook hit a statement timeout, and searchDidNotFinish answered
 * {found: false, reason: 'search_timed_out', note: 'DID NOT FINISH — not an
 * empty network'}. This function read found:false as empty, attached the
 * empty-search history AND OVERWROTE THAT NOTE with „found nobody" — so the
 * model told him he had no lawyers while nine sat in his phonebook. A result
 * that carries a reason other than no_matches did not find nobody; it did not
 * finish, and it is passed through as it came.
 */
export const DID_NOT_FINISH_REASONS: ReadonlySet<string> = new Set([
  'search_timed_out',
  'search_failed',
  'neo4j_unavailable',
]);

/**
 * How many of a search's rows were exact and how many were approximate — and
 * NOT which people they were.
 *
 * The seat, #4262 on row 137: „the full-name search puts the exact person
 * first — that half holds. The other half is invisible to us because
 * result_sample is empty; put a few result rows in it and we can prove the
 * approximate flag too."
 *
 * The rows are the owner's own contacts, and result_sample's rule is that it
 * carries public web material only — a search over somebody's phonebook must
 * not leave a sample of their friends in a debugging table. That rule is
 * right and it stays.
 *
 * So this gives them the SHAPE instead of the people: „20 rows, 3 approximate"
 * answers exactly the question they asked, and names nobody. If the flag ever
 * stops being set, the line reads „20 rows, 0 approximate" and says so.
 */
/**
 * ⚠️ AND THE SHAPES THAT CARRY NO `results` AT ALL — the ones that cost two
 * readers a whole evening on 29 September.
 *
 * Until tonight this returned `null` for anything without a non-empty
 * `results` array, so a search that never ran logged no sample whatever. What
 * the reader was left with, on Giorgi's run:
 *
 *     search_by_tag  ადვოკატი   result_count=2  result_empty=true  sample=(null)
 *     search_by_tag  იურისტი    result_count=3  result_empty=true  sample=(null)
 *
 * The tester read that as two and three lawyers found and hidden, filed it Pr1
 * (row 295), and I read it the same way and nearly filed it as a server bug.
 * Neither number meant that. Those searches RAN and found nobody, and
 * `withEmptySearchHistory` attached the run's list of empty searches so far —
 * and `result_count` was the length of THAT list. On this shape the two fields
 * together read exactly like a successful search with rows.
 *
 * ⚠️ CORRECTED 30 SEPTEMBER. The first version of this comment, and of the
 * sample below, called that shape a „dedup guard" and said „no search ran".
 * That was my misreading, shipped: `withEmptySearchHistory` is applied AFTER
 * the search, to an empty result, and skips nothing. The seat caught it from
 * the timings — second-circle calls of 2.4–3.3 s are searches, not a guard.
 *
 * Only `result_keys` said otherwise, and nobody thinks to ask for it.
 *
 * So the sample now says which shape it was, in words. Still counts and never
 * people: a search over somebody's phonebook must not leave a list of their
 * friends in a debugging table (D149), and that rule does not bend for
 * convenience. „Found nobody — N empty searches in this run" names nobody and
 * would have ended that evening in one line.
 *
 * A search that DID NOT FINISH gets a line too. `searchDidNotFinish` exists
 * because a timeout and an empty network used to be the same sentence to the
 * model; they were still the same silence to a reader.
 */
export function matchShapeOf(result: unknown): string | null {
  if (result === null || typeof result !== 'object') return null;
  const record = result as {
    results?: unknown;
    empty_searches_so_far?: unknown;
    reason?: unknown;
    found?: unknown;
    error?: unknown;
  };
  // 2809 (the master test run's 45679, conv 44281): a refused search carries
  // the run's empty-search history too, and read „found nobody … this one
  // included". It did not run: it is a refusal first.
  if (typeof record.error === 'string' && record.error !== '') return 'not searched — refused';
  const rows = record.results;
  if (Array.isArray(rows) && rows.length > 0) {
    const approximate = rows.filter(
      (row) =>
        row !== null &&
        typeof row === 'object' &&
        (row as { approximate?: unknown }).approximate === true,
    ).length;
    return `${rows.length} rows, ${approximate} approximate`;
  }
  // Row 321: a search that did not finish says so first — it is never
  // „found nobody", whatever history rides with it.
  if (typeof record.reason === 'string' && DID_NOT_FINISH_REASONS.has(record.reason)) {
    return `no rows — ${record.reason}`;
  }
  // The count includes THIS search: it is noted before it is returned.
  const emptySoFar = record.empty_searches_so_far;
  if (typeof emptySoFar === 'number') {
    return `found nobody — ${emptySoFar} empty ${
      emptySoFar === 1 ? 'search' : 'searches'
    } in this run, this one included`;
  }
  if (typeof record.reason === 'string' && record.reason !== '') {
    return `no rows — ${record.reason}`;
  }
  if (record.found === false) return 'found nobody';
  return null;
}
