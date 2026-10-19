import { otherBrandSpellings } from '../../brandAliases';
import { buildMeaningWordGroups, buildRawWordGroups } from '../transliterate';

const lower = (terms: readonly string[]): string[] => terms.map((t) => t.toLowerCase());

/** World Q (the tester's 68806, Q3 60334): friends saved him as „TBC SME lending head". */
describe('#1849 world Q: a company named in one spelling is searched in its others', () => {
  it('gives „თიბისი" its Latin spelling, and „TBC" its Georgian ones', () => {
    // „ტიბისი" folds to the same key as „თიბისი", so its terms are already there.
    expect(otherBrandSpellings('თიბისი')).toEqual(['TBC']);
    expect(otherBrandSpellings('TBC')).toEqual(['თიბისი', 'ტიბისი']);
    expect(otherBrandSpellings('ლიბერთი')).toEqual(['Liberty']);
  });

  it('keeps a Georgian case ending', () => {
    expect(otherBrandSpellings('თიბისის')).toContain('TBC');
    expect(otherBrandSpellings('თიბისიში')).toContain('TBC');
  });

  it('adds nothing for a word that names no company, nor a several-word name', () => {
    expect(otherBrandSpellings('ბანკი')).toEqual([]);
    expect(otherBrandSpellings('lawyer')).toEqual([]);
    expect(otherBrandSpellings('')).toEqual([]);
    expect(otherBrandSpellings('BOG')).toEqual([]);
  });

  it('reaches the search terms of the concept and name searches', () => {
    const [company] = buildMeaningWordGroups('თიბისი ბანკი');
    expect(lower(company)).toContain('tbc');
    const [byName] = buildRawWordGroups('თიბისი');
    expect(lower(byName)).toContain('tbc');
  });

  it('leaves a search with no company as it was', () => {
    expect(buildMeaningWordGroups('ბანკი')).toEqual(buildMeaningWordGroups('ბანკი'));
    expect(lower(buildMeaningWordGroups('ბანკი').flat())).not.toContain('tbc');
  });
});
