import { introductionQueryWithoutAModel } from '../searchQuery.service';

/**
 * 3369 (the tester's 46731, 3 of 3): „დამაკავშირე <X>-თან" found no name, so
 * the opening second circle was handed the whole sentence. The name follows
 * the Georgian imperative, with its „-თან" ending cut off.
 */
describe('„დამაკავშირე <name>-თან" is read for the name alone', () => {
  it.each([
    ['დამაკავშირე თამაზ ნიმუშაძესთან.', 'თამაზ ნიმუშაძე'],
    ['დამაკავშირე ირაკლი ცდისძესთან.', 'ირაკლი ცდისძე'],
    ['დამაკავშირე ლევან ტესტელთან.', 'ლევან ტესტელი'],
  ])('%s → %s', (line, name) => {
    expect(introductionQueryWithoutAModel(line)).toBe(name);
  });
});
