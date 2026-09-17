jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn(), default: {} }));
jest.mock('../../config/anthropic', () => ({ __esModule: true, default: {} }));

import { matchShapeOf } from '../chat.service';

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

  it('answers nothing for a result that is not a row list', () => {
    expect(matchShapeOf({ found: false, reason: 'no_matches' })).toBeNull();
    expect(matchShapeOf({ results: [] })).toBeNull();
    expect(matchShapeOf(null)).toBeNull();
    expect(matchShapeOf('a string')).toBeNull();
  });
});
