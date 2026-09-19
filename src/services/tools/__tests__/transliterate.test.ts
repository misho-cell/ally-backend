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
  // These two read „ქუთაის" and „ფოტოგრაფ" rather than „ქუთაისში" and
  // „ფოტოგრაფი" because the stem now stands in for the inflected word — see
  // the case-ending block below. The claim being made here is unchanged: the
  // punctuation is gone and the Georgian word survived it.
  it('strips a trailing full stop and comma', () => {
    const groups = buildRawWordGroups('ქორწილის ფოტოგრაფი მჭირდება ქუთაისში.');
    expect(groups.flat()).toContain('ქუთაის');
    expect(groups.flat().some((t) => t.includes('.'))).toBe(false);
  });

  it('strips a leading quote or bracket too', () => {
    expect(buildRawWordGroups('„ფოტოგრაფი" (თბილისი)').flat()).toContain('ფოტოგრაფ');
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

/**
 * Ticket 20 row 10 / row 104 — one Georgian case ending threw away the half of
 * the name that said WHICH person.
 *
 * MEASURED on Lika's own phonebook, 19 September. She has `Tiko Ratiani`
 * saved. She typed „თიკო რატიანს მისწერე":
 *
 *   „თიკო"     → tiko     → matches Tiko Ratiani
 *   „რატიანს"  → ratians  → matched nothing at all
 *
 * She was found by her first name and the surname was discarded by a single
 * letter, so the result came back having matched one query word of two —
 * which is what marks a row `approximate`.
 *
 * WHAT THIS CORRECTS, because I reported the opposite the night before. I told
 * the seat and Misho that Georgian→Latin transliteration was "the missing
 * piece" and that „თორნიკე აბულაძეს" resolved to nobody in Lika's phonebook.
 * Both were wrong. Transliteration has been in this file all along; run
 * against the product's own matcher rather than by comparing raw strings, the
 * term `tornike` matches six of her labels. I had compared the strings myself
 * instead of asking the code, which is the same mistake — one route to a fact
 * being closed, read as the fact not existing — that I had spent the evening
 * pointing out in someone else.
 *
 * The real gap was never the script. It was the ending.
 */
describe('a Georgian case ending no longer hides the surname', () => {
  it('reaches Tiko Ratiani from „რატიანს" — the live case', () => {
    const groups = buildRawWordGroups('თიკო რატიანს');
    const surname = groups[1];
    expect(surname).toContain('ratian');
    // `\mratian` is a prefix pattern, so it reaches Ratiani, Ratianis and the
    // Georgian spelling. Confirmed against her row: one alias, „Tiko Ratiani".
    expect(toWordStartPattern('ratian')).toBe('\\mratian');
  });

  it('reaches Abuladze from „აბულაძეს"', () => {
    expect(buildRawWordGroups('თორნიკე აბულაძეს')[1]).toContain('abuladze');
  });

  it('leaves a name that carries no ending exactly as it was', () => {
    // „თორნიკე" ends in ე, which is not a case ending, and must not be trimmed.
    expect(buildRawWordGroups('თორნიკე')[0]).toContain('tornike');
  });

  it('never touches a Latin query', () => {
    expect(buildRawWordGroups('tornike abuladze')[1]).toEqual(['abuladze']);
  });
});

/**
 * The cost side of the same change, and the reason it is written as a
 * substitution rather than an addition.
 *
 * Row 108 is about how much regex this search drags over 885,942 rows. A stem
 * is a PREFIX of the word it came from and toWordStartPattern anchors the
 * start only, so `\mkortsil` matches everything `\mkortsilis` matched. Where
 * that holds the longer term is redundant, and keeping both would pay twice to
 * fix one row at another's expense.
 */
describe('the stem replaces the inflected term instead of joining it', () => {
  it('keeps a Georgian sentence at the same number of terms', () => {
    // Ninia's sentence: four words, three variants each before this change.
    const groups = buildRawWordGroups('ქორწილის ფოტოგრაფი მჭირდება ქუთაისში');
    expect(groups.flat()).toHaveLength(13);
    expect(groups.flat()).not.toContain('ქორწილის');
    expect(groups.flat()).toContain('ქორწილ');
  });

  it('KEEPS both when the stem is short enough to be anchored at both ends', () => {
    // `bank` is four characters, so toWordStartPattern makes it `\mbank\M` —
    // an exact token, which is NOT a superset of `\mbanki`. Dropping the
    // longer one there would lose matches rather than fold them.
    const terms = buildRawWordGroups('ბანკი').flat();
    expect(terms).toContain('bank');
    expect(terms).toContain('banki');
  });

  it('every dropped term is still reachable through the stem that replaced it', () => {
    for (const word of ['ქუთაისში', 'ინჟინერი', 'ოსეფაშვილს', 'რატიანს']) {
      const terms = buildRawWordGroups(word).flat();
      const latin = terms.filter((t) => !/[ა-ჿ]/.test(t));
      // Whatever survived, a longer inflected Latin form of it is not also
      // present — the shorter prefix does that work now.
      for (const term of latin) {
        expect(latin.some((other) => other !== term && other.startsWith(term))).toBe(false);
      }
    }
  });
});
