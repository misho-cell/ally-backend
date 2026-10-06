import { geoName } from '../georgianCase';

describe('geoName', () => {
  it.each([
    ['ნინო კახიძე', 'gen', 'ნინო კახიძის'],
    ['ნინო კახიძე', 'erg', 'ნინო კახიძემ'],
    ['ნინო კახიძე', 'dat', 'ნინო კახიძეს'],
    ['დათო წიკლაური', 'gen', 'დათო წიკლაურის'],
    ['დათო წიკლაური', 'erg', 'დათო წიკლაურმა'],
    ['დათო წიკლაური', 'on', 'დათო წიკლაურზე'],
    ['გიორგი ბერიძე', 'gen', 'გიორგი ბერიძის'],
    ['შალვა', 'erg', 'შალვამ'],
    ['მიშო', 'gen', 'მიშოს'],
    // #1750 (tester 40624): a given name whose -ი is its stem keeps it.
    ['გიორგი', 'dat', 'გიორგის'],
    ['გიორგი', 'gen', 'გიორგის'],
    ['გიორგი', 'erg', 'გიორგიმ'],
    ['გიორგი', 'on', 'გიორგიზე'],
    ['ირაკლი', 'dat', 'ირაკლის'],
    ['ლევანი', 'dat', 'ლევანს'],
  ] as const)('%s + %s → %s', (name, c, expected) => {
    expect(geoName(name, c)).toBe(expected);
  });

  it('falls back to the hyphen form for non-Georgian endings', () => {
    expect(geoName('John Smith', 'gen')).toBe('John Smith-ის');
    expect(geoName('Netai Guru', 'erg')).toBe('Netai Guru-მ');
  });
});
