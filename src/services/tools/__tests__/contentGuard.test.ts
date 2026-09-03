import { isUnsafeContent, isUnsafeQuery } from '../contentGuard';

describe('contentGuard — the ugly/illegal filter on T15 pointers (ticket 9 task 32.2)', () => {
  it.each([
    ['ის ქურდია', 'a criminal accusation in Georgian'],
    ['is qurdia da taglitia', 'the same typed in Latin letters'],
    ['он вор', 'the same in Russian'],
    ['known scammer', 'in English'],
    ['ბოზი', 'a sexual insult'],
    ['ლოთია', 'stigma about drinking'],
    ['bozi ari', 'a short Latin word matched whole, not as a fragment'],
  ])('%s is unsafe (%s)', (text) => {
    expect(isUnsafeContent(text)).toBe(true);
  });

  it.each([
    'კარგი ხელოსანი, აუდის სპეციალისტი',
    'works with German companies on export deals',
    'Kurdish translator', // an ethnonym, not an accusation
    'ავტო დილერი', // somebody's job
    'works at Bozkurt LLC', // a company, not a slur
    'Воробьев Сергей', // a surname that opens with вор
    '',
  ])('leaves ordinary text alone: %s', (text) => {
    expect(isUnsafeContent(text)).toBe(false);
  });

  it('punctuation and casing do not get anything past it', () => {
    expect(isUnsafeContent('Q-U... no')).toBe(false);
    expect(isUnsafeContent('ის, ქურდ-ი!')).toBe(true);
    expect(isUnsafeContent('THIEF')).toBe(true);
  });

  it('judges the whole query, so a slur split across words is still caught', () => {
    expect(isUnsafeQuery(['ვინ', 'არის', 'ქურდი'])).toBe(true);
    expect(isUnsafeQuery(['ვინ', 'იცის', 'გერმანული'])).toBe(false);
  });
});
