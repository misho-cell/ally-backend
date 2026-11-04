jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));

import { worldQuestionPrompt } from '../worldAnswer';

/** #8682: „who heads the Ministry of Health" was answered „which country?". */
describe('a question that needs a country (#8682)', () => {
  const prompt = worldQuestionPrompt('ვინ ხელმძღვანელობს ჯანდაცვის სამინისტროს?', 'ka');

  it('is answered for Georgia when it names none', () => {
    expect(prompt).toContain('answer for Georgia');
  });

  it('still never assumes a city (#8520)', () => {
    expect(prompt).toContain('do not assume one');
    expect(prompt).toContain('the city is needed');
  });
});

/** Tester 82738: the first web answer handed a stuck mortgage back to the owner. */
describe('the first web answer gives information, never orders to the owner', () => {
  it('says so to the web, whatever the editable brief says', () => {
    const prompt = worldQuestionPrompt('იპოთეკა 3 კვირაა გაჭედილია TBC-ში', 'ka');
    expect(prompt).toContain('Never tell the member to do something themselves');
    expect(prompt).toContain('their assistant acts for them');
  });
});
