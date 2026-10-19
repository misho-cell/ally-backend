import { aFinalCaseStem, buildMeaningWordGroups, toWordStartPattern } from '../transliterate';

const matches = (query: string, label: string): boolean =>
  buildMeaningWordGroups(query)[0].some((term) =>
    new RegExp(
      toWordStartPattern(term).replace(/\\m/gu, '(?<![\\p{L}])').replace(/\\M/gu, '(?![\\p{L}])'),
      'iu',
    ).test(label),
  );

/** The tester's 68863: „მერიის არქიტექტურის სამსახურის უფროსი" and a search for „მერია". */
describe('#1849: a word ending in „ა" reaches its genitive in a label', () => {
  it('gives the „ი" stem of a Georgian noun ending in „ა"', () => {
    expect(aFinalCaseStem('მერია')).toBe('მერიი');
    expect(aFinalCaseStem('ბანკი')).toBeNull();
    expect(aFinalCaseStem('და')).toBeNull();
    expect(aFinalCaseStem('meria')).toBeNull();
  });

  it('finds „მერიის …" and „მერიით" for „მერია", and still „მერიაში"', () => {
    expect(matches('მერია', 'მერიის არქიტექტურის სამსახურის უფროსი')).toBe(true);
    expect(matches('მერია', 'მერიით დაინტერესებული')).toBe(true);
    expect(matches('მერია', 'მერიაში მუშაობს')).toBe(true);
  });

  it('does not reach an unrelated word', () => {
    expect(matches('მერია', 'მერი ბერიძე')).toBe(false);
  });
});
