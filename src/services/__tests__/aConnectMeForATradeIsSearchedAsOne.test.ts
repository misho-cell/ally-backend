import { goalReachesANamedPerson } from '../openingSearch.service';

/**
 * Misho, 16 Nov (the tester's thermos request): „connect me" with no name
 * beside it made the goal read as reaching a person, and every search ran on
 * the whole sentence — „our" and „for the team" found most of the people.
 */
describe('a goal that says „connect me"', () => {
  it('is a trade when no name stands beside the phrase, and is distilled and searched as one', () => {
    expect(
      goalReachesANamedPerson(
        'ჩვენი გუნდისთვის 30 ბრენდირებული თერმოსის დამზადება მინდა. მომიძებნე ადამიანი, ' +
          'ვინც ამაში დამეხმარება, და დამაკავშირე, რომ ფასი, დიზაინი და დამზადების ვადა შევათანხმო.',
      ),
    ).toBe(false);
  });

  it('still keeps a named person at home (row 253)', () => {
    expect(goalReachesANamedPerson('დამაკავშირე ნინო ბერიძესთან')).toBe(true);
    expect(goalReachesANamedPerson('Ask Netai Test 1 to introduce me to Netai Test 2.')).toBe(true);
  });

  it('is nothing to do with a goal that does not ask to be connected', () => {
    expect(goalReachesANamedPerson('ბრენდირებული თერმოსები მჭირდება')).toBe(false);
  });
});
