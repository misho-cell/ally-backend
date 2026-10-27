jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));

import { namesAsShown } from '../mutualGroups';
import type { AccountDetails } from '../tools/membership';

/** #7789 (2) retest (tester 76702): a member is named by their own Georgian name. */
describe('a contact in the plan groups', () => {
  const member = { user_id: 42 } as AccountDetails;
  const states = new Map<string, AccountDetails>([
    ['995500000001', member],
    ['995500000002', { user_id: null } as AccountDetails],
  ]);

  it('is shown by the member’s own Georgian name when the owner saved them in Latin', () => {
    const names = new Map([
      ['995500000001', 'Gio K'],
      ['995500000002', 'Nino Beridze'],
    ]);
    const shown = namesAsShown(names, states, new Map([[42, 'გიორგი კიპიანი']]), 'ka');
    expect(shown.get('995500000001')).toBe('გიორგი კიპიანი');
    expect(shown.get('995500000002')).toBe('Nino Beridze');
  });

  it('keeps a Georgian label, and every label outside Georgian', () => {
    const names = new Map([['995500000001', 'გიო']]);
    const own = new Map([[42, 'გიორგი კიპიანი']]);
    expect(namesAsShown(names, states, own, 'ka').get('995500000001')).toBe('გიო');
    expect(
      namesAsShown(new Map([['995500000001', 'Gio K']]), states, own, 'en').get('995500000001'),
    ).toBe('Gio K');
  });
});
