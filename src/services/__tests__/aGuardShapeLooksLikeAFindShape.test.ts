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
 * NEITHER NUMBER MEANT THAT. Those calls returned the dedup guard — the two
 * queries had already been searched and come back empty, so no search ran at
 * all — and `result_count` was the length of the ALREADY-SEARCHED list.
 * `result_count` is „a numeric count key, or the first array's length", and
 * `result_empty` is a heuristic over several fields, so on a guard shape the
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
   * THE ONE THIS IS FOR. A guard shape must not be silent, because silence is
   * what let two people read it as rows.
   */
  it('says plainly when no search ran because it was already empty', () => {
    const guard = {
      found: false,
      already_searched_and_empty: ['ადვოკატი', 'იურისტი'],
      reason: 'already_searched',
      note: 'nothing new to search',
      search_id: 51,
    };

    const sample = matchShapeOf(guard);

    expect(sample).toContain('no search ran');
    expect(sample).toContain('already searched');
    // The count that misled is named as what it is — earlier queries.
    expect(sample).toContain('2');
    expect(sample).toContain('queries');
  });

  it('counts one skipped query in the singular', () => {
    expect(matchShapeOf({ found: false, already_searched_and_empty: ['x'] })).toContain(
      '1 earlier query',
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
