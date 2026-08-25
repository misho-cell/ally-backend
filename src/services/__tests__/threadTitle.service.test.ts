jest.mock('../../db/postgres/client', () => ({ query: jest.fn(), __esModule: true }));

import { sanitizeTitle } from '../threadTitle.service';

describe('sanitizeTitle', () => {
  it('strips quotes and markdown decoration', () => {
    expect(sanitizeTitle('"ბინის ძებნა ვაკეში"')).toBe('ბინის ძებნა ვაკეში');
    expect(sanitizeTitle('**სანტექნიკის რჩევა**')).toBe('სანტექნიკის რჩევა');
  });

  it('caps at four words', () => {
    expect(sanitizeTitle('one two three four five six')).toBe('one two three four');
  });

  it('drops trailing punctuation and collapses whitespace', () => {
    expect(sanitizeTitle('  იურისტის   მოძებნა.  ')).toBe('იურისტის მოძებნა');
  });

  it('returns null for unusable output', () => {
    expect(sanitizeTitle('')).toBeNull();
    expect(sanitizeTitle('""')).toBeNull();
    expect(sanitizeTitle('.')).toBeNull();
  });

  it('caps overlong titles at 48 characters', () => {
    const long = 'ძალიანძალიანძალიანძალიანგრძელი სათაურისსიტყვები კიდევერთი მეოთხე';
    expect((sanitizeTitle(long) as string).length).toBeLessThanOrEqual(48);
  });
});

// Ticket 4 item 0C.7: six of nine live titles were malformed — the generator's
// own label inside the title, hard cuts mid-word, a Russian word in a Georgian
// title, and emoji. All string handling, locked here.
describe('sanitizeTitle — the 0C.7 malformations', () => {
  it('strips the "სათაური:" label in both wordings the generator produced', () => {
    expect(sanitizeTitle('სათაური: ანტარქტიდის პოლარული ლოგისტიკა')).toBe(
      'ანტარქტიდის პოლარული ლოგისტიკა',
    );
    expect(sanitizeTitle('საუბრის სათაური: საქართველოს ეროვნული ბანკი')).toBe(
      'საქართველოს ეროვნული ბანკი',
    );
    expect(sanitizeTitle('Title: deep sea fishing')).toBe('deep sea fishing');
  });

  it('never cuts mid-word — drops whole words at the cap instead', () => {
    const long = sanitizeTitle('ღრმაწყლოვანი თევზჭერა ნორვეგიაში ზამთარში');
    expect(long).not.toBeNull();
    // Every word in the result is complete (present in the source).
    for (const word of (long as string).split(' ')) {
      expect('ღრმაწყლოვანი თევზჭერა ნორვეგიაში ზამთარში'.split(' ')).toContain(word);
    }
  });

  it('rejects a title carrying Cyrillic — the model drifted, keep the provisional', () => {
    expect(sanitizeTitle('იაპონურად говорящ იურისტი')).toBeNull();
  });

  it('strips emoji instead of publishing them', () => {
    expect(sanitizeTitle('პინგი ქსელში 🏓 უბრალოდ')).toBe('პინგი ქსელში უბრალოდ');
  });
});

// Live-caught 25 Aug: 6 real titles ended in a markdown-style "---"
// separator the cheap model wrote alongside the actual words — hyphens are
// legitimately allowed (a real title word can contain one), so this
// survived untouched and counted as one of the 4 kept words.
describe('sanitizeTitle — the 25 Aug markdown-separator malformation', () => {
  it('drops a trailing "---" instead of keeping it as the 4th word', () => {
    expect(sanitizeTitle('განქორწინების იურიდიული დახმარება ---')).toBe(
      'განქორწინების იურიდიული დახმარება',
    );
  });

  it('drops a "---" in the middle, keeping the real words around it', () => {
    expect(sanitizeTitle('ბათუმის ფოტოგრაფი --- კითხვა')).toBe('ბათუმის ფოტოგრაფი კითხვა');
  });

  it('a real hyphenated word is untouched — only a token with NO letters at all is dropped', () => {
    expect(sanitizeTitle('კარგო-ტიპის სატვირთო მანქანა')).toBe('კარგო-ტიპის სატვირთო მანქანა');
  });
});
