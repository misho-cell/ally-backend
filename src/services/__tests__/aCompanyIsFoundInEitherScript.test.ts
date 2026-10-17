import { withBrandAliases } from '../brandAliases';

/** 5446 (the tester's 63559): a case solved in Georgian was never found by an English ask. */
describe('a remembered case names its company in every common spelling', () => {
  it('adds the Latin name to a Georgian case, and the Georgian to an English one', () => {
    expect(withBrandAliases('თიბისის სესხი გაჭედილია')).toBe('თიბისის სესხი გაჭედილია TBC');
    expect(withBrandAliases('a loan stuck at TBC Bank')).toBe(
      'a loan stuck at TBC Bank თიბისი ტიბისი',
    );
  });

  it('adds nothing a case already says, or for a company it does not name', () => {
    expect(withBrandAliases('TBC თიბისი ტიბისი')).toBe('TBC თიბისი ტიბისი');
    expect(withBrandAliases('ბუღალტერი მჭირდება')).toBe('ბუღალტერი მჭირდება');
  });

  it('covers the other big banks too', () => {
    expect(withBrandAliases('საქართველოს ბანკში')).toContain('Bank of Georgia');
  });
});
