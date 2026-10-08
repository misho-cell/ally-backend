import { isAFragment } from '../askEditor.service';

/** GP-073 (request 4951): the introduction's text was stored as „ამირან საცდელი-". */
describe('aCutReasonIsNotStored', () => {
  it('sees a rewrite cut off after the name', () => {
    expect(isAFragment('მინდა გავიცნო თამთა, თანამშრომლობაზე', 'ამირან საცდელი-')).toBe(true);
  });

  it('sees a rewrite that keeps too little of the reason', () => {
    expect(
      isAFragment(
        'მინდა გავიცნო თამთა, რადგან საერთო პროექტზე ვფიქრობ და რჩევა მჭირდება',
        'ამირანს სურს',
      ),
    ).toBe(true);
  });

  it('accepts a whole third-person sentence', () => {
    expect(
      isAFragment(
        'მინდა გავიცნო თამთა გამოგონილი',
        'ამირან საცდელს სურს გაიცნოს თამთა გამოგონილი.',
      ),
    ).toBe(false);
  });
});
