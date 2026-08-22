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
  ] as const)('%s + %s → %s', (name, c, expected) => {
    expect(geoName(name, c)).toBe(expected);
  });

  it('falls back to the hyphen form for non-Georgian endings', () => {
    expect(geoName('John Smith', 'gen')).toBe('John Smith-ის');
    expect(geoName('Netai Guru', 'erg')).toBe('Netai Guru-მ');
  });
});
