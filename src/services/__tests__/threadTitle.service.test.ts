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
