import { georgianStem } from '../georgianStem';
import { buildMeaningWordGroups } from '../transliterate';

/**
 * 3105 (MASTER TEST RUN SE-036): „ნებართვა" and „მშენებლობა" missed a contact
 * tagged „მშენებლობის ნებართვები". The nominative's final „ა" is trimmed from a
 * long word, so it is the start of the plural and the genitive.
 */
describe('a long a-noun is searched by its stem', () => {
  it.each([
    ['ნებართვა', 'ნებართვ'],
    ['მშენებლობა', 'მშენებლობ'],
  ])('%s → %s, the start of its other forms', (word, stem) => {
    expect(georgianStem(word)).toBe(stem);
    expect(buildMeaningWordGroups(word)[0]).toContain(stem);
  });

  it('the forms the tag holds start with that stem', () => {
    expect('ნებართვები'.startsWith(georgianStem('ნებართვა'))).toBe(true);
    expect('მშენებლობის'.startsWith(georgianStem('მშენებლობა'))).toBe(true);
  });

  it('a short word keeps its „ა"', () => {
    expect(georgianStem('დედა')).toBe('დედა');
    expect(georgianStem('ბანკა')).toBe('ბანკა');
  });
});
