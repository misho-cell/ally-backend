const mockQuery = jest.fn();
jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: mockQuery, default: {} }));
jest.mock('../../config/anthropic', () => ({ __esModule: true, default: {} }));

import { peopleNoSearchFound, planNamesUnfound, wayInPhonesIn } from '../chat.service';

/**
 * #5446 (the tester's 65719, 2 of 3): the search found Maia by her own work, and
 * the plan added Levan too — a member with nothing on him, from list_my_contacts
 * — once with an invented reason.
 */
describe('the ways in a run found', () => {
  it('are each row, the bridges it goes through, and every warm-path bridge', () => {
    expect(
      wayInPhonesIn({
        results: [{ phone: '+1', via_contacts: [{ phone: '+2' }, { phone: '+3' }] }],
      }),
    ).toEqual(['+1', '+2', '+3']);
    expect(wayInPhonesIn({ paths: [{ bridges: [{ phone: '+4' }, { phone: '+5' }] }] })).toEqual([
      '+4',
      '+5',
    ]);
    expect(wayInPhonesIn({ found: false })).toEqual([]);
  });
});

describe('a plan person no search found', () => {
  const plan = {
    people_to_involve: [
      { name: 'Maia', phone: '+111' },
      { name: 'Levan', phone: '+222' },
    ],
  };

  beforeEach(() => {
    mockQuery.mockReset();
    // planConsentOnScreen: no cards, and an owner line that names nobody.
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
  });

  it('is refused by name when the run searched and found others', async () => {
    await expect(peopleNoSearchFound('9', 1, plan, null, new Set(['111']))).resolves.toEqual([
      'Levan',
    ]);
  });

  it('is not judged when the run searched for nobody', async () => {
    await expect(peopleNoSearchFound('9', 1, plan, null, undefined)).resolves.toEqual([]);
    await expect(peopleNoSearchFound('9', 1, plan, null, new Set())).resolves.toEqual([]);
  });

  it('is kept when the plan in force already holds them', async () => {
    const inForce = { people_to_involve: [{ name: 'Levan', phone: '+222' }] };
    await expect(
      peopleNoSearchFound('9', 1, plan, inForce as never, new Set(['111'])),
    ).resolves.toEqual([]);
  });

  it('is told to the model with no reason to give', () => {
    expect(planNamesUnfound(['Levan'])).toContain(
      'Never give a reason for someone the search did not show',
    );
  });
});
