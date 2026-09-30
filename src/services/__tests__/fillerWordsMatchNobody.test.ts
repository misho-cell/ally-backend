import { buildMeaningWordGroups, buildRawWordGroups } from '../tools/transliterate';

/**
 * Row 289: „real estate issues and disputes" tied Lika to real estate — a
 * phrase matches word by word, and „and"/„issues" are on countless tags.
 */
describe('a concept phrase matches on its meaning words', () => {
  const firsts = (groups: string[][]): string[] => groups.map((g) => g[0]);

  it("drops the filler from the seat's phrase", () => {
    expect(firsts(buildMeaningWordGroups('real estate issues and disputes'))).toEqual([
      'real',
      'estate',
      'dispute',
    ]);
  });

  it('drops Georgian filler too', () => {
    const words = firsts(buildMeaningWordGroups('კარგი ადვოკატი და ნოტარიუსი'));
    expect(words).not.toContain('და');
    expect(words).not.toContain('კარგი');
    expect(words.length).toBe(2);
  });

  it('keeps everything when the phrase is nothing but filler', () => {
    expect(buildMeaningWordGroups('issues and problems').length).toBe(3);
  });

  it('leaves name searches untouched — a name is never filler', () => {
    expect(buildRawWordGroups('Ana and Nino').length).toBe(3);
  });
});
