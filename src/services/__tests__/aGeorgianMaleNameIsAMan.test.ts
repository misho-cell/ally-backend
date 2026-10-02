import { genderOfFirstName, NameGender, withNameGenders } from '../nameGender';

/** Team task #69: ten common Georgian male first names are all men, in either script. */
describe('the gender a common Georgian first name gives', () => {
  it('reads ten common male names as men', () => {
    const names = [
      'გიორგი',
      'ლევან',
      'ირაკლი',
      'ზურაბ',
      'ლაშა',
      'Tornike',
      'Davit',
      'Beka',
      'Gia',
      'Mamuka',
    ];
    for (const name of names) expect(genderOfFirstName(`${name} Kapanadze`)).toBe(NameGender.Male);
  });

  it('reads common female names as women', () => {
    expect(genderOfFirstName('ნინო ბერიძე')).toBe(NameGender.Female);
    expect(genderOfFirstName('Ketevan')).toBe(NameGender.Female);
  });

  it('gives nothing for a name it cannot be sure of', () => {
    expect(genderOfFirstName('Sandrine')).toBeNull();
    expect(genderOfFirstName('ბიძაშვილი')).toBeNull();
    expect(genderOfFirstName('💙')).toBeNull();
    expect(genderOfFirstName(null)).toBeNull();
  });
});

describe('a search result', () => {
  it('marks only the rows it is sure of, and says not to guess the rest', () => {
    const out = withNameGenders({
      found: true,
      results: [{ name: 'გელა თოდუა' }, { name: null, saved_as: 'Mzia TBC' }, { name: 'Jordan' }],
    }) as { results: Array<Record<string, unknown>>; gender_rule: string };

    expect(out.results[0].gender).toBe('male');
    expect(out.results[1].gender).toBe('female');
    expect(out.results[2]).not.toHaveProperty('gender');
    expect(out.gender_rule).toMatch(/do not guess/);
  });

  it('leaves an empty or shapeless result alone', () => {
    expect(withNameGenders({ found: false, results: [] })).toEqual({ found: false, results: [] });
    expect(withNameGenders(null)).toBeNull();
  });
});
