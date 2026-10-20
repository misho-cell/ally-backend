jest.mock('../../db/postgres/client', () => ({ query: jest.fn(), __esModule: true }));

import { sharedThreadStatusAfter } from '../introduction.service';

/** #6362 retest (the tester's 61731 / 61733): her yes never files her case as finished. */
describe('a go-between’s yes in an ask thread the request shared', () => {
  it('keeps the thread open, at work, when the question there is answered', () => {
    expect(sharedThreadStatusAfter('accept', 'done')).toBe('working');
  });

  it('keeps it hers while she still owes the question', () => {
    expect(sharedThreadStatusAfter('accept', 'needs_you')).toBe('needs_you');
  });

  it('settles on her no as the ask says', () => {
    expect(sharedThreadStatusAfter('decline', 'done')).toBe('done');
  });
});
