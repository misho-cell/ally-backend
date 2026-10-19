import { readFileSync } from 'fs';
import { join } from 'path';
import { isRouteToSomeoneFound, peopleFoundIn } from '../warmPathAfterSearch';

/** World Y (the tester's 68805, Y3 60307): the head of customs, four links out. */
const FURTHER_OUT = {
  found: false,
  further_out: [
    {
      name: 'საბაჟოს უფროსი',
      phone: 'p_customs',
      hops: 4,
      firstLinkPhone: 'p_zuriko',
      via: ['ზურიკო', 'ლაშა', 'ნოდარი'],
    },
  ],
};

describe('#1849 world Y: the walk to a person this run found is the route, not a search', () => {
  it('counts a person found further out as found', () => {
    expect(peopleFoundIn(FURTHER_OUT)).toEqual([{ phone: 'p_customs', name: 'საბაჟოს უფროსი' }]);
  });

  it('still reads the ordinary results rows', () => {
    expect(peopleFoundIn({ results: [{ phone: 'p_1', name: 'ნინო' }] })).toEqual([
      { phone: 'p_1', name: 'ნინო' },
    ]);
    expect(peopleFoundIn({ found: false })).toEqual([]);
  });

  it('is the route for find_warm_path to that person, by phone id or by the name it showed', () => {
    const found = peopleFoundIn(FURTHER_OUT);
    expect(isRouteToSomeoneFound('find_warm_path', { target_phone: 'p_customs' }, found)).toBe(
      true,
    );
    expect(isRouteToSomeoneFound('find_warm_path', { target_phone: 'საბაჟოს უფროსი' }, found)).toBe(
      true,
    );
  });

  it('is not for a walk to somebody the run never found, nor for any other tool', () => {
    const found = peopleFoundIn(FURTHER_OUT);
    expect(isRouteToSomeoneFound('find_warm_path', { target_phone: 'p_other' }, found)).toBe(false);
    expect(isRouteToSomeoneFound('find_warm_path', {}, found)).toBe(false);
    expect(isRouteToSomeoneFound('web_search', { target_phone: 'p_customs' }, found)).toBe(false);
  });

  it('is wired: the further-out people are noted, and the budget passes the route', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    expect(chat).toContain('notePeopleFound(runId, { further_out: further });');
    expect(chat).toContain(
      '!isRouteToSomeoneFound(name, input, runFoundPeople.get(runId) ?? []) &&',
    );
  });
});
