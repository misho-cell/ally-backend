jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn(), default: {} }));
jest.mock('../../config/anthropic', () => ({ __esModule: true, default: {} }));

import { withEmptySearchHistory } from '../chat.service';
import { furtherOutCount, matchShapeOf } from '../resultShape';
import { outcomeOf } from '../toolCallLog.service';

/**
 * 5347, the tester's 63859 (56005, 56011, 56017): the walk past the second
 * circle found the notary, but the result still carried „found nobody — 4 empty
 * searches" and a note to work from the web — and every reply did just that.
 */
describe('a search that found somebody further out', () => {
  const foundFurther = {
    found: false,
    reason: 'no_matches',
    further_out: [{ name: 'ნოტარიუსი ქუთაისში', phone: '995599777000', hops: 5, via: [] }],
    further_out_note: 'Found further out …',
  };

  it('is never told it found nobody, however many searches came before', () => {
    for (const word of ['ნოტარიუსი', 'notary', 'იურისტი']) {
      withEmptySearchHistory('search_by_tag', { tag_query: word }, 'run-63859', { found: false });
    }
    const out = withEmptySearchHistory(
      'search_second_degree',
      { tag_query: 'ნოტარიუსი ქუთაისი' },
      'run-63859',
      foundFurther,
    );
    expect(out).toBe(foundFurther);
    expect(out).not.toHaveProperty('empty_searches_so_far');
    expect(out).not.toHaveProperty('note');
  });

  it('is logged as a find, not as empty', () => {
    expect(matchShapeOf(foundFurther)).toBe('1 further out');
    expect(outcomeOf(foundFurther).empty).toBe(false);
  });

  it('counts only a list of people as found further out', () => {
    expect(furtherOutCount(foundFurther)).toBe(1);
    expect(furtherOutCount({ found: false, further_out: [] })).toBe(0);
    expect(furtherOutCount({ found: false })).toBe(0);
    expect(furtherOutCount(null)).toBe(0);
  });
});
