import { georgianStem } from '../georgianStem';

describe('georgianStem — one query word must reach every case it was stored in', () => {
  it('strips the case ending that hid a real fact (1 Sep, live)', () => {
    // Stored: "ეძებს ინვესტორს". Searched: "ინვესტორი". Neither contains the
    // other, so the LIKE found nothing until both reduced to the same stem.
    expect(georgianStem('ინვესტორი')).toBe('ინვესტორ');
    expect(georgianStem('ინვესტორს')).toBe('ინვესტორ');
    expect(georgianStem('ინვესტორმა')).toBe('ინვესტორ');
    expect(georgianStem('ინვესტორის')).toBe('ინვესტორ');
  });

  it('handles plural and postposition endings, longest first', () => {
    expect(georgianStem('იურისტები')).toBe('იურისტ');
    expect(georgianStem('იურისტებს')).toBe('იურისტ');
    expect(georgianStem('თბილისში')).toBe('თბილის');
    expect(georgianStem('კომპანიებისთვის')).toBe('კომპანი');
  });

  it('leaves a word alone when trimming would leave too short a stem', () => {
    // A 2-3 letter stem matches half the database — the guard keeps the word.
    expect(georgianStem('ხელი')).toBe('ხელი');
    expect(georgianStem('ძმას')).toBe('ძმას');
  });

  it('trims down to a four-letter stem, which is deliberate', () => {
    // "ბანკ" reaches ბანკი / ბანკის / ბანკირი — all genuinely the same topic.
    expect(georgianStem('ბანკი')).toBe('ბანკ');
    expect(georgianStem('ექიმი')).toBe('ექიმ');
  });

  it('never touches a non-Georgian word', () => {
    expect(georgianStem('investor')).toBe('investor');
    expect(georgianStem('CFO')).toBe('CFO');
    expect(georgianStem('')).toBe('');
  });

  it('always returns a PREFIX of the input — recall can only grow', () => {
    for (const word of ['ინვესტორს', 'იურისტები', 'თბილისში', 'ბანკი', 'investor']) {
      expect(word.startsWith(georgianStem(word))).toBe(true);
    }
  });
});
