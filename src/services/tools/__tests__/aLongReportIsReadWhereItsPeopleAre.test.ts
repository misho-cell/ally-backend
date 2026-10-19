import { densestStart } from '../webSearch';
import { LEADERSHIP_SECTION_RE } from '../../roleWebSearch.service';

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

/** #5248 (the tester's 07:53Z): role words alone landed on the ESG committees. */
describe('the management list, not the committees', () => {
  it('starts at names beside titles', () => {
    const committees =
      'The ESG Committee meets quarterly. The Chief Executive Officer attends the Risk Committee; ' +
      'the Chief Executive Officer reports to the Board of Directors. '.repeat(40);
    const filler = 'Our strategy and results. '.repeat(1500);
    const list =
      'Management Board\nVakhtang Butskhrikidze, Chief Executive Officer\n' +
      'Giorgi Tkhelidze, Deputy CEO\nNino Example, Chief Financial Officer\n' +
      'Member of the Management Board Levan Example';
    const text = committees + filler + list + filler;
    const start = densestStart(text, LEADERSHIP_SECTION_RE, 8000);
    expect(text.slice(start, start + 8000)).toContain(
      'Vakhtang Butskhrikidze, Chief Executive Officer',
    );
  });
});
