import { buildMeaningWordGroups, buildRawWordGroups } from '../transliterate';

/**
 * 3598 (QA-020 / QA-042, 2 of 2): "Ask Nana Satsdeladze if she knows a good
 * notary." about „ნანა საცდელაძე" sent nothing — the Latin „Nana" had no
 * reading „ნანა", and a name search needs every word.
 */
describe('a short first name typed in Latin reaches its Georgian spelling (3598)', () => {
  it.each([
    ['Nana', 'ნანა'],
    ['Keti', 'ქეთი'],
    ['Eka', 'ეკა'],
    ['Gia', 'გია'],
  ])('„%s" reaches „%s"', (latin, georgian) => {
    expect(buildRawWordGroups(latin)[0]).toContain(georgian);
  });

  it('the surname still reaches its own Georgian spellings', () => {
    expect(buildRawWordGroups('Nana Satsdeladze')[1]).toContain('საცდელაძე');
  });

  it('a concept search keeps its floor: a short guessed word stays out', () => {
    expect(buildMeaningWordGroups('bar').flat()).not.toContain('ბარ');
  });
});
