import { firstNamesInBothScripts } from '../firstNameNamed';

/**
 * #1688 (the tester's 65607, run 2): the owner wrote „გიორგი მაისურაძეს" and
 * had saved him as „Giorgi Maisuradze". The plan wall's first-name check read
 * one script only, so the owner's instruction was not seen and a plan went
 * through instead of the ask.
 */
describe('the first names a line names', () => {
  it('are read in Georgian and in Latin letters', () => {
    expect(
      firstNamesInBothScripts('სთხოვე გიორგი მაისურაძეს, მაგიდა დამიჯავშნოს რესტორანში.'),
    ).toEqual(['გიორგი', 'giorgi']);
  });

  it('add nothing for a line with no first name', () => {
    expect(firstNamesInBothScripts('დამიჯავშნე მაგიდა რესტორანში')).toEqual([]);
  });
});
