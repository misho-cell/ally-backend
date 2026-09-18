jest.mock('../../../db/postgres/client', () => ({
  __esModule: true,
  query: jest.fn(),
  default: {},
}));
jest.mock('../../../config/anthropic', () => ({ __esModule: true, default: {} }));

import { provisionalTitle } from '../threads.routes';

/**
 * Row 143, first stage. The seat's goal:
 *
 *   „I need 3 movers on 25 September at 9:00 for a 2-room flat in Vake"
 *
 * showed in the chat list, while it ran, as „I need 3 movers on 25" — the cut
 * landed between a number and its month, and the owner read a 25 that means
 * nothing.
 *
 * This line exists so the list is never blank; the real title arrives from the
 * generator seconds later. It cannot be made clever and should not be. What it
 * can do is not end on a word that is plainly waiting for the next one.
 */
describe('the title shown while the run is still going', () => {
  it('does not strand a date the way the seat saw', () => {
    expect(provisionalTitle('I need 3 movers on 25 September at 9:00 for a flat in Vake')).toBe(
      'I need 3 movers',
    );
  });

  it('does not end on a dangling preposition', () => {
    expect(provisionalTitle('I am looking for a plumber in Vake')).toBe(
      'I am looking for a plumber',
    );
    expect(provisionalTitle('Find me someone to')).toBe('Find me someone');
  });

  it('leaves an ordinary opener exactly as it was', () => {
    // Six words would end on „in", so it stops at five. That is the rule
    // working, not an exception to it.
    expect(provisionalTitle('I need a good dentist in Tbilisi')).toBe('I need a good dentist');
    expect(provisionalTitle('მჭირდება კარგი სტომატოლოგი')).toBe('მჭირდება კარგი სტომატოლოგი');
  });

  it('keeps a number that is doing work, not dangling', () => {
    // „3 movers" is the number attached to its noun — content, not a fragment.
    expect(provisionalTitle('3 movers needed')).toBe('3 movers needed');
  });

  it('never returns nothing, whatever it is given', () => {
    expect(provisionalTitle('on')).toBe('on');
    expect(provisionalTitle('   spaced   out   ')).toBe('spaced out');
  });
});
