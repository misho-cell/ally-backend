jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn(), default: {} }));

import { readFileSync } from 'fs';
import { join } from 'path';
import { peopleToInvite, renderPlan } from '../taskPlans.service';

/**
 * Row 288: Ninia's plan offered to invite somebody off the Axel list — not a
 * member, not anyone she knows. The card said „will need an invitation", a
 * proposal the product can never carry out.
 */
describe('a stranger is never offered an invitation', () => {
  const plan = {
    solved_when: 'x',
    routes: [{ name: 'web', status: 'open' }],
    people_to_involve: [
      { name: 'Friend', phone: '+1', route: 'web', reach: 'not_member' },
      { name: 'Stranger', phone: '+2', route: 'web', reach: 'not_owners_contact' },
    ],
    never_contact: [],
  } as never;

  it('offers an invitation only for the owner’s own contact', () => {
    expect(peopleToInvite(plan)).toEqual(['Friend']);
  });

  it('says on the card that a stranger is reached only through someone who knows them', () => {
    const card = renderPlan(plan, 1, null, false, 'en');
    expect(card).toContain('Stranger (not your contact — only through someone who knows them)');
    expect(card).toContain('Friend (not on Netai — will need an invitation)');
  });

  it('checks the owner’s phonebook when a person is not on Netai', () => {
    const src = readFileSync(join(__dirname, '..', 'taskPlans.service.ts'), 'utf8');
    expect(src).toContain(
      "asked === 'not_member' && !(await inOwnersPhonebook(userId, person.phone))",
    );
    expect(src).toContain('WHERE "contactId" = $1 AND regexp_replace');
  });
});
