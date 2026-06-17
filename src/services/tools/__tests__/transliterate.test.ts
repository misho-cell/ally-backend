import { hasGeorgian, georgianToLatin, buildSearchTerms } from '../transliterate';

describe('hasGeorgian', () => {
  it('returns true for Georgian text', () => {
    expect(hasGeorgian('პროგრამისტი')).toBe(true);
  });

  it('returns false for Latin text', () => {
    expect(hasGeorgian('programmer')).toBe(false);
  });

  it('returns true for mixed text', () => {
    expect(hasGeorgian('TBC ბანკი')).toBe(true);
  });

  it('returns false for empty string', () => {
    expect(hasGeorgian('')).toBe(false);
  });
});

describe('georgianToLatin', () => {
  it('transliterates basic Georgian word', () => {
    expect(georgianToLatin('მიშო')).toBe('misho');
  });

  it('transliterates პროგრამისტი to programisti', () => {
    expect(georgianToLatin('პროგრამისტი')).toBe('programisti');
  });

  it('passes through Latin text unchanged', () => {
    expect(georgianToLatin('hello')).toBe('hello');
  });

  it('handles multi-char mappings (შ→sh, ჯ→j, ხ→kh)', () => {
    expect(georgianToLatin('შ')).toBe('sh');
    expect(georgianToLatin('ჯ')).toBe('j');
    expect(georgianToLatin('ხ')).toBe('kh');
  });
});

describe('buildSearchTerms', () => {
  it('returns two terms for Georgian query', () => {
    const terms = buildSearchTerms('პროგრამისტი');
    expect(terms).toHaveLength(2);
    expect(terms[0]).toBe('პროგრამისტი');
    expect(terms[1]).toBe('programisti');
  });

  it('returns one term for Latin query', () => {
    const terms = buildSearchTerms('programmer');
    expect(terms).toHaveLength(1);
    expect(terms[0]).toBe('programmer');
  });

  it('lowercases the original term', () => {
    const terms = buildSearchTerms('PROGRAMMER');
    expect(terms[0]).toBe('programmer');
  });

  it('lowercases Georgian before transliterating', () => {
    const terms = buildSearchTerms('მიშო');
    expect(terms[0]).toBe('მიშო');
    expect(terms[1]).toBe('misho');
  });
});
