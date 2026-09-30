import { matchShapeOf } from '../chat.service';

/**
 * ⚠️ TWO READERS, ONE EVENING, AND THE FIELD THAT WOULD HAVE ENDED IT.
 *
 * 29 September, Giorgi's run. What `tool_call_log` showed:
 *
 *     search_by_tag  ადვოკატი   result_count=2  result_empty=true  sample=(null)
 *     search_by_tag  იურისტი    result_count=3  result_empty=true  sample=(null)
 *
 * The tester read that as two and three lawyers found in his own phonebook and
 * hidden from him, and filed it Pr1 (row 295, „own contacts are skipped"). I
 * opened it and read it exactly the same way, and came within one query of
 * filing it as a server bug.
 *
 * NEITHER NUMBER MEANT THAT. Those searches ran and found nobody, and the
 * run's list of empty searches so far was attached to the result —
 * `result_count` was the length of THAT list. (Corrected 30 September: this
 * file first called it a „dedup guard" where „no search ran". It is not a
 * guard; it skips nothing. The seat caught it from the call timings.)
 * `result_count` is „a numeric count key, or the first array's length", and
 * `result_empty` is a heuristic over several fields, so on this shape the
 * two together are indistinguishable from a successful search with rows.
 *
 * Only `result_keys` told the truth, and nobody thinks to ask for it.
 *
 * `matchShapeOf` returned null for anything without a non-empty `results`, so
 * the one field whose whole job is „what came back" said nothing in precisely
 * the case where the other two mislead.
 */
describe('a sample says which shape came back, not just how many rows', () => {
  /** Unchanged: the case that already worked. */
  it('still counts rows and approximate ones', () => {
    expect(matchShapeOf({ results: [{}, { approximate: true }, {}] })).toBe(
      '3 rows, 1 approximate',
    );
  });

  /**
   * THE ONE THIS IS FOR. This shape must not be silent, because silence is
   * what let two people read it as rows.
   */
  it('says plainly that the search found nobody, and how many empties this run has had', () => {
    // The real shape: an empty result, with the run's empty-search history
    // attached by withEmptySearchHistory after the search ran.
    const emptyWithHistory = {
      found: false,
      already_searched_and_empty: ['search_by_tag: ადვოკატი', 'search_by_tag: იურისტი'],
      note: 'This run has now searched 2 times and found nobody.',
    };

    const sample = matchShapeOf(emptyWithHistory);

    expect(sample).toBe('found nobody — 2 empty searches in this run, this one included');
    // It never claims a search was skipped: the history is attached AFTER it ran.
    expect(sample).not.toMatch(/no search ran|skipped/);
  });

  it('counts one empty search in the singular', () => {
    expect(matchShapeOf({ found: false, already_searched_and_empty: ['x'] })).toContain(
      '1 empty search in this run',
    );
  });

  /**
   * A search that could not run is not an empty network — `searchDidNotFinish`
   * made that true for the model months ago, and it was still silence here.
   */
  it('names a search that did not finish', () => {
    expect(matchShapeOf({ found: false, reason: 'search_timed_out', note: '…' })).toBe(
      'no rows — search_timed_out',
    );
  });

  /** An honest empty result is still worth one word. */
  it('says so when the search ran and found nobody', () => {
    expect(matchShapeOf({ found: false, query: 'იურისტი' })).toBe('found nobody');
  });

  /**
   * ⚠️ AND IT STILL NAMES NOBODY. A search over somebody's phonebook must not
   * leave a list of their friends in a debugging table (D149), and the rule
   * does not bend because a sample would be convenient.
   */
  it('never puts a person into the sample', () => {
    const withPeople = {
      results: [
        { name: 'Giorgi Abramishvili', phone: '+995555000005' },
        { name: 'Lika Ose', approximate: true },
      ],
    };

    const sample = matchShapeOf(withPeople) ?? '';

    expect(sample).not.toContain('Giorgi');
    expect(sample).not.toContain('Lika');
    expect(sample).not.toContain('995');
    expect(sample).toBe('2 rows, 1 approximate');
  });

  it('has nothing to say about a shape it does not know', () => {
    expect(matchShapeOf({ ok: true })).toBeNull();
    expect(matchShapeOf(null)).toBeNull();
    expect(matchShapeOf('rows')).toBeNull();
  });
});
