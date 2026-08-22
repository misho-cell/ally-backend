import {
  hasGeorgian,
  georgianToLatin,
  buildSearchTerms,
  toWordStartPattern,
} from '../transliterate';

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
  it('returns the original plus its transliteration for a Georgian query', () => {
    const terms = buildSearchTerms('პროგრამისტი');
    expect(terms[0]).toBe('პროგრამისტი');
    expect(terms).toContain('programisti');
    // p↔f drift (task 41): ფ is typed as "p" in most real names.
    expect(terms).toContain('frogramisti');
  });

  it('returns the original plus drift variants for a Latin query', () => {
    const terms = buildSearchTerms('programmer');
    expect(terms[0]).toBe('programmer');
    expect(terms).toContain('frogrammer');
  });

  it('bridges the two scripts for ფ-names: ფარქოსაძე reaches Parkosadze', () => {
    const terms = buildSearchTerms('ფარქოსაძე');
    expect(terms).toContain('parkosadze');
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

  it('adds a drift variant for the gh↔r pair (ბუღალტერი)', () => {
    const terms = buildSearchTerms('ბუღალტერი');
    // canonical "bughalteri" plus the "r"-for-ღ drift "buralteri"
    expect(terms).toContain('bughalteri');
    expect(terms).toContain('buralteri');
  });

  it('adds drift variants for a Latin query (q↔k, ts↔c)', () => {
    expect(buildSearchTerms('qutaisi')).toContain('kutaisi'); // ყ/ქ typed q ↔ k
    const ts = buildSearchTerms('tsalka');
    expect(ts).toContain('tsalka');
    expect(ts).toContain('calka'); // ც/წ "ts" ↔ "c"
    expect(ts.length).toBeLessThanOrEqual(8);
  });

  it('folds k↔q both ways so a "k" query reaches the "q" spelling (Chikava↔Chiqava)', () => {
    expect(buildSearchTerms('chikava')).toContain('chiqava');
    expect(buildSearchTerms('chiqava')).toContain('chikava');
  });

  it('folds x↔kh↔h for the ხ sound', () => {
    expect(buildSearchTerms('sokhumi')).toContain('soxumi'); // kh → x
    expect(buildSearchTerms('sokhumi')).toContain('sohumi'); // kh → h (drop k)
    expect(buildSearchTerms('soxumi')).toContain('sokhumi'); // x → kh
  });

  it('folds interchangeable Armenian endings (ants/iants/yants)', () => {
    const terms = buildSearchTerms('petrosyants');
    expect(terms).toContain('petrosants');
    expect(terms).toContain('petrosiants');
  });

  it('never exceeds the term cap', () => {
    expect(buildSearchTerms('katskhatskhi').length).toBeLessThanOrEqual(12);
  });

  it('returns nothing for a blank query', () => {
    expect(buildSearchTerms('   ')).toEqual([]);
  });
});

describe('toWordStartPattern', () => {
  it('anchors the term to a word start', () => {
    // 4 chars -> exact token (ticket 6 close §6: short prefixes are noise).
    expect(toWordStartPattern('nasa')).toBe('\\mnasa\\M');
  });

  it('escapes regex metacharacters', () => {
    expect(toWordStartPattern('c++')).toBe('\\mc\\+\\+');
  });
});
