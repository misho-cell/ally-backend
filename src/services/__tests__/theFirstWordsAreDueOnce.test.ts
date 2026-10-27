jest.mock('../../db/postgres/client', () => ({
  query: jest.fn(),
  poolPressure: () => ({ total: 0, idle: 0, waiting: 0 }),
  __esModule: true,
  default: { end: jest.fn() },
}));

import { firstLineIsDue } from '../chat.service';

/** #8053: which round's text goes out at once as a line, and which stays a step. */
describe('the first words of a run are due', () => {
  it('beside the first search of a run the owner is in', () => {
    expect(firstLineIsDue(1, false, ['search_by_tag'], false)).toBe(true);
    expect(firstLineIsDue(1, false, ['web_search', 'search_second_degree'], false)).toBe(true);
    expect(firstLineIsDue(1, false, ['search_contact_by_name'], false)).toBe(true);
  });

  it('only once: a later round stays a step', () => {
    expect(firstLineIsDue(2, false, ['search_by_tag'], false)).toBe(false);
  });

  it('never on a wake, where nobody is waiting', () => {
    expect(firstLineIsDue(1, true, ['search_by_tag'], false)).toBe(false);
  });

  it('never beside a plan or choices, nor in a run repeating a goal', () => {
    expect(firstLineIsDue(1, false, ['search_by_tag', 'propose_task_plan'], false)).toBe(false);
    expect(firstLineIsDue(1, false, ['present_choices', 'web_search'], false)).toBe(false);
    expect(firstLineIsDue(1, false, ['search_by_tag'], true)).toBe(false);
  });

  it('not for a round that does not search', () => {
    expect(firstLineIsDue(1, false, ['save_user_note'], false)).toBe(false);
    expect(firstLineIsDue(1, false, ['ask_contact'], false)).toBe(false);
  });
});
