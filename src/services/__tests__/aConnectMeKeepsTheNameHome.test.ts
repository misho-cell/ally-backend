import { goalAsksToReachAPerson } from '../openingSearch.service';

/**
 * 3369 (MASTER TEST RUN, 2 of 2): „დამაკავშირე <own contact>-თან." sent the
 * whole sentence, the name with it, to the web and the second circle.
 */
describe('„connect me with <person>" keeps the name at home', () => {
  it.each([
    'დამაკავშირე ნინო ბერიძესთან.',
    'დაგვაკავშირე გიორგი ტესტაძესთან',
    'Put me in touch with Nino.',
  ])('%s', (line) => {
    expect(goalAsksToReachAPerson(line)).toBe(true);
  });

  it('a trade named with it is still searched', () => {
    expect(goalAsksToReachAPerson('დამაკავშირე კარგ იურისტთან')).toBe(false);
  });
});
