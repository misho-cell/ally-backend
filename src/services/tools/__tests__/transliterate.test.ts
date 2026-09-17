import {
  hasGeorgian,
  georgianToLatin,
  buildSearchTerms,
  buildRawWordGroups,
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

describe('buildRawWordGroups — short and full first names (Answers-12 Part B)', () => {
  it('a full first name reaches the short form the contact was saved under, and back', () => {
    const groups = buildRawWordGroups('Bachana Khachidze');
    expect(groups).toHaveLength(2);
    expect(groups[0]).toContain('bachana');
    expect(groups[0]).toContain('bacho');
    // Spelling drift still applies to the surname: kh ↔ x.
    expect(groups[1]).toContain('xachidze');
    expect(buildRawWordGroups('Bacho')[0]).toContain('bachana');
  });

  it('a Georgian-script first name is looked up through its Latin form', () => {
    expect(buildRawWordGroups('ვასიკო')[0]).toContain('vasil');
  });

  it('never lets one word exceed the group cap', () => {
    for (const group of buildRawWordGroups('Giorgi Nikoloz Tamar')) {
      expect(group.length).toBeLessThanOrEqual(24);
    }
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

/**
 * Ticket 20 row 108 — the sentence's punctuation was becoming part of the regex.
 *
 * Splitting on whitespace alone made the last word of
 * „ქორწილის ფოტოგრაფი მჭირდება ქუთაისში." into „ქუთაისში." with its full stop,
 * and toWordStartPattern turned that into `\mქუთაისში\.` — a pattern that can
 * only match a tag containing the stop, so it matched nothing ever, while still
 * costing a full regex pass over 885,942 rows of the bridges' phonebooks.
 * Ninia's marketing sentence carried four such dead terms.
 */
describe('buildRawWordGroups drops the sentence’s punctuation', () => {
  it('strips a trailing full stop and comma', () => {
    const groups = buildRawWordGroups('ქორწილის ფოტოგრაფი მჭირდება ქუთაისში.');
    expect(groups.flat()).toContain('ქუთაისში');
    expect(groups.flat().some((t) => t.includes('.'))).toBe(false);
  });

  it('strips a leading quote or bracket too', () => {
    expect(buildRawWordGroups('„ფოტოგრაფი" (თბილისი)').flat()).toContain('ფოტოგრაფი');
  });

  it('KEEPS punctuation that is part of the word', () => {
    // The trim is the SENTENCE's punctuation. „c++" and „c#" are names of
    // things people put in a phonebook, and toWordStartPattern protects them
    // on purpose — trimming here would undo that one layer earlier.
    expect(buildRawWordGroups('c++').flat()).toContain('c++');
    expect(buildRawWordGroups('c#').flat()).toContain('c#');
  });

  it('drops a word that was nothing but punctuation', () => {
    expect(buildRawWordGroups('ფოტოგრაფი — თბილისი').flat()).not.toContain('');
  });
});
