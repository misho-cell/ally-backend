jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn(), default: {} }));
jest.mock('../../config/anthropic', () => ({ __esModule: true, default: {} }));

import { matchShapeOf } from '../resultShape';

/**
 * Row 137's second half, and the seat could not see it: „result_sample is
 * empty in the tool log, so we cannot tell whether the partial matches carry
 * approximate: true. Put a few result rows in it and we can prove the flag."
 *
 * The rows are the owner's own contacts. result_sample's rule is that it
 * carries public web material only — a search over somebody's phonebook must
 * not leave a sample of their friends in a debugging table — and that rule is
 * right and stays. So the log gets the SHAPE and not the people.
 */
describe('the match shape a search log may carry', () => {
  it('counts the rows and the approximate ones, and names nobody', () => {
    const sample = matchShapeOf({
      results: [
        { name: 'Beso Ortoidze', phone: '…1234' },
        { name: 'Beso Ortveladze', approximate: true },
        { name: 'Beso Ortvelashvili', approximate: true },
      ],
    });

    expect(sample).toBe('3 rows, 2 approximate');
    expect(sample).not.toMatch(/Beso|Ort/);
  });

  it('says zero rather than nothing when the flag is absent', () => {
    // The failure this has to be able to show: matching works, flagging does
    // not. „20 rows, 0 approximate" is the sentence that proves it.
    expect(matchShapeOf({ results: [{ name: 'A' }, { name: 'B' }] })).toBe('2 rows, 0 approximate');
  });

  /**
   * ⚠️ THIS CASE CHANGED ON 29 SEPTEMBER, AND THE CHANGE IS THE POINT.
   *
   * It used to assert that anything without a row list answers NOTHING. That
   * contract is what let two people misread Giorgi's run: the two
   * `search_by_tag` calls ran, found nobody, carried the run's empty-search
   * history, logged `result_count=2 / result_empty=true` with an empty sample,
   * and both the tester and I read that as two lawyers found and hidden. It
   * was the length of that history. See `anEmptyHistoryLooksLikeAFindShape`.
   *
   * So a result with no rows now says WHY it has none, when it knows. Silence
   * was never neutral here — the other two fields fill it in, wrongly.
   */
  it('says why there are no rows, instead of saying nothing', () => {
    expect(matchShapeOf({ found: false, reason: 'no_matches' })).toBe('no rows — no_matches');
    expect(matchShapeOf({ found: false, query: 'x' })).toBe('found nobody');
  });

  it('still answers nothing when there is nothing to say', () => {
    expect(matchShapeOf({ results: [] })).toBeNull();
    expect(matchShapeOf(null)).toBeNull();
    expect(matchShapeOf('a string')).toBeNull();
  });
});
