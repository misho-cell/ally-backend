import { distilIntroductionLocally, withoutWithEnding } from '../searchQuery.service';

/** 3369, the tester's 47027: „…ლევან ტესტელთან" was searched as „ტესტელ". */
describe('„-თან" comes off a name, and its „ი" comes back', () => {
  it('gives the saved name back', () => {
    expect(withoutWithEnding('ტესტელთან')).toBe('ტესტელი');
    expect(withoutWithEnding('ნიმუშაძესთან')).toBe('ნიმუშაძე');
    expect(withoutWithEnding('ნინოსთან')).toBe('ნინო');
    expect(withoutWithEnding('ტესტელი')).toBe('ტესტელი');
  });

  it('the opening search looks for the whole saved name', () => {
    expect(distilIntroductionLocally('დამაკავშირე ლევან ტესტელთან').query).toBe('ლევან ტესტელი');
  });
});
