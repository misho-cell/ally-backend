import { buildMeaningWordGroups } from '../tools/transliterate';

/**
 * Row 321 on the seat (Test 73, 30 Sep): four of Giorgi-shaped nine lawyers are
 * saved „… iuridiuli", and no lawyer query reached them. A lawyer word is now
 * one word with every spelling of its family.
 */
describe('one profession, three words', () => {
  it.each(['იურისტი', 'ადვოკატი', 'advokati', 'iuristi', 'lawyer'])(
    '„%s" reaches all three stems in one group',
    (query) => {
      const groups = buildMeaningWordGroups(query);
      expect(groups).toHaveLength(1);
      for (const stem of ['advokat', 'iurist', 'iuridiul', 'ადვოკატ', 'იურიდიულ']) {
        expect(groups[0]).toContain(stem);
      }
    },
  );

  it('keeps English members as written, without Georgian readings', () => {
    const [group] = buildMeaningWordGroups('ადვოკატი');
    expect(group).toContain('lawyer');
    expect(group.some((term) => term.includes('ლაწ'))).toBe(false);
  });

  it('leaves every other word alone', () => {
    const [group] = buildMeaningWordGroups('ბუღალტერი');
    expect(group.some((term) => term.startsWith('advokat'))).toBe(false);
  });
});
