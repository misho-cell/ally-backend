jest.mock('../../db/postgres/client', () => ({ query: jest.fn(), __esModule: true }));

import { matchOccupation } from '../labelParser.service';
import { indexOffers, sureOffersFor } from '../matchIndex';

/**
 * #7828 (tester 78113, 29 Oct): joiners saved as „<name> რესტორანი" got the
 * plain welcome, while a member was looking for a restaurant owner. The label
 * gave them no work field, so the matcher had nothing to meet the goal with.
 */
describe('a joiner saved as a restaurant (#7828)', () => {
  it('gets the work field from the label, in either script', () => {
    expect(matchOccupation('ზურა მაისურაძე რესტორანი')).toBe('რესტორანი');
    expect(matchOccupation('Zura Maisuradze Restorani')).toBe('რესტორანი');
  });

  it('and that field meets a goal looking for a restaurant’s owner', () => {
    const index = indexOffers([{ id: 0, user_id: 1, field: 'რესტორანი' }]);
    const goal = {
      id: 9,
      user_id: 2,
      title: 'ფუდ კორტზე ფართს ვაქირავებ, რესტორნის მფლობელი მჭირდება',
    };
    expect(sureOffersFor(goal, index)).toHaveLength(1);
  });
});
