import { buildMeaningWordGroups, toWordStartPattern } from '../transliterate';

/**
 * Board #104 (plate F5): „ბახვა" asked in Georgian must reach a contact saved
 * in Latin as „Baxva", x for ხ. The second-circle search matches LOWER(label)
 * against these patterns; this pins that „baxva" is among them.
 */
describe('a Georgian query reaches the Latin x spelling of ხ', () => {
  it('carries baxva among the variants of ბახვა', () => {
    const [words] = buildMeaningWordGroups('ბახვა');
    expect(words).toEqual(expect.arrayContaining(['ბახვა', 'bakhva', 'baxva']));
  });

  it('turns it into a word-start pattern that matches the lowered label', () => {
    const [words] = buildMeaningWordGroups('ბახვა');
    const patterns = words.map((w) => toWordStartPattern(w));
    expect(patterns).toContain('\\mbaxva');
  });
});
