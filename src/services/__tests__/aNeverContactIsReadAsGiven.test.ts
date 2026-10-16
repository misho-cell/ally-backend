import { parsePlan } from '../taskPlans.service';

/**
 * The daily check of 16 Oct (08:23:53Z, a real account): a plan was refused
 * on „never_contact.name is required". A person to avoid now arrives as people
 * do: an object, the JSON text of one, or just a name.
 */
const base = {
  solved_when: 'ბუღალტერი მოიძებნა',
  routes: [{ name: 'პირადი კონტაქტი', status: 'waiting' }],
  people_to_involve: [{ name: 'გია', phone: '+995599000370', route: 'პირადი კონტაქტი' }],
};

function neverOf(neverContact: unknown[]): unknown {
  const outcome = parsePlan({ ...base, never_contact: neverContact });
  return outcome.ok ? outcome.value.never_contact : outcome.error;
}

describe('a never-contact entry', () => {
  it('is read from a bare name', () => {
    expect(neverOf(['ნინო'])).toEqual([{ name: 'ნინო' }]);
  });

  it('is read from the JSON text of an entry', () => {
    expect(neverOf(['{"name": "ნინო", "phone": "+995599000371"}'])).toEqual([
      { name: 'ნინო', phone: '+995599000371' },
    ]);
  });

  it('is read from an object, as before', () => {
    expect(neverOf([{ name: 'ნინო' }])).toEqual([{ name: 'ნინო' }]);
  });

  it('is still refused with no name at all, never dropped in silence', () => {
    expect(neverOf([{ phone: '+995599000371' }])).toBe('never_contact.name is required');
  });
});
