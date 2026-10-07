import { speaksInFirstPerson } from '../firstPersonAnswer';

/** 2577 (D648): „<name>: მყავს ნანახი" read as Netai's own words. */
describe('aFirstPersonAnswerIsQuoted', () => {
  it('hears the helper’s own voice', () => {
    expect(speaksInFirstPerson('მყავს ნანახი')).toBe(true);
    expect(speaksInFirstPerson('კი, შემიძლია')).toBe(true);
    expect(speaksInFirstPerson('ვიცნობ, კარგი ბიჭია')).toBe(true);
    expect(speaksInFirstPerson('Yes, I know him')).toBe(true);
  });

  it('leaves an answer told in the third person', () => {
    expect(speaksInFirstPerson('იცნობს ბახვას და დაგაკავშირებს')).toBe(false);
    expect(speaksInFirstPerson('He knows Bakhva and will connect you')).toBe(false);
  });
});
