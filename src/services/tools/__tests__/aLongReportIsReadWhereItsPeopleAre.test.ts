import { densestStart } from '../webSearch';

const PEOPLE = /Chief Executive Officer|Management Board/gu;

/** #5248 (the tester's 07:15Z): the annual report was read from its cover. */
describe('a long report is read where its people are', () => {
  it('starts at the busiest stretch, not at the contents page', () => {
    const contents = 'Contents: Management Board ... 120\n';
    const filler = 'Strategy and results. '.repeat(2000);
    const board =
      'Management Board\nA. Person, Chief Executive Officer\nB. Person, Deputy CEO\n' +
      'C. Person, Chief Executive Officer of JSC\nManagement Board members since 2026';
    const text = contents + filler + board + filler;
    const start = densestStart(text, PEOPLE, 8000);
    expect(start).toBeGreaterThan(contents.length);
    expect(text.slice(start, start + 8000)).toContain('A. Person, Chief Executive Officer');
  });

  it('starts at the beginning when the words are not there', () => {
    expect(densestStart('no people here', PEOPLE)).toBe(0);
  });
});
